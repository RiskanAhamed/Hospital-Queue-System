package com.hospital.queue.security;

import com.hospital.queue.model.Hospital;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

@Component
@RequiredArgsConstructor
public class TenantSecurityService {

    private final HospitalRepository hospitalRepository;

    public UserPrincipal getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof UserPrincipal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized access: Missing or invalid authentication token.");
        }
        return (UserPrincipal) auth.getPrincipal();
    }

    public void validateTenantAccess(String targetHospitalId, Role... allowedRoles) {
        UserPrincipal user = getCurrentUser();

        // 1. Role-based Access Control Check
        if (allowedRoles != null && allowedRoles.length > 0) {
            boolean roleMatched = false;
            for (Role allowedRole : allowedRoles) {
                if (allowedRole.name().equalsIgnoreCase(user.getRole())) {
                    roleMatched = true;
                    break;
                }
            }
            if ("SUPER_ADMIN".equalsIgnoreCase(user.getRole())) {
                roleMatched = true;
            }
            if (!roleMatched) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Insufficient role permissions.");
            }
        }

        // 2. Multi-Tenant Isolation Check (SUPER_ADMIN can access any tenant)
        if ("SUPER_ADMIN".equalsIgnoreCase(user.getRole())) {
            return;
        }

        if (targetHospitalId == null || targetHospitalId.trim().isEmpty()) {
            return;
        }

        String userHospitalId = user.getHospitalId();
        if (userHospitalId == null || userHospitalId.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: User does not belong to any hospital tenant.");
        }

        // Direct ID match
        if (userHospitalId.equals(targetHospitalId)) {
            return;
        }

        // Check if userHospitalId is Mongo ID and targetHospitalId is tenant code (e.g. HOSP001)
        Optional<Hospital> userHospOpt = hospitalRepository.findById(userHospitalId);
        if (userHospOpt.isPresent() && userHospOpt.get().getCode() != null && userHospOpt.get().getCode().equalsIgnoreCase(targetHospitalId)) {
            return;
        }

        // Check if targetHospitalId is Mongo ID and userHospitalId is tenant code
        Optional<Hospital> targetHospOpt = hospitalRepository.findById(targetHospitalId);
        if (targetHospOpt.isPresent()) {
            Hospital targetHosp = targetHospOpt.get();
            if (userHospitalId.equals(targetHosp.getId()) || (targetHosp.getCode() != null && userHospitalId.equalsIgnoreCase(targetHosp.getCode()))) {
                return;
            }
        }

        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: User does not belong to specified hospital tenant.");
    }
}
