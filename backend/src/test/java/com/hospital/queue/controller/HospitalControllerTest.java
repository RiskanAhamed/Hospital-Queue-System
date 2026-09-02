package com.hospital.queue.controller;

import com.hospital.queue.model.Department;
import com.hospital.queue.model.Hospital;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.DepartmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.HospitalRepository;
import com.hospital.queue.repository.UserRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.security.UserPrincipal;
import com.hospital.queue.service.AuditLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class HospitalControllerTest {

    @Mock
    private HospitalRepository hospitalRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private TenantSecurityService tenantSecurityService;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private HospitalController hospitalController;

    private UserPrincipal adminPrincipal;

    @BeforeEach
    public void setUp() {
        adminPrincipal = new UserPrincipal("admin1", "admin@hosp1.org", "HOSPITAL_ADMIN", "HOSP001");
        lenient().when(tenantSecurityService.getCurrentUser()).thenReturn(adminPrincipal);
    }

    @Test
    public void testCreateDepartmentClearsSuppliedId() {
        Department inputDepartment = new Department();
        inputDepartment.setId("ATTACKER_SUPPLIED_TARGET_DEPT_ID");
        inputDepartment.setName("Cardiology");
        inputDepartment.setCode("CARD");

        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> {
            Department d = invocation.getArgument(0);
            assertNull(d.getId(), "Department ID must be null before repository save to prevent hijacking");
            d.setId("NEW_DEPT_ID");
            return d;
        });

        ResponseEntity<?> response = hospitalController.createDepartment("HOSP001", inputDepartment);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        Department body = (Department) response.getBody();
        assertEquals("NEW_DEPT_ID", body.getId());
        assertEquals("HOSP001", body.getHospitalId());
        verify(tenantSecurityService).validateTenantAccess("HOSP001", Role.HOSPITAL_ADMIN);
    }

    @Test
    public void testCreateHospitalClearsSuppliedId() {
        java.util.Map<String, String> inputMap = new java.util.HashMap<>();
        inputMap.put("name", "New City Hospital");
        inputMap.put("code", "NCH001");
        inputMap.put("adminEmail", "admin@nch.org");
        inputMap.put("adminPassword", "admin123");

        when(hospitalRepository.save(any(Hospital.class))).thenAnswer(invocation -> {
            Hospital h = invocation.getArgument(0);
            assertNull(h.getId(), "Hospital ID must be null before repository save");
            h.setId("NEW_HOSP_ID");
            return h;
        });

        ResponseEntity<?> response = hospitalController.createHospital(inputMap);

        assertEquals(200, response.getStatusCode().value());
        assertTrue(response.getBody() instanceof Hospital);
        Hospital saved = (Hospital) response.getBody();
        assertEquals("NEW_HOSP_ID", saved.getId());
        verify(tenantSecurityService).validateTenantAccess(null, Role.SUPER_ADMIN);
    }
}
