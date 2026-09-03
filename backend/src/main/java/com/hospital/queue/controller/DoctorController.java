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
import com.hospital.queue.model.Hospital;
import com.hospital.queue.repository.HospitalRepository;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/doctors")
@RequiredArgsConstructor
public class DoctorController {

    private final DoctorRepository doctorRepository;
    private final HospitalRepository hospitalRepository;
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
    public ResponseEntity<?> createDoctor(@PathVariable String hospitalId, @RequestBody Doctor doctor) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);

        // Real SaaS Plan limit checks for doctors
        Hospital hosp = hospitalRepository.findById(hospitalId).orElse(null);
        if (hosp == null) {
            hosp = hospitalRepository.findByCode(hospitalId).orElse(null);
        }
        if (hosp != null) {
            String plan = hosp.getSubscriptionPlan();
            long doctorCount = doctorRepository.findByHospitalId(hospitalId).size();
            if ("BASIC".equalsIgnoreCase(plan) && doctorCount >= 2) {
                return ResponseEntity.badRequest().body("Doctor limit reached for BASIC plan (max 2 doctors). Upgrade to PRO or ENTERPRISE to onboard more doctors.");
            }
            if ("PRO".equalsIgnoreCase(plan) && doctorCount >= 10) {
                return ResponseEntity.badRequest().body("Doctor limit reached for PRO plan (max 10 doctors). Upgrade to ENTERPRISE for unlimited doctors.");
            }
        }

        doctor.setId(null);
        doctor.setHospitalId(hospitalId);
        if (doctor.getStatus() == null || doctor.getStatus().trim().isEmpty()) {
            doctor.setStatus("ACTIVE");
        }
        if (doctor.getAverageRating() == 0.0 && doctor.getTotalRatings() == 0) {
            doctor.setAverageRating(5.0);
            doctor.setTotalRatings(0);
        }
        doctor.setAvailable(true);
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

    @DeleteMapping("/{doctorId}")
    public ResponseEntity<?> deleteDoctor(@PathVariable String hospitalId, @PathVariable String doctorId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);
        Doctor doc = doctorRepository.findById(doctorId).orElse(null);
        if (doc == null || !doc.getHospitalId().equals(hospitalId)) {
            return ResponseEntity.notFound().build();
        }
        doctorRepository.delete(doc);
        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "DOCTOR_DELETED", "Deleted Doctor: " + doc.getName() + " (ID: " + doc.getId() + ")");
        try {
            messagingTemplate.convertAndSend("/topic/hospital/" + hospitalId + "/doctors/delete", java.util.Map.of("id", doctorId));
        } catch (Exception e) {
            log.error("Failed to broadcast doctor deletion: {}", e.getMessage(), e);
        }
        return ResponseEntity.ok(java.util.Map.of("message", "Doctor deleted successfully"));
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

    @PutMapping("/{doctorId}/schedule")
    public ResponseEntity<?> updateDoctorSchedule(
            @PathVariable String hospitalId,
            @PathVariable String doctorId,
            @RequestBody java.util.Map<String, Object> body) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.STAFF);
        Doctor doc = doctorRepository.findById(doctorId).orElse(null);
        if (doc == null || !doc.getHospitalId().equals(hospitalId)) {
            return ResponseEntity.notFound().build();
        }

        if (body.containsKey("availableSlots")) {
            @SuppressWarnings("unchecked")
            List<String> slots = (List<String>) body.get("availableSlots");
            if (slots != null) {
                slots.sort(String::compareTo);
                doc.setAvailableSlots(slots);
            }
        }

        if (body.containsKey("maxDailyAppointments")) {
            Object maxAppt = body.get("maxDailyAppointments");
            if (maxAppt instanceof Number) {
                doc.setMaxDailyAppointments(((Number) maxAppt).intValue());
            }
        }

        if (body.containsKey("roomNumber")) {
            doc.setRoomNumber(String.valueOf(body.get("roomNumber")));
        }

        if (body.containsKey("status")) {
            doc.setStatus(String.valueOf(body.get("status")));
        }

        if (body.containsKey("available")) {
            doc.setAvailable(Boolean.TRUE.equals(body.get("available")));
        }

        Doctor saved = doctorRepository.save(doc);
        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "DOCTOR_SCHEDULE_UPDATED",
                "Updated schedule for Dr. " + saved.getName() + " with " + (saved.getAvailableSlots() != null ? saved.getAvailableSlots().size() : 0) + " slots.");

        try {
            messagingTemplate.convertAndSend("/topic/hospital/" + hospitalId + "/doctors", saved);
        } catch (Exception e) {
            log.error("Failed to broadcast doctor schedule update: {}", e.getMessage(), e);
        }

        return ResponseEntity.ok(saved);
    }
}
