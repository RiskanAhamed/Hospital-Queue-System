package com.hospital.queue.service;

import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.QueueCounter;
import com.hospital.queue.model.QueueEntry;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.QueueRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class QueueServiceTest {

    @Mock
    private QueueRepository queueRepository;

    @Mock
    private AppointmentRepository appointmentRepository;

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private NotificationService notificationService;

    @Mock
    private MongoTemplate mongoTemplate;

    private QueueService queueService;

    @BeforeEach
    public void setUp() {
        queueService = new QueueService(
                queueRepository,
                appointmentRepository,
                doctorRepository,
                messagingTemplate,
                notificationService,
                mongoTemplate
        );
    }

    @Test
    public void testStartConsultationUpdatesAppointmentStatus() {
        String hospitalId = "HOSP001";
        String queueId = "q123";
        String appointmentId = "appt456";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId(hospitalId);
        entry.setAppointmentId(appointmentId);
        entry.setStatus("WAITING");

        Appointment appt = new Appointment();
        appt.setId(appointmentId);
        appt.setStatus("CHECKED_IN");

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));
        when(queueRepository.save(any(QueueEntry.class))).thenReturn(entry);
        when(appointmentRepository.findById(appointmentId)).thenReturn(Optional.of(appt));

        queueService.startConsultation(hospitalId, queueId);

        assertEquals("IN_CONSULTATION", appt.getStatus());
        verify(appointmentRepository, times(1)).save(appt);
    }

    @Test
    public void testCallNextPatientCompletesPreviousAppointment() {
        String hospitalId = "HOSP001";
        String doctorId = "doc123";
        String appointmentId = "appt789";
        String todayStr = LocalDate.now().toString();

        Doctor doctor = new Doctor();
        doctor.setId(doctorId);
        doctor.setHospitalId(hospitalId);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));

        QueueEntry activeConsultation = new QueueEntry();
        activeConsultation.setId("qActive");
        activeConsultation.setHospitalId(hospitalId);
        activeConsultation.setDoctorId(doctorId);
        activeConsultation.setAppointmentId(appointmentId);
        activeConsultation.setStatus("IN_CONSULTATION");

        Appointment appt = new Appointment();
        appt.setId(appointmentId);
        appt.setStatus("IN_CONSULTATION");

        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, todayStr, "IN_CONSULTATION"))
                .thenReturn(Optional.of(activeConsultation));
        when(appointmentRepository.findById(appointmentId)).thenReturn(Optional.of(appt));
        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, todayStr, "WAITING"))
                .thenReturn(Optional.empty());

        queueService.callNextPatient(hospitalId, doctorId);

        assertEquals("COMPLETED", appt.getStatus());
        verify(appointmentRepository, times(1)).save(appt);
    }

    @Test
    public void testGenerateQueueForAppointmentUsesAtomicCounter() {
        String hospitalId = "HOSP001";
        String doctorId = "doc1";
        String apptId = "appt1";
        String todayStr = LocalDate.now().toString();

        Appointment appt = new Appointment();
        appt.setId(apptId);
        appt.setHospitalId(hospitalId);
        appt.setDoctorId(doctorId);
        appt.setPatientId("patient1");
        appt.setPatientName("Test Patient");
        appt.setDepartmentName("Cardiology");
        appt.setAppointmentDate(todayStr);

        // Simulate atomic counter returning sequence 5
        QueueCounter counter = new QueueCounter();
        counter.setSequenceNumber(5);
        when(mongoTemplate.findAndModify(any(Query.class), any(Update.class), any(FindAndModifyOptions.class), eq(QueueCounter.class)))
                .thenReturn(counter);

        QueueEntry savedEntry = new QueueEntry();
        savedEntry.setId("q1");
        savedEntry.setQueueNumber("C-05");
        savedEntry.setSequenceNumber(5);
        when(queueRepository.save(any(QueueEntry.class))).thenReturn(savedEntry);
        when(appointmentRepository.save(any(Appointment.class))).thenReturn(appt);

        QueueEntry result = queueService.generateQueueForAppointment(appt);

        assertNotNull(result);
        assertEquals("C-05", result.getQueueNumber());
        assertEquals(5, result.getSequenceNumber());
        verify(mongoTemplate, times(1)).findAndModify(any(Query.class), any(Update.class), any(FindAndModifyOptions.class), eq(QueueCounter.class));
    }

    @Test
    public void testCallNextPatientReturnsNullWhenNoWaiting() {
        String hospitalId = "HOSP001";
        String doctorId = "doc1";
        String todayStr = LocalDate.now().toString();

        Doctor doctor = new Doctor();
        doctor.setId(doctorId);
        doctor.setHospitalId(hospitalId);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));

        // No IN_CONSULTATION and no WAITING patients
        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, todayStr, "IN_CONSULTATION"))
                .thenReturn(Optional.empty());
        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, "IN_CONSULTATION"))
                .thenReturn(Optional.empty());
        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, todayStr, "WAITING"))
                .thenReturn(Optional.empty());
        when(queueRepository.findFirstByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, "WAITING"))
                .thenReturn(Optional.empty());

        QueueEntry result = queueService.callNextPatient(hospitalId, doctorId);

        assertNull(result);
    }

    @Test
    public void testSkipPatientChangesStatus() {
        String hospitalId = "HOSP001";
        String queueId = "q1";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId(hospitalId);
        entry.setDoctorId("doc1");
        entry.setStatus("CALLED");

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));
        when(queueRepository.save(any(QueueEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        QueueEntry result = queueService.skipPatient(hospitalId, queueId);

        assertNotNull(result);
        assertEquals("SKIPPED", result.getStatus());
        verify(queueRepository, times(1)).save(any(QueueEntry.class));
    }

    @Test
    public void testRecallPatientOnlyAllowsSkippedOrCalled() {
        String hospitalId = "HOSP001";
        String queueId = "q1";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId(hospitalId);
        entry.setDoctorId("doc1");
        entry.setStatus("WAITING"); // Not SKIPPED or CALLED

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));

        assertThrows(ResponseStatusException.class, () ->
                queueService.recallPatient(hospitalId, queueId)
        );
    }

    @Test
    public void testRecallSkippedPatientChangeStatusToCalled() {
        String hospitalId = "HOSP001";
        String queueId = "q1";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId(hospitalId);
        entry.setDoctorId("doc1");
        entry.setStatus("SKIPPED");

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));
        when(queueRepository.save(any(QueueEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        QueueEntry result = queueService.recallPatient(hospitalId, queueId);

        assertNotNull(result);
        assertEquals("CALLED", result.getStatus());
        assertNotNull(result.getCalledAt());
    }

    @Test
    public void testCompleteConsultationUpdatesAppointment() {
        String hospitalId = "HOSP001";
        String queueId = "q1";
        String appointmentId = "appt1";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId(hospitalId);
        entry.setDoctorId("doc1");
        entry.setAppointmentId(appointmentId);
        entry.setStatus("IN_CONSULTATION");

        Appointment appt = new Appointment();
        appt.setId(appointmentId);
        appt.setStatus("IN_CONSULTATION");

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));
        when(queueRepository.save(any(QueueEntry.class))).thenAnswer(inv -> inv.getArgument(0));
        when(appointmentRepository.findById(appointmentId)).thenReturn(Optional.of(appt));

        QueueEntry result = queueService.completeConsultation(hospitalId, queueId);

        assertNotNull(result);
        assertEquals("COMPLETED", result.getStatus());
        assertNotNull(result.getCompletedAt());
        assertEquals("COMPLETED", appt.getStatus());
        verify(appointmentRepository, times(1)).save(appt);
    }

    @Test
    public void testTenantIsolationOnStartConsultation() {
        String queueId = "q1";

        QueueEntry entry = new QueueEntry();
        entry.setId(queueId);
        entry.setHospitalId("HOSP002"); // Different hospital
        entry.setStatus("CALLED");

        when(queueRepository.findById(queueId)).thenReturn(Optional.of(entry));

        assertThrows(ResponseStatusException.class, () ->
                queueService.startConsultation("HOSP001", queueId) // Requesting as HOSP001
        );
    }
}
