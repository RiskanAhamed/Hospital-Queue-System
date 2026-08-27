package com.hospital.queue.controller;

import com.hospital.queue.dto.AppointmentDtos.QueueActionRequest;
import com.hospital.queue.model.QueueEntry;
import com.hospital.queue.model.Role;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.service.QueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

import com.hospital.queue.model.Doctor;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.QueueRepository;
import com.hospital.queue.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.hospital.queue.service.AuditLogService;

@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/queues")
@RequiredArgsConstructor
public class QueueController {

    private final QueueService queueService;
    private final QueueRepository queueRepository;
    private final DoctorRepository doctorRepository;
    private final TenantSecurityService tenantSecurityService;
    private final AuditLogService auditLogService;

    @GetMapping("/doctor/{doctorId}")
    public ResponseEntity<Map<String, Object>> getDoctorQueueSummary(@PathVariable String hospitalId, @PathVariable String doctorId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        return ResponseEntity.ok(queueService.getQueueSummary(hospitalId, doctorId));
    }

    @PostMapping("/action")
    public ResponseEntity<?> handleQueueAction(@PathVariable String hospitalId, @RequestBody QueueActionRequest req) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF, Role.DOCTOR);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        // If current user is a DOCTOR, enforce that they can only act on their own assigned queue
        if ("DOCTOR".equalsIgnoreCase(currentUser.getRole())) {
            String targetDoctorId = req.getDoctorId();
            if ((targetDoctorId == null || targetDoctorId.isEmpty()) && req.getQueueId() != null) {
                QueueEntry qEntry = queueRepository.findById(req.getQueueId()).orElse(null);
                if (qEntry != null) targetDoctorId = qEntry.getDoctorId();
            }
            if (targetDoctorId != null) {
                Doctor doc = doctorRepository.findById(targetDoctorId).orElse(null);
                if (doc == null || !currentUser.getUserId().equals(doc.getUserId())) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Doctors can only manage their own queue.");
                }
            }
        }

        req.setHospitalId(hospitalId);
        String action = req.getAction();

        if ("CALL_NEXT".equalsIgnoreCase(action)) {
            QueueEntry called = queueService.callNextPatient(hospitalId, req.getDoctorId());
            auditLogService.log(hospitalId, currentUser.getUserId(), "QUEUE_CALL_NEXT", "Called next patient. Doctor: " + req.getDoctorId() + ", Called token: " + (called != null ? called.getQueueNumber() : "None"));
            return ResponseEntity.ok(Map.of("message", "Next patient called", "entry", called != null ? called : "No waiting patients"));
        } else if ("START_CONSULTATION".equalsIgnoreCase(action)) {
            QueueEntry updated = queueService.startConsultation(hospitalId, req.getQueueId());
            auditLogService.log(hospitalId, currentUser.getUserId(), "QUEUE_START_CONSULTATION", "Started consultation for queue entry: " + req.getQueueId() + ", Patient: " + (updated != null ? updated.getPatientName() : "Unknown"));
            return ResponseEntity.ok(Map.of("message", "Consultation started", "entry", updated));
        } else if ("COMPLETE".equalsIgnoreCase(action)) {
            QueueEntry updated = queueService.completeConsultation(hospitalId, req.getQueueId());
            auditLogService.log(hospitalId, currentUser.getUserId(), "QUEUE_COMPLETE", "Completed consultation for queue entry: " + req.getQueueId() + ", Patient: " + (updated != null ? updated.getPatientName() : "Unknown"));
            return ResponseEntity.ok(Map.of("message", "Consultation completed", "entry", updated));
        } else if ("SKIP".equalsIgnoreCase(action)) {
            QueueEntry updated = queueService.skipPatient(hospitalId, req.getQueueId());
            auditLogService.log(hospitalId, currentUser.getUserId(), "QUEUE_SKIP", "Skipped patient for queue entry: " + req.getQueueId() + ", Patient: " + (updated != null ? updated.getPatientName() : "Unknown"));
            return ResponseEntity.ok(Map.of("message", "Patient skipped", "entry", updated));
        } else if ("RECALL".equalsIgnoreCase(action)) {
            QueueEntry updated = queueService.recallPatient(hospitalId, req.getQueueId());
            auditLogService.log(hospitalId, currentUser.getUserId(), "QUEUE_RECALL", "Recalled patient for queue entry: " + req.getQueueId() + ", Patient: " + (updated != null ? updated.getPatientName() : "Unknown"));
            return ResponseEntity.ok(Map.of("message", "Patient recalled", "entry", updated));
        }

        return ResponseEntity.badRequest().body("Unknown queue action");
    }
}
