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
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Collections;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class DoctorControllerTest {

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private com.hospital.queue.repository.HospitalRepository hospitalRepository;

    @Mock
    private TenantSecurityService tenantSecurityService;

    @Mock
    private AuditLogService auditLogService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private DoctorController doctorController;

    private UserPrincipal adminPrincipal;

    @BeforeEach
    public void setUp() {
        adminPrincipal = new UserPrincipal("admin1", "admin@hosp1.org", "HOSPITAL_ADMIN", "HOSP001");
        lenient().when(tenantSecurityService.getCurrentUser()).thenReturn(adminPrincipal);
    }

    @Test
    public void testCreateDoctorClearsSuppliedIdAndBroadcasts() {
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

        ResponseEntity<?> response = doctorController.createDoctor("HOSP001", inputDoctor);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        Doctor body = (Doctor) response.getBody();
        assertEquals("NEW_GENERATED_ID", body.getId());
        assertEquals("HOSP001", body.getHospitalId());

        ArgumentCaptor<Doctor> captor = ArgumentCaptor.forClass(Doctor.class);
        verify(doctorRepository).save(captor.capture());
        assertEquals("HOSP001", captor.getValue().getHospitalId());
        verify(tenantSecurityService).validateTenantAccess("HOSP001", Role.HOSPITAL_ADMIN);
        verify(messagingTemplate).convertAndSend(eq("/topic/hospital/HOSP001/doctors"), any(Doctor.class));
    }

    @Test
    public void testUpdateDoctorAvailabilityBroadcasts() {
        Doctor existing = new Doctor();
        existing.setId("DOC001");
        existing.setName("Dr. Smith");
        existing.setHospitalId("HOSP001");
        existing.setAvailable(true);

        when(doctorRepository.findById("DOC001")).thenReturn(Optional.of(existing));
        when(doctorRepository.save(any(Doctor.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<?> response = doctorController.updateDoctorAvailability("HOSP001", "DOC001", Collections.singletonMap("available", false));

        assertEquals(200, response.getStatusCode().value());
        verify(messagingTemplate).convertAndSend(eq("/topic/hospital/HOSP001/doctors"), any(Doctor.class));
    }
}
