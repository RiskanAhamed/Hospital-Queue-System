package com.hospital.queue.controller;

import com.hospital.queue.dto.AppointmentDtos.BookAppointmentRequest;
import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.QueueEntry;
import com.hospital.queue.model.User;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.QueueRepository;
import com.hospital.queue.repository.UserRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.service.QueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.hospital.queue.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import com.hospital.queue.service.NotificationService;
import com.hospital.queue.service.AuditLogService;
import lombok.Data;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/appointments")
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentRepository appointmentRepository;
    private final DoctorRepository doctorRepository;
    private final QueueService queueService;
    private final TenantSecurityService tenantSecurityService;
    private final QueueRepository queueRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;

    @Data
    public static class RescheduleRequest {
        private String appointmentDate;
        private String timeSlot;
    }

    @GetMapping
    public ResponseEntity<List<Appointment>> getAppointments(
            @PathVariable String hospitalId,
            @RequestParam(required = false) String patientId,
            @RequestParam(required = false) String doctorId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        // BUG 19 FIX: PATIENT users can only see their own appointments
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole())) {
            return ResponseEntity.ok(
                appointmentRepository.findByHospitalIdAndPatientId(hospitalId, currentUser.getUserId())
            );
        }

        // Restrict DOCTOR users to seeing only their own appointments
        if ("DOCTOR".equalsIgnoreCase(currentUser.getRole())) {
            java.util.Optional<Doctor> docOpt = doctorRepository.findByUserId(currentUser.getUserId());
            if (docOpt.isPresent()) {
                return ResponseEntity.ok(
                    appointmentRepository.findByHospitalIdAndDoctorId(hospitalId, docOpt.get().getId())
                );
            } else {
                return ResponseEntity.ok(java.util.Collections.emptyList());
            }
        }

        if (patientId != null && !patientId.isEmpty()) {
            return ResponseEntity.ok(appointmentRepository.findByHospitalIdAndPatientId(hospitalId, patientId));
        }
        if (doctorId != null && !doctorId.isEmpty()) {
            return ResponseEntity.ok(appointmentRepository.findByHospitalIdAndDoctorId(hospitalId, doctorId));
        }
        return ResponseEntity.ok(appointmentRepository.findByHospitalId(hospitalId));
    }

    @PostMapping("/book")
    public ResponseEntity<?> bookAppointment(@PathVariable String hospitalId, @Valid @RequestBody BookAppointmentRequest req) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        Doctor doctor = doctorRepository.findById(req.getDoctorId()).orElse(null);
        if (doctor == null || !doctor.getHospitalId().equals(hospitalId)) {
            return ResponseEntity.badRequest().body("Doctor not found in this hospital.");
        }

        // BUG 32 FIX: Validate and parse appointmentDate — reject malformed strings and past dates
        LocalDate parsedDate;
        try {
            parsedDate = LocalDate.parse(req.getAppointmentDate()); // expects YYYY-MM-DD
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest()
                    .body("Invalid appointmentDate format. Expected YYYY-MM-DD (e.g. 2025-12-31).");
        }
        if (parsedDate.isBefore(LocalDate.now())) {
            return ResponseEntity.badRequest()
                    .body("Cannot book an appointment in the past. Please select today or a future date.");
        }

        String targetPatientId = req.getPatientId();
        String targetPatientName = req.getPatientName() != null ? req.getPatientName() : "Patient";

        // BUG 6 FIX: Enforce PATIENT users can only book for themselves
        // BUG 13 FIX: Use authenticated user's real name from DB, not untrusted request body
        // BUG 41 FIX: Staff/Admin booking must reference a real PATIENT user account in this hospital
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole())) {
            targetPatientId = currentUser.getUserId();
            User patientUser = userRepository.findById(currentUser.getUserId()).orElse(null);
            targetPatientName = patientUser != null ? patientUser.getName() : "Patient";
        } else {
            if (targetPatientId == null || targetPatientId.trim().isEmpty()) {
                return ResponseEntity.badRequest().body("patientId is required for staff booking.");
            }
            User patientUser = userRepository.findById(targetPatientId).orElse(null);
            if (patientUser == null || !hospitalId.equals(patientUser.getHospitalId()) || patientUser.getRole() != com.hospital.queue.model.Role.PATIENT) {
                return ResponseEntity.badRequest().body("Invalid patientId. Must belong to a registered PATIENT user in this hospital.");
            }
            targetPatientName = patientUser.getName();
        }


        // BUG 22 FIX: Doctor constraint validations
        if (!doctor.isAvailable()) {
            return ResponseEntity.badRequest().body("Doctor is currently not available for booking.");
        }

        if (doctor.getAvailableSlots() != null && !doctor.getAvailableSlots().contains(req.getTimeSlot())) {
            return ResponseEntity.badRequest().body("Selected time slot is not available for this doctor.");
        }

        if (appointmentRepository.existsByDoctorIdAndAppointmentDateAndTimeSlotAndStatusNot(req.getDoctorId(), req.getAppointmentDate(), req.getTimeSlot(), "CANCELLED")) {
            return ResponseEntity.badRequest().body("This time slot is already booked. Please choose another time slot.");
        }

        if (appointmentRepository.existsByPatientIdAndDoctorIdAndAppointmentDateAndStatusNot(targetPatientId, req.getDoctorId(), req.getAppointmentDate(), "CANCELLED")) {
            return ResponseEntity.badRequest().body("Patient already has an active appointment with this doctor on this date.");
        }

        long existingCount = appointmentRepository.countByDoctorIdAndAppointmentDateAndStatusNot(req.getDoctorId(), req.getAppointmentDate(), "CANCELLED");
        if (existingCount >= doctor.getMaxDailyAppointments()) {
            return ResponseEntity.badRequest().body("Doctor has reached maximum daily appointments limit for this date.");
        }

        Appointment appt = new Appointment();
        appt.setHospitalId(hospitalId);
        appt.setPatientId(targetPatientId);
        appt.setPatientName(targetPatientName);
        appt.setDoctorId(req.getDoctorId());
        appt.setDoctorName(doctor.getName());
        appt.setDepartmentId(doctor.getDepartmentId());
        appt.setDepartmentName(doctor.getDepartmentName());
        appt.setAppointmentDate(req.getAppointmentDate());
        appt.setTimeSlot(req.getTimeSlot());

        Appointment saved = appointmentRepository.save(appt);

        // Auto generate queue token for today's appointment
        if (LocalDate.now().toString().equals(saved.getAppointmentDate())) {
            queueService.generateQueueForAppointment(saved);
        }

        // Fetch latest saved to get the generated queue number
        saved = appointmentRepository.findById(saved.getId()).orElse(saved);

        // Notify patient: "Appointment Confirmed" with queue number
        String qNumber = saved.getQueueNumber();
        String notificationMsg = "Your appointment with " + saved.getDoctorName() + " has been booked successfully for " + saved.getAppointmentDate() + " at " + saved.getTimeSlot() + "." + (qNumber != null ? " Your queue token is: " + qNumber + "." : "");
        notificationService.createAndSendNotification(hospitalId, saved.getPatientId(), "APPOINTMENT_CONFIRMED", "Appointment Confirmed", notificationMsg);

        // Audit Log
        auditLogService.log(hospitalId, currentUser.getUserId(), "APPOINTMENT_BOOKED", "Appointment booked for patient " + saved.getPatientName() + " (ID: " + saved.getPatientId() + ") with doctor " + saved.getDoctorName() + " (ID: " + saved.getDoctorId() + ")");

        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{appointmentId}/cancel")
    public ResponseEntity<?> cancelAppointment(@PathVariable String hospitalId, @PathVariable String appointmentId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        Appointment appt = appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found."));

        if (!appt.getHospitalId().equals(hospitalId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Appointment belongs to another hospital.");
        }

        // Ownership check (BUG 5 FIX): Patients can ONLY cancel their own appointments
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) && !appt.getPatientId().equals(currentUser.getUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: You can only cancel your own appointments.");
        }

        if ("COMPLETED".equalsIgnoreCase(appt.getStatus())) {
            return ResponseEntity.badRequest().body("Cannot cancel a completed appointment.");
        }
        if ("CANCELLED".equalsIgnoreCase(appt.getStatus())) {
            return ResponseEntity.badRequest().body("Appointment is already cancelled.");
        }

        appt.setStatus("CANCELLED");
        Appointment saved = appointmentRepository.save(appt);

        // BUG 18 FIX: Also cancel the associated queue entry so no ghost patient remains in doctor's queue
        queueRepository.findByAppointmentId(appointmentId).ifPresent(queueEntry -> {
            queueEntry.setStatus("CANCELLED");
            queueRepository.save(queueEntry);
            queueService.broadcastQueueState(hospitalId, queueEntry.getDoctorId());
        });

        // Notify patient: "Appointment Cancelled"
        String notificationMsg = "Your appointment with " + saved.getDoctorName() + " on " + saved.getAppointmentDate() + " has been cancelled.";
        notificationService.createAndSendNotification(hospitalId, saved.getPatientId(), "APPOINTMENT_CANCELLED", "Appointment Cancelled", notificationMsg);

        // Audit Log
        auditLogService.log(hospitalId, currentUser.getUserId(), "APPOINTMENT_CANCELLED", "Appointment cancelled (ID: " + saved.getId() + ")");

        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{appointmentId}/reschedule")
    public ResponseEntity<?> rescheduleAppointment(
            @PathVariable String hospitalId,
            @PathVariable String appointmentId,
            @Valid @RequestBody RescheduleRequest req) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        Appointment appt = appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found."));

        if (!appt.getHospitalId().equals(hospitalId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Appointment belongs to another hospital.");
        }

        // Ownership check
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) && !appt.getPatientId().equals(currentUser.getUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: You can only reschedule your own appointments.");
        }

        if ("COMPLETED".equalsIgnoreCase(appt.getStatus()) || "CANCELLED".equalsIgnoreCase(appt.getStatus())) {
            return ResponseEntity.badRequest().body("Cannot reschedule a completed or cancelled appointment.");
        }

        // Parse and validate date
        LocalDate parsedDate;
        try {
            parsedDate = LocalDate.parse(req.getAppointmentDate()); // YYYY-MM-DD
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest()
                    .body("Invalid appointmentDate format. Expected YYYY-MM-DD (e.g. 2025-12-31).");
        }
        if (parsedDate.isBefore(LocalDate.now())) {
            return ResponseEntity.badRequest()
                    .body("Cannot reschedule an appointment to a past date. Please select today or a future date.");
        }

        Doctor doctor = doctorRepository.findById(appt.getDoctorId()).orElse(null);
        if (doctor == null || !doctor.getHospitalId().equals(hospitalId)) {
            return ResponseEntity.badRequest().body("Doctor not found in this hospital.");
        }

        // Constraints validations
        if (!doctor.isAvailable()) {
            return ResponseEntity.badRequest().body("Doctor is currently not available.");
        }

        if (doctor.getAvailableSlots() != null && !doctor.getAvailableSlots().contains(req.getTimeSlot())) {
            return ResponseEntity.badRequest().body("Selected time slot is not available for this doctor.");
        }

        // Check double booking (excluding this appointment)
        List<Appointment> doctorAppts = appointmentRepository.findByHospitalIdAndDoctorIdAndAppointmentDate(hospitalId, doctor.getId(), req.getAppointmentDate());
        boolean slotTaken = doctorAppts.stream()
                .anyMatch(a -> !a.getId().equals(appointmentId) && !"CANCELLED".equalsIgnoreCase(a.getStatus()) && a.getTimeSlot().equals(req.getTimeSlot()));
        if (slotTaken) {
            return ResponseEntity.badRequest().body("This time slot is already booked. Please choose another time slot.");
        }

        // Check if patient already has an active appointment with this doctor on this date (excluding this appointment)
        List<Appointment> patientAppts = appointmentRepository.findByHospitalIdAndPatientId(hospitalId, appt.getPatientId());
        boolean patientAlreadyHasActive = patientAppts.stream()
                .anyMatch(a -> !a.getId().equals(appointmentId) && !"CANCELLED".equalsIgnoreCase(a.getStatus()) && a.getDoctorId().equals(appt.getDoctorId()) && a.getAppointmentDate().equals(req.getAppointmentDate()));
        if (patientAlreadyHasActive) {
            return ResponseEntity.badRequest().body("Patient already has an active appointment with this doctor on this date.");
        }

        // Check max daily limit
        long existingCount = doctorAppts.stream()
                .filter(a -> !a.getId().equals(appointmentId) && !"CANCELLED".equalsIgnoreCase(a.getStatus()))
                .count();
        if (existingCount >= doctor.getMaxDailyAppointments()) {
            return ResponseEntity.badRequest().body("Doctor has reached maximum daily appointments limit for this date.");
        }

        // Cancel old queue entry if it exists
        queueRepository.findByAppointmentId(appointmentId).ifPresent(queueEntry -> {
            queueEntry.setStatus("CANCELLED");
            queueRepository.save(queueEntry);
            queueService.broadcastQueueState(hospitalId, queueEntry.getDoctorId());
        });

        // Update appointment details
        appt.setAppointmentDate(req.getAppointmentDate());
        appt.setTimeSlot(req.getTimeSlot());
        appt.setStatus("BOOKED");
        appt.setQueueNumber(null);
        Appointment saved = appointmentRepository.save(appt);

        // Auto generate queue token if rescheduled to today
        if (LocalDate.now().toString().equals(saved.getAppointmentDate())) {
            queueService.generateQueueForAppointment(saved);
        }

        // Fetch latest saved to get the generated queue number
        saved = appointmentRepository.findById(saved.getId()).orElse(saved);

        // Notify patient: "Appointment Rescheduled"
        String qNumber = saved.getQueueNumber();
        String notificationMsg = "Your appointment with " + saved.getDoctorName() + " has been rescheduled to " + saved.getAppointmentDate() + " at " + saved.getTimeSlot() + "." + (qNumber != null ? " Your new queue token is: " + qNumber + "." : "");
        notificationService.createAndSendNotification(hospitalId, saved.getPatientId(), "APPOINTMENT_CONFIRMED", "Appointment Rescheduled", notificationMsg);

        // Audit Log
        auditLogService.log(hospitalId, currentUser.getUserId(), "APPOINTMENT_RESCHEDULED", "Rescheduled appointment (ID: " + saved.getId() + ") for patient " + saved.getPatientName() + " to " + saved.getAppointmentDate() + " at " + saved.getTimeSlot());

        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{appointmentId}/rating")
    public ResponseEntity<?> submitAppointmentRating(
            @PathVariable String hospitalId,
            @PathVariable String appointmentId,
            @RequestBody java.util.Map<String, Object> payload) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        java.util.Optional<Appointment> apptOpt = appointmentRepository.findById(appointmentId);
        if (apptOpt.isEmpty() || !apptOpt.get().getHospitalId().equals(hospitalId)) {
            return ResponseEntity.notFound().build();
        }

        Appointment appt = apptOpt.get();

        // Ensure only the patient who had the appointment or an admin can submit the rating
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) && !appt.getPatientId().equals(currentUser.getUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: You can only rate your own appointments.");
        }

        // Must be a completed appointment to rate
        if (!"COMPLETED".equalsIgnoreCase(appt.getStatus())) {
            return ResponseEntity.badRequest().body("Only completed consultations can be rated.");
        }

        Object ratingObj = payload.get("rating");
        if (ratingObj == null) {
            return ResponseEntity.badRequest().body("Rating is required (1 to 5 stars).");
        }

        int ratingVal;
        try {
            ratingVal = Integer.parseInt(ratingObj.toString());
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body("Invalid rating format. Must be an integer between 1 and 5.");
        }

        if (ratingVal < 1 || ratingVal > 5) {
            return ResponseEntity.badRequest().body("Rating must be between 1 and 5 stars.");
        }

        String feedback = payload.get("feedbackComment") != null ? payload.get("feedbackComment").toString().trim() : null;

        appt.setRating(ratingVal);
        appt.setFeedbackComment(feedback);
        appt.setRatedAt(java.time.LocalDateTime.now());
        Appointment saved = appointmentRepository.save(appt);

        // Recalculate Doctor's overall rating
        if (saved.getDoctorId() != null) {
            java.util.Optional<Doctor> docOpt = doctorRepository.findById(saved.getDoctorId());
            if (docOpt.isPresent()) {
                Doctor doc = docOpt.get();
                List<Appointment> allDocAppts = appointmentRepository.findByHospitalIdAndDoctorId(hospitalId, doc.getId());
                List<Integer> ratings = allDocAppts.stream()
                        .map(Appointment::getRating)
                        .filter(java.util.Objects::nonNull)
                        .collect(java.util.stream.Collectors.toList());

                if (!ratings.isEmpty()) {
                    double avg = ratings.stream().mapToInt(Integer::intValue).average().orElse(5.0);
                    doc.setAverageRating(Math.round(avg * 10.0) / 10.0);
                    doc.setTotalRatings(ratings.size());
                    doctorRepository.save(doc);
                }
            }
        }

        auditLogService.log(hospitalId, currentUser.getUserId(), "DOCTOR_RATED", "Submitted " + ratingVal + "-star rating for Doctor " + saved.getDoctorName() + " on appointment " + saved.getId());
        return ResponseEntity.ok(saved);
    }
}
