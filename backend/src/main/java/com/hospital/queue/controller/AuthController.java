package com.hospital.queue.controller;

import com.hospital.queue.dto.AuthDtos.*;
import com.hospital.queue.model.*;
import com.hospital.queue.repository.*;
import com.hospital.queue.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import jakarta.validation.Valid;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.security.UserPrincipal;
import com.hospital.queue.service.AuditLogService;
import lombok.Data;

@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    // BUG 31 FIX (v2): Brute-force protection — max 5 failed attempts per email per 15 minutes.
    // Now persisted in MongoDB (survives restarts, works across multiple instances).
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long WINDOW_MINUTES = 15;

    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final LoginAttemptRepository loginAttemptRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final TenantSecurityService tenantSecurityService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        String email = request.getEmail().toLowerCase();

        // BUG 31 FIX (v2): Check brute-force rate limit from MongoDB
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(WINDOW_MINUTES);
        long recentFailures = loginAttemptRepository.countByEmailAndAttemptTimeAfter(email, cutoff);
        if (recentFailures >= MAX_FAILED_ATTEMPTS) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Too many failed login attempts. Please try again in 15 minutes.");
        }

        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            recordFailure(email);
            return ResponseEntity.badRequest().body("Invalid credentials");
        }

        User user = userOpt.get();
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            recordFailure(email);
            return ResponseEntity.badRequest().body("Invalid credentials");
        }

        if (!user.isActive()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Account is deactivated. Please contact support.");
        }

        // Successful login — clear failure records so user isn't penalised
        loginAttemptRepository.deleteByEmail(email);

        // Multi-tenant check for non-patients
        if (user.getRole() != Role.PATIENT && user.getRole() != Role.SUPER_ADMIN) {
            if (request.getHospitalId() != null && !request.getHospitalId().equals(user.getHospitalId())) {
                return ResponseEntity.status(403).body("Access denied: User does not belong to specified hospital.");
            }
        }

        String hospitalName = "System Platform";
        if (user.getHospitalId() != null) {
            hospitalName = hospitalRepository.findById(user.getHospitalId())
                    .map(Hospital::getName)
                    .orElse("Unknown Hospital");
        }

        String token = tokenProvider.generateToken(
                user.getId(),
                user.getEmail(),
                user.getRole().name(),
                user.getHospitalId()
        );

        auditLogService.log(user.getHospitalId(), user.getId(), "LOGIN", "User logged in: " + user.getEmail());

        return ResponseEntity.ok(new AuthResponse(
                token,
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name(),
                user.getHospitalId(),
                hospitalName
        ));
    }

    /** Records a failed login attempt in MongoDB. */
    private void recordFailure(String email) {
        LoginAttempt attempt = new LoginAttempt();
        attempt.setEmail(email);
        attempt.setAttemptTime(LocalDateTime.now());
        try {
            loginAttemptRepository.save(attempt);
        } catch (Exception e) {
            log.error("Failed to record login attempt for {}: {}", email, e.getMessage());
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            return ResponseEntity.badRequest().body("Email is already registered.");
        }

        String hospitalId = request.getHospitalId();
        if ((hospitalId == null || hospitalId.trim().isEmpty()) && request.getHospitalCode() != null && !request.getHospitalCode().trim().isEmpty()) {
            Optional<Hospital> hospOpt = hospitalRepository.findByCode(request.getHospitalCode().trim());
            if (hospOpt.isPresent()) {
                hospitalId = hospOpt.get().getId();
            } else {
                return ResponseEntity.badRequest().body("Invalid hospital code: " + request.getHospitalCode());
            }
        }

        User user = new User();
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setPhone(request.getPhone());
        // Public registration ONLY allows Role.PATIENT (prevents self-assignment of ADMIN/STAFF roles)
        user.setRole(Role.PATIENT);
        user.setHospitalId(hospitalId);
        user.setActive(true);

        User saved;
        try {
            saved = userRepository.save(user);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return ResponseEntity.badRequest().body("Email is already registered.");
        }

        String hospitalName = saved.getHospitalId() != null ?
                hospitalRepository.findById(saved.getHospitalId()).map(Hospital::getName).orElse("") : "";

        String token = tokenProvider.generateToken(
                saved.getId(),
                saved.getEmail(),
                saved.getRole().name(),
                saved.getHospitalId()
        );

        return ResponseEntity.ok(new AuthResponse(
                token,
                saved.getId(),
                saved.getName(),
                saved.getEmail(),
                saved.getRole().name(),
                saved.getHospitalId(),
                hospitalName
        ));
    }

    @Data
    public static class ForgotPasswordRequest {
        @jakarta.validation.constraints.NotBlank
        @jakarta.validation.constraints.Email
        private String email;
    }

    @Data
    public static class ResetPasswordRequest {
        @jakarta.validation.constraints.NotBlank
        private String token;

        @jakarta.validation.constraints.NotBlank
        @jakarta.validation.constraints.Size(min = 6, max = 100, message = "Password must be between 6 and 100 characters")
        private String password;
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        String email = req.getEmail().toLowerCase();
        Optional<User> userOpt = userRepository.findByEmail(email);

        // FIX #3: Always return the same generic message regardless of whether the email exists.
        // This prevents user enumeration attacks.
        String genericMessage = "If an account with that email exists, a password reset link has been generated. Check server console logs for the reset token.";

        if (userOpt.isEmpty()) {
            return ResponseEntity.ok(java.util.Map.of("message", genericMessage));
        }

        // Delete any existing reset tokens for this email
        passwordResetTokenRepository.deleteByEmail(email);

        String tokenStr = UUID.randomUUID().toString();
        PasswordResetToken resetToken = new PasswordResetToken();
        resetToken.setEmail(email);
        resetToken.setToken(tokenStr);
        resetToken.setExpiryTime(LocalDateTime.now().plusMinutes(WINDOW_MINUTES));
        passwordResetTokenRepository.save(resetToken);

        // FIX #3: Token is ONLY printed to server console — NEVER returned in the response body.
        log.info("=================================================");
        log.info("PASSWORD RESET REQUEST");
        log.info("Email: {}", email);
        log.info("Reset Token: {}", tokenStr);
        log.info("Reset Link (Admin): http://localhost:3000/login.html?token={}", tokenStr);
        log.info("Reset Link (Patient): http://localhost:3001/?token={}", tokenStr);
        log.info("=================================================");

        return ResponseEntity.ok(java.util.Map.of("message", genericMessage));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        Optional<PasswordResetToken> tokenOpt = passwordResetTokenRepository.findByToken(req.getToken());
        if (tokenOpt.isEmpty()) {
            return ResponseEntity.badRequest().body("Invalid password reset token.");
        }

        PasswordResetToken resetToken = tokenOpt.get();
        if (LocalDateTime.now().isAfter(resetToken.getExpiryTime())) {
            passwordResetTokenRepository.deleteByToken(req.getToken());
            return ResponseEntity.badRequest().body("Password reset token has expired.");
        }

        Optional<User> userOpt = userRepository.findByEmail(resetToken.getEmail());
        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body("User no longer exists.");
        }

        User user = userOpt.get();
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        userRepository.save(user);

        passwordResetTokenRepository.deleteByToken(req.getToken());
        auditLogService.log(user.getHospitalId(), user.getId(), "PASSWORD_RESET", "Password was reset for user: " + user.getEmail());

        return ResponseEntity.ok(java.util.Map.of("message", "Password reset successfully. You can now login with your new password."));
    }

    @PostMapping("/push-token")
    public ResponseEntity<?> registerPushToken(@RequestBody java.util.Map<String, String> body) {
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();
        String pushToken = body.get("pushToken");
        if (pushToken != null && !pushToken.trim().isEmpty()) {
            User user = userRepository.findById(currentUser.getUserId()).orElse(null);
            if (user != null) {
                user.setPushToken(pushToken.trim());
                userRepository.save(user);
                log.info("Registered Expo Push Token for user {}: {}", user.getEmail(), pushToken);
                return ResponseEntity.ok(java.util.Map.of("message", "Push token registered successfully."));
            }
        }
        return ResponseEntity.badRequest().body("Invalid pushToken.");
    }

    @PutMapping("/profile/language")
    public ResponseEntity<?> updateLanguagePreference(@RequestBody java.util.Map<String, String> body) {
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();
        String lang = body.get("language");
        if (lang != null && (lang.equalsIgnoreCase("ta") || lang.equalsIgnoreCase("en"))) {
            User user = userRepository.findById(currentUser.getUserId()).orElse(null);
            if (user != null) {
                user.setPreferredLanguage(lang.toLowerCase());
                userRepository.save(user);
                log.info("Updated language preference for user {}: {}", user.getEmail(), user.getPreferredLanguage());
                return ResponseEntity.ok(java.util.Map.of("message", "Language preference updated.", "language", user.getPreferredLanguage()));
            }
        }
        return ResponseEntity.badRequest().body("Invalid language. Supported: 'ta' (Tamil), 'en' (English).");
    }
}
