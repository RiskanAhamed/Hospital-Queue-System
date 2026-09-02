package com.hospital.queue.controller;

import com.hospital.queue.model.Department;
import com.hospital.queue.model.Hospital;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.DepartmentRepository;
import com.hospital.queue.repository.HospitalRepository;
import com.hospital.queue.security.TenantSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.hospital.queue.dto.AuthDtos.RegisterRequest;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.User;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Arrays;
import java.util.List;

import jakarta.validation.Valid;
import com.hospital.queue.service.AuditLogService;

@RestController
@RequestMapping("/api/v1/hospitals")
@RequiredArgsConstructor
public class HospitalController {

    private final HospitalRepository hospitalRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final DoctorRepository doctorRepository;
    private final PasswordEncoder passwordEncoder;
    private final TenantSecurityService tenantSecurityService;
    private final AuditLogService auditLogService;

    @GetMapping("/public/list")
    public ResponseEntity<List<Hospital>> getPublicHospitals() {
        return ResponseEntity.ok(hospitalRepository.findAll());
    }

    @GetMapping("/{hospitalId}")
    public ResponseEntity<?> getHospitalById(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        java.util.Optional<Hospital> hospOpt = hospitalRepository.findById(hospitalId);
        if (hospOpt.isEmpty()) {
            hospOpt = hospitalRepository.findByCode(hospitalId);
        }
        return hospOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{hospitalId}")
    public ResponseEntity<?> updateHospital(@PathVariable String hospitalId, @RequestBody Hospital updateData) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);

        java.util.Optional<Hospital> hospOpt = hospitalRepository.findById(hospitalId);
        if (hospOpt.isEmpty()) {
            hospOpt = hospitalRepository.findByCode(hospitalId);
        }
        if (hospOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Hospital hospital = hospOpt.get();
        if (updateData.getName() != null && !updateData.getName().trim().isEmpty()) {
            hospital.setName(updateData.getName().trim());
        }
        if (updateData.getAddress() != null && !updateData.getAddress().trim().isEmpty()) {
            hospital.setAddress(updateData.getAddress().trim());
        }
        if (updateData.getPhone() != null && !updateData.getPhone().trim().isEmpty()) {
            hospital.setPhone(updateData.getPhone().trim());
        }
        if (updateData.getEmail() != null && !updateData.getEmail().trim().isEmpty()) {
            hospital.setEmail(updateData.getEmail().trim());
        }
        if (updateData.getQueueAlgorithm() != null && !updateData.getQueueAlgorithm().trim().isEmpty()) {
            hospital.setQueueAlgorithm(updateData.getQueueAlgorithm().trim());
        }

        // NOTE: code and subscriptionPlan are NOT modified here.

        Hospital saved = hospitalRepository.save(hospital);
        return ResponseEntity.ok(saved);
    }

    @PostMapping
    public ResponseEntity<?> createHospital(@RequestBody java.util.Map<String, String> requestData) {
        tenantSecurityService.validateTenantAccess(null, Role.SUPER_ADMIN);

        String name = requestData.get("name");
        String code = requestData.get("code");
        String address = requestData.get("address");
        String phone = requestData.get("phone");
        String email = requestData.get("email");
        String queueAlgorithm = requestData.get("queueAlgorithm");
        String subscriptionPlan = requestData.get("subscriptionPlan");

        // Initial Admin Account details
        String adminName = requestData.get("adminName");
        String adminEmail = requestData.get("adminEmail");
        String adminPassword = requestData.get("adminPassword");

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Hospital name is required.");
        }
        if (code == null || code.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Hospital code is required.");
        }

        Hospital hospital = new Hospital();
        hospital.setName(name.trim());
        hospital.setCode(code.trim().toUpperCase());
        hospital.setAddress(address != null ? address.trim() : null);
        hospital.setPhone(phone != null ? phone.trim() : null);
        hospital.setEmail(email != null ? email.trim() : null);
        if (queueAlgorithm != null && !queueAlgorithm.trim().isEmpty()) {
            hospital.setQueueAlgorithm(queueAlgorithm.trim());
        }
        if (subscriptionPlan != null && !subscriptionPlan.trim().isEmpty()) {
            hospital.setSubscriptionPlan(subscriptionPlan.trim().toUpperCase());
        }

        try {
            Hospital saved = hospitalRepository.save(hospital);

            // Auto-create initial HOSPITAL_ADMIN account if email is provided
            if (adminEmail != null && !adminEmail.trim().isEmpty()) {
                String safeAdminName = (adminName != null && !adminName.trim().isEmpty()) ? adminName.trim() : (saved.getName() + " Admin");
                String safeAdminPassword = (adminPassword != null && !adminPassword.trim().isEmpty()) ? adminPassword.trim() : "admin123";
                
                if (userRepository.findByEmail(adminEmail.trim().toLowerCase()).isEmpty()) {
                    User initialAdmin = new User(
                        null,
                        saved.getId(),
                        safeAdminName,
                        adminEmail.trim().toLowerCase(),
                        passwordEncoder.encode(safeAdminPassword),
                        saved.getPhone(),
                        Role.HOSPITAL_ADMIN,
                        true,
                        java.time.LocalDateTime.now()
                    );
                    userRepository.save(initialAdmin);
                }
            }

            auditLogService.log(saved.getId(), tenantSecurityService.getCurrentUser().getUserId(), "HOSPITAL_CREATED", "Registered new hospital tenant: " + saved.getName() + " (" + saved.getCode() + ")");
            return ResponseEntity.ok(saved);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return ResponseEntity.badRequest().body("Hospital code is already in use.");
        }
    }

    @PutMapping("/{hospitalId}/subscription")
    public ResponseEntity<?> updateHospitalSubscription(@PathVariable String hospitalId, @RequestBody java.util.Map<String, String> payload) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);

        String plan = payload.get("subscriptionPlan");
        if (plan == null || plan.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("subscriptionPlan is required (BASIC, PRO, ENTERPRISE).");
        }
        plan = plan.trim().toUpperCase();
        if (!plan.equals("BASIC") && !plan.equals("PRO") && !plan.equals("ENTERPRISE")) {
            return ResponseEntity.badRequest().body("Invalid subscription plan. Allowed values: BASIC, PRO, ENTERPRISE.");
        }

        java.util.Optional<Hospital> hospOpt = hospitalRepository.findById(hospitalId);
        if (hospOpt.isEmpty()) {
            hospOpt = hospitalRepository.findByCode(hospitalId);
        }
        if (hospOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Hospital hospital = hospOpt.get();
        String oldPlan = hospital.getSubscriptionPlan();
        hospital.setSubscriptionPlan(plan);
        Hospital saved = hospitalRepository.save(hospital);

        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "SUBSCRIPTION_CHANGED", 
                "Updated subscription plan from " + oldPlan + " to " + plan);

        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{hospitalId}/departments")
    public ResponseEntity<List<Department>> getDepartments(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        return ResponseEntity.ok(departmentRepository.findByHospitalId(hospitalId));
    }

    @PostMapping("/{hospitalId}/departments")
    public ResponseEntity<?> createDepartment(@PathVariable String hospitalId, @RequestBody Department department) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);

        // Real SaaS Plan limit checks for departments
        Hospital hosp = hospitalRepository.findById(hospitalId).orElse(null);
        if (hosp != null) {
            String plan = hosp.getSubscriptionPlan();
            long deptCount = departmentRepository.findByHospitalId(hospitalId).size();
            if ("BASIC".equalsIgnoreCase(plan) && deptCount >= 1) {
                return ResponseEntity.badRequest().body("Department limit reached for BASIC plan (max 1 department). Upgrade to PRO or ENTERPRISE to add more departments.");
            }
            if ("PRO".equalsIgnoreCase(plan) && deptCount >= 5) {
                return ResponseEntity.badRequest().body("Department limit reached for PRO plan (max 5 departments). Upgrade to ENTERPRISE for unlimited departments.");
            }
        }

        department.setId(null);
        department.setHospitalId(hospitalId);
        Department saved = departmentRepository.save(department);
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{hospitalId}/staff")
    public ResponseEntity<?> createStaffUser(@PathVariable String hospitalId, @Valid @RequestBody RegisterRequest request) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);

        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            return ResponseEntity.badRequest().body("Email is already registered.");
        }

        User user = new User();
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setPhone(request.getPhone());

        // BUG 12 FIX: Whitelist allowed roles — block SUPER_ADMIN and PATIENT from staff endpoint
        Role submittedRole = request.getRole() != null ? request.getRole() : Role.STAFF;
        if (submittedRole == Role.SUPER_ADMIN || submittedRole == Role.PATIENT) {
            return ResponseEntity.badRequest()
                .body("Staff endpoint only allows roles: HOSPITAL_ADMIN, STAFF, DOCTOR");
        }
        user.setRole(submittedRole);
        user.setHospitalId(hospitalId);
        user.setActive(true);

        User saved;
        try {
            saved = userRepository.save(user);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return ResponseEntity.badRequest().body("Email is already registered.");
        }

        // If creating a DOCTOR user, automatically provision Doctor entity
        if (saved.getRole() == Role.DOCTOR && doctorRepository.findByUserId(saved.getId()).isEmpty()) {
            Doctor doc = new Doctor();
            doc.setHospitalId(hospitalId);
            doc.setUserId(saved.getId());
            doc.setName(saved.getName());
            doc.setDepartmentName("General");
            doc.setSpecialization("Specialist");
            doc.setRoomNumber("Room TBD");
            doc.setMaxDailyAppointments(30);
            doc.setAvailable(true);
            doc.setAvailableSlots(Arrays.asList("09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"));
            doctorRepository.save(doc);
            auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "DOCTOR_CREATED", "Provisioned Doctor: " + doc.getName() + " (User ID: " + doc.getUserId() + ")");
        }

        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "STAFF_CREATED", "Created staff: " + saved.getName() + " with role: " + saved.getRole() + " (Email: " + saved.getEmail() + ")");

        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{hospitalId}/patients/search")
    public ResponseEntity<List<User>> searchPatients(@PathVariable String hospitalId, @RequestParam(required = false) String query) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        List<User> patients;
        if (query != null && !query.trim().isEmpty()) {
            String sanitizedQuery = query.trim().replaceAll("[\\\\.*+?^${}()|\\[\\]]", "\\\\$0");
            patients = userRepository.searchPatients(hospitalId, sanitizedQuery);
        } else {
            patients = userRepository.findByHospitalIdAndRole(hospitalId, Role.PATIENT);
        }
        return ResponseEntity.ok(patients);
    }

    @PostMapping("/{hospitalId}/patients")
    public ResponseEntity<?> createPatientUser(@PathVariable String hospitalId, @RequestBody java.util.Map<String, String> payload) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);

        String name = payload.get("name");
        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Patient name is required.");
        }

        String email = payload.get("email");
        if (email == null || email.trim().isEmpty()) {
            email = "walkin." + System.currentTimeMillis() + "." + java.util.UUID.randomUUID().toString().substring(0, 6) + "@hospital.local";
        } else {
            email = email.trim().toLowerCase();
            if (userRepository.findByEmail(email).isPresent()) {
                return ResponseEntity.badRequest().body("Email is already registered to an existing patient.");
            }
        }

        String phone = payload.get("phone");

        User user = new User();
        user.setName(name.trim());
        user.setEmail(email);
        user.setPhone(phone != null && !phone.trim().isEmpty() ? phone.trim() : null);
        user.setPassword(passwordEncoder.encode(java.util.UUID.randomUUID().toString()));
        user.setRole(Role.PATIENT);
        user.setHospitalId(hospitalId);
        user.setActive(true);

        User saved;
        try {
            saved = userRepository.save(user);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return ResponseEntity.badRequest().body("Email is already registered to an existing patient.");
        }

        auditLogService.log(hospitalId, tenantSecurityService.getCurrentUser().getUserId(), "PATIENT_CREATED", "Created patient user: " + saved.getName() + " (Email: " + saved.getEmail() + ")");

        return ResponseEntity.ok(saved);
    }
}
