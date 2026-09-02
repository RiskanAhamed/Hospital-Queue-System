package com.hospital.queue.controller;

import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/doctors")
@RequiredArgsConstructor
public class DoctorController {

    private final DoctorRepository doctorRepository;
    private final TenantSecurityService tenantSecurityService;
    private final AuditLogService auditLogService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping
    public ResponseEntity<List<Doctor>> getDoctorsByHospital(
            @PathVariable String hospitalId,
            @RequestParam(required = false) String departmentId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        if (departmentId != null && !departmentId.isEmpty()) {
            return ResponseEntity.ok(doctorRepository.findByHospitalIdAndDepartmentId(hospitalId, departmentId));
        }
        return ResponseEntity.ok(doctorRepository.findByHospitalId(hospitalId));
    }

    @GetMapping("/{doctorId}")
    public ResponseEntity<?> getDoctorById(@PathVariable String hospitalId, @PathVariable String doctorId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        return doctorRepository.findById(doctorId)
                .filter(doc -> doc.getHospitalId().equals(hospitalId))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Doctor> createDoctor(@PathVariable String hospitalId, @RequestBody Doctor doctor) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);
        doctor.setId(null);
        doctor.setHospitalId(hospitalId);
        if (doctor.getAvailableSlots() == null || doctor.getAvailableSlots().isEmpty()) {
            doctor.setAvailableSlots(Arrays.asList("09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00"));
        }
        Doctor saved = doctorRepository.save(doctor);
        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "DOCTOR_CREATED", "Onboarded Doctor: " + saved.getName() + " (ID: " + saved.getId() + ")");
        try {
            messagingTemplate.convertAndSend("/topic/hospital/" + hospitalId + "/doctors", saved);
        } catch (Exception e) {
            log.error("Failed to broadcast doctor creation to STOMP topic: {}", e.getMessage(), e);
        }
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{doctorId}/availability")
    public ResponseEntity<?> updateDoctorAvailability(
            @PathVariable String hospitalId,
            @PathVariable String doctorId,
            @RequestBody java.util.Map<String, Boolean> body) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        Doctor doc = doctorRepository.findById(doctorId).orElse(null);
        if (doc == null || !doc.getHospitalId().equals(hospitalId)) {
            return ResponseEntity.notFound().build();
        }
        if (body != null && body.containsKey("available")) {
            doc.setAvailable(Boolean.TRUE.equals(body.get("available")));
        }
        Doctor saved = doctorRepository.save(doc);
        try {
            messagingTemplate.convertAndSend("/topic/hospital/" + hospitalId + "/doctors", saved);
        } catch (Exception e) {
            log.error("Failed to broadcast doctor availability update to STOMP topic: {}", e.getMessage(), e);
        }
        return ResponseEntity.ok(saved);
    }
}
