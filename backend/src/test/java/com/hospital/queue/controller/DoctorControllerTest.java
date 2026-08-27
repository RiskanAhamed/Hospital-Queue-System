package com.hospital.queue.controller;

import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.security.UserPrincipal;
import com.hospital.queue.service.AuditLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DoctorControllerTest {

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private TenantSecurityService tenantSecurityService;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private DoctorController doctorController;

    private UserPrincipal adminPrincipal;

    @BeforeEach
    public void setUp() {
        adminPrincipal = new UserPrincipal("admin1", "admin@hosp1.org", "HOSPITAL_ADMIN", "HOSP001");
        lenient().when(tenantSecurityService.getCurrentUser()).thenReturn(adminPrincipal);
    }

    @Test
    public void testCreateDoctorClearsSuppliedId() {
        Doctor inputDoctor = new Doctor();
        inputDoctor.setId("ATTACKER_SUPPLIED_TARGET_DOCTOR_ID");
        inputDoctor.setName("Dr. Hijack");
        inputDoctor.setSpecialization("Cardiology");
        inputDoctor.setRoomNumber("101");

        when(doctorRepository.save(any(Doctor.class))).thenAnswer(invocation -> {
            Doctor d = invocation.getArgument(0);
            assertNull(d.getId(), "Doctor ID must be null before repository save to prevent hijacking existing records");
            d.setId("NEW_GENERATED_ID");
            return d;
        });

        ResponseEntity<Doctor> response = doctorController.createDoctor("HOSP001", inputDoctor);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("NEW_GENERATED_ID", response.getBody().getId());
        assertEquals("HOSP001", response.getBody().getHospitalId());

        ArgumentCaptor<Doctor> captor = ArgumentCaptor.forClass(Doctor.class);
        verify(doctorRepository).save(captor.capture());
        assertEquals("HOSP001", captor.getValue().getHospitalId());
        verify(tenantSecurityService).validateTenantAccess("HOSP001", Role.HOSPITAL_ADMIN);
    }
}
