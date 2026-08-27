package com.hospital.queue.security;

import com.hospital.queue.model.Role;
import com.hospital.queue.repository.HospitalRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

public class TenantSecurityServiceTest {

    @Mock
    private HospitalRepository hospitalRepository;

    @InjectMocks
    private TenantSecurityService tenantSecurityService;

    private AutoCloseable closeable;

    @BeforeEach
    public void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
    }

    @AfterEach
    public void tearDown() throws Exception {
        SecurityContextHolder.clearContext();
        if (closeable != null) {
            closeable.close();
        }
    }

    private void setSecurityContext(String userId, String email, String role, String hospitalId) {
        UserPrincipal principal = new UserPrincipal(userId, email, role, hospitalId);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(principal, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    public void testValidTenantAccessSameHospital() {
        setSecurityContext("u1", "staff@citycare.org", "STAFF", "HOSP001");
        assertDoesNotThrow(() -> tenantSecurityService.validateTenantAccess("HOSP001"));
    }

    @Test
    public void testForbiddenCrossTenantAccess() {
        setSecurityContext("u1", "staff@citycare.org", "STAFF", "HOSP001");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                tenantSecurityService.validateTenantAccess("HOSP002")
        );
        assertEquals(403, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("Access denied"));
    }

    @Test
    public void testSuperAdminCanAccessAnyTenant() {
        setSecurityContext("admin1", "super@system.org", "SUPER_ADMIN", null);
        assertDoesNotThrow(() -> tenantSecurityService.validateTenantAccess("HOSP002"));
    }

    @Test
    public void testRoleRestrictionFailure() {
        setSecurityContext("u1", "staff@citycare.org", "STAFF", "HOSP001");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                tenantSecurityService.validateTenantAccess("HOSP001", Role.HOSPITAL_ADMIN)
        );
        assertEquals(403, ex.getStatusCode().value());
    }

    @Test
    public void testRoleRestrictionSuccess() {
        setSecurityContext("admin1", "admin@citycare.org", "HOSPITAL_ADMIN", "HOSP001");
        assertDoesNotThrow(() -> tenantSecurityService.validateTenantAccess("HOSP001", Role.HOSPITAL_ADMIN));
    }
}
