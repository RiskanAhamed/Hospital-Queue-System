package com.hospital.queue.controller;

import com.hospital.queue.dto.AppointmentDtos.BookAppointmentRequest;
import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.User;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.UserRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.security.UserPrincipal;
import com.hospital.queue.service.QueueService;
import com.hospital.queue.service.NotificationService;
import com.hospital.queue.service.AuditLogService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class AppointmentControllerTest {

    @Mock
    private AppointmentRepository appointmentRepository;

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private TenantSecurityService tenantSecurityService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private QueueService queueService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private AuditLogService auditLogService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private AppointmentController appointmentController;

    private AutoCloseable closeable;

    @BeforeEach
    public void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
    }

    @AfterEach
    public void tearDown() throws Exception {
        if (closeable != null) {
            closeable.close();
        }
    }

    @Test
    public void testBlockDuplicateAppointmentSameDaySameDoctor() {
        String hospitalId = "HOSP001";
        String doctorId = "doc123";
        String patientId = "patient789";
        String todayStr = LocalDate.now().toString();

        UserPrincipal principal = new UserPrincipal(patientId, "patient@test.com", "PATIENT", hospitalId);
        when(tenantSecurityService.getCurrentUser()).thenReturn(principal);

        Doctor doctor = new Doctor();
        doctor.setId(doctorId);
        doctor.setHospitalId(hospitalId);
        doctor.setAvailable(true);
        doctor.setAvailableSlots(Arrays.asList("09:00", "09:30"));
        doctor.setMaxDailyAppointments(10);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));

        User patientUser = new User();
        patientUser.setId(patientId);
        patientUser.setName("John Doe");
        patientUser.setRole(com.hospital.queue.model.Role.PATIENT);
        when(userRepository.findById(patientId)).thenReturn(Optional.of(patientUser));

        String testDate = LocalDate.now().plusDays(1).toString();
        when(appointmentRepository.existsByPatientIdAndDoctorIdAndAppointmentDateAndStatusNot(patientId, doctorId, testDate, "CANCELLED")).thenReturn(true);

        BookAppointmentRequest req = new BookAppointmentRequest();
        req.setDoctorId(doctorId);
        req.setPatientId(patientId);
        req.setAppointmentDate(testDate);
        req.setTimeSlot("09:30");

        ResponseEntity<?> response = appointmentController.bookAppointment(hospitalId, req);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Patient already has an active appointment with this doctor on this date.", response.getBody());
    }

    @Test
    public void testBlockCancelCompletedAppointment() {
        String hospitalId = "HOSP001";
        String appointmentId = "appt999";
        String patientId = "patient789";

        UserPrincipal principal = new UserPrincipal(patientId, "patient@test.com", "PATIENT", hospitalId);
        when(tenantSecurityService.getCurrentUser()).thenReturn(principal);

        Appointment appt = new Appointment();
        appt.setId(appointmentId);
        appt.setHospitalId(hospitalId);
        appt.setPatientId(patientId);
        appt.setStatus("COMPLETED");

        when(appointmentRepository.findById(appointmentId)).thenReturn(Optional.of(appt));

        ResponseEntity<?> response = appointmentController.cancelAppointment(hospitalId, appointmentId);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Cannot cancel a completed appointment.", response.getBody());
    }

    @Test
    public void testFutureAppointmentDoesNotGenerateQueueEntry() {
        String hospitalId = "HOSP001";
        String doctorId = "doc123";
        String patientId = "patient789";
        String tomorrowStr = LocalDate.now().plusDays(1).toString();

        UserPrincipal principal = new UserPrincipal(patientId, "patient@test.com", "PATIENT", hospitalId);
        when(tenantSecurityService.getCurrentUser()).thenReturn(principal);

        Doctor doctor = new Doctor();
        doctor.setId(doctorId);
        doctor.setHospitalId(hospitalId);
        doctor.setAvailable(true);
        doctor.setAvailableSlots(Arrays.asList("09:00", "09:30"));
        doctor.setMaxDailyAppointments(10);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));

        User patientUser = new User();
        patientUser.setId(patientId);
        patientUser.setName("John Doe");
        patientUser.setRole(com.hospital.queue.model.Role.PATIENT);
        when(userRepository.findById(patientId)).thenReturn(Optional.of(patientUser));

        when(appointmentRepository.existsByPatientIdAndDoctorIdAndAppointmentDateAndStatusNot(patientId, doctorId, tomorrowStr, "CANCELLED")).thenReturn(false);

        Appointment savedAppt = new Appointment();
        savedAppt.setId("new-appt-123");
        savedAppt.setAppointmentDate(tomorrowStr);
        when(appointmentRepository.save(any(Appointment.class))).thenReturn(savedAppt);

        BookAppointmentRequest req = new BookAppointmentRequest();
        req.setDoctorId(doctorId);
        req.setPatientId(patientId);
        req.setAppointmentDate(tomorrowStr);
        req.setTimeSlot("09:00");

        ResponseEntity<?> response = appointmentController.bookAppointment(hospitalId, req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(queueService, never()).generateQueueForAppointment(any(Appointment.class));
    }

    @Test
    public void testDoctorRoleRestrictsGetAppointments() {
        String hospitalId = "HOSP001";
        String doctorUserId = "docUser789";
        String doctorId = "doc123";

        UserPrincipal principal = new UserPrincipal(doctorUserId, "doc@test.com", "DOCTOR", hospitalId);
        when(tenantSecurityService.getCurrentUser()).thenReturn(principal);

        Doctor doctor = new Doctor();
        doctor.setId(doctorId);
        doctor.setHospitalId(hospitalId);
        doctor.setUserId(doctorUserId);
        when(doctorRepository.findByUserId(doctorUserId)).thenReturn(Optional.of(doctor));

        Appointment appt = new Appointment();
        appt.setId("appt111");
        appt.setDoctorId(doctorId);
        appt.setHospitalId(hospitalId);

        when(appointmentRepository.findByHospitalIdAndDoctorId(hospitalId, doctorId)).thenReturn(Arrays.asList(appt));

        ResponseEntity<java.util.List<Appointment>> response = appointmentController.getAppointments(hospitalId, null, null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(1, response.getBody().size());
        assertEquals("appt111", response.getBody().get(0).getId());
    }

    @Test
    public void testPatientFilterByDoctorIdReturnsOnlyDoctorAppointments() {
        String hospitalId = "HOSP001";
        String patientId = "patient789";
        String doctorBId = "docB";

        UserPrincipal principal = new UserPrincipal(patientId, "patient@test.com", "PATIENT", hospitalId);
        when(tenantSecurityService.getCurrentUser()).thenReturn(principal);

        Appointment docBAppt = new Appointment();
        docBAppt.setId("appt-doc-b");
        docBAppt.setDoctorId(doctorBId);
        docBAppt.setHospitalId(hospitalId);
        docBAppt.setPatientId("otherPatient123");
        docBAppt.setAppointmentDate("2026-09-04");
        docBAppt.setTimeSlot("10:00");
        docBAppt.setStatus("BOOKED");

        when(appointmentRepository.findByHospitalIdAndDoctorId(hospitalId, doctorBId))
                .thenReturn(Arrays.asList(docBAppt));

        ResponseEntity<java.util.List<Appointment>> response = appointmentController.getAppointments(hospitalId, null, doctorBId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(1, response.getBody().size());
        Appointment result = response.getBody().get(0);
        assertEquals(doctorBId, result.getDoctorId());
        assertEquals("10:00", result.getTimeSlot());
    }
}
