package com.hospital.queue.controller;

import com.hospital.queue.model.*;
import com.hospital.queue.repository.*;
import com.hospital.queue.security.JwtTokenProvider;
import com.hospital.queue.service.AuditLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AuthControllerTest {

    @Mock private AuditLogService auditLogService;
    @Mock private UserRepository userRepository;
    @Mock private HospitalRepository hospitalRepository;
    @Mock private DoctorRepository doctorRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private LoginAttemptRepository loginAttemptRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private com.hospital.queue.security.TenantSecurityService tenantSecurityService;

    private AuthController authController;

    @BeforeEach
    void setUp() {
        authController = new AuthController(
                auditLogService, userRepository, hospitalRepository, doctorRepository,
                passwordEncoder, tokenProvider, loginAttemptRepository, passwordResetTokenRepository,
                tenantSecurityService
        );
    }

    @Test
    void testLoginSuccess() {
        com.hospital.queue.dto.AuthDtos.LoginRequest req = new com.hospital.queue.dto.AuthDtos.LoginRequest();
        req.setEmail("test@example.com");
        req.setPassword("password123");

        User user = new User();
        user.setId("u1");
        user.setEmail("test@example.com");
        user.setPassword("hashedPassword");
        user.setName("Test User");
        user.setRole(Role.PATIENT);
        user.setHospitalId("h1");
        user.setActive(true);

        when(loginAttemptRepository.countByEmailAndAttemptTimeAfter(anyString(), any(LocalDateTime.class))).thenReturn(0L);
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "hashedPassword")).thenReturn(true);
        when(hospitalRepository.findById("h1")).thenReturn(Optional.of(new Hospital()));
        when(tokenProvider.generateToken(anyString(), anyString(), anyString(), anyString())).thenReturn("jwt-token");

        ResponseEntity<?> response = authController.login(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(loginAttemptRepository).deleteByEmail("test@example.com");
    }

    @Test
    void testLoginInvalidCredentials() {
        com.hospital.queue.dto.AuthDtos.LoginRequest req = new com.hospital.queue.dto.AuthDtos.LoginRequest();
        req.setEmail("test@example.com");
        req.setPassword("wrongpassword");

        User user = new User();
        user.setId("u1");
        user.setEmail("test@example.com");
        user.setPassword("hashedPassword");
        user.setActive(true);

        when(loginAttemptRepository.countByEmailAndAttemptTimeAfter(anyString(), any(LocalDateTime.class))).thenReturn(0L);
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrongpassword", "hashedPassword")).thenReturn(false);

        ResponseEntity<?> response = authController.login(req);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Invalid credentials", response.getBody());
        verify(loginAttemptRepository).save(any(LoginAttempt.class));
    }

    @Test
    void testRegisterAlwaysSetsPatientRole() {
        com.hospital.queue.dto.AuthDtos.RegisterRequest req = new com.hospital.queue.dto.AuthDtos.RegisterRequest();
        req.setName("Hacker");
        req.setEmail("hacker@test.com");
        req.setPassword("password123");
        req.setRole(Role.HOSPITAL_ADMIN); // Trying to self-assign ADMIN

        when(userRepository.findByEmail("hacker@test.com")).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenReturn("encoded");
        when(tokenProvider.generateToken(anyString(), anyString(), anyString(), any())).thenReturn("jwt");

        User savedUser = new User();
        savedUser.setId("u2");
        savedUser.setName("Hacker");
        savedUser.setEmail("hacker@test.com");
        savedUser.setRole(Role.PATIENT); // Should be overridden to PATIENT
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            assertEquals(Role.PATIENT, u.getRole(), "Public registration must always set PATIENT role");
            u.setId("u2");
            return u;
        });

        ResponseEntity<?> response = authController.register(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @SuppressWarnings("unchecked")
    void testForgotPasswordDoesNotLeakToken() {
        AuthController.ForgotPasswordRequest req = new AuthController.ForgotPasswordRequest();
        req.setEmail("test@example.com");

        User user = new User();
        user.setId("u1");
        user.setEmail("test@example.com");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        ResponseEntity<?> response = authController.forgotPassword(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        // FIX #3 VERIFICATION: The response body must NOT contain a "token" key
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertNotNull(body);
        assertFalse(body.containsKey("token"), "Response must NOT contain the reset token — this was a critical security vulnerability");
        assertTrue(body.containsKey("message"));
    }

    @Test
    void testBruteForceProtectionBlocksAfterMaxAttempts() {
        com.hospital.queue.dto.AuthDtos.LoginRequest req = new com.hospital.queue.dto.AuthDtos.LoginRequest();
        req.setEmail("victim@test.com");
        req.setPassword("anything");

        // Simulate 5 recent failures in MongoDB
        when(loginAttemptRepository.countByEmailAndAttemptTimeAfter(anyString(), any(LocalDateTime.class))).thenReturn(5L);

        ResponseEntity<?> response = authController.login(req);

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, response.getStatusCode());
        // Should not even attempt to look up the user
        verify(userRepository, never()).findByEmail(anyString());
    }
}
