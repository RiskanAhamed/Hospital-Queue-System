package com.hospital.queue.config;

import com.hospital.queue.model.*;
import com.hospital.queue.repository.*;
import com.hospital.queue.service.QueueService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final DoctorRepository doctorRepository;
    private final AppointmentRepository appointmentRepository;
    private final QueueRepository queueRepository;
    private final QueueService queueService;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        try {
            if (hospitalRepository.count() > 0) {
                // Ensure existing hospitals have subscriptionPlan set
                List<Hospital> existingHospitals = hospitalRepository.findAll();
                for (Hospital h : existingHospitals) {
                    if (h.getSubscriptionPlan() == null || h.getSubscriptionPlan().trim().isEmpty()) {
                        h.setSubscriptionPlan("BASIC");
                        hospitalRepository.save(h);
                    }
                }
                return; // Data already initialized
            }

            // 0. Create Platform SUPER_ADMIN (Demo Bootstrap Account)
            User superAdmin = new User(null, null, "MediFlow System Admin", "superadmin@mediflow.com", passwordEncoder.encode("superadmin123"), "+15550000", Role.SUPER_ADMIN, true, java.time.LocalDateTime.now());
            userRepository.save(superAdmin);

            // 1. Create Hospital A
            Hospital hospA = new Hospital();
            hospA.setName("City Care General Hospital");
            hospA.setCode("HOSP001");
            hospA.setAddress("124 Healthcare Boulevard, Cityville");
            hospA.setPhone("+1 (555) 019-2831");
            hospA.setEmail("contact@citycare.org");
            hospA.setSubscriptionPlan("PRO");
            hospA = hospitalRepository.save(hospA);

            // 2. Create Hospital B
            Hospital hospB = new Hospital();
            hospB.setName("Metro Health Specialty Center");
            hospB.setCode("HOSP002");
            hospB.setAddress("45 Metro Towers, Tech Hub");
            hospB.setPhone("+1 (555) 084-9912");
            hospB.setEmail("support@metrohealth.org");
            hospB.setSubscriptionPlan("ENTERPRISE");
            hospB = hospitalRepository.save(hospB);

            // 3. Create Departments for Hospital A
            Department cardA = departmentRepository.save(new Department(null, hospA.getId(), "Cardiology", "CAR", "Heart and cardiovascular care"));
            Department orthoA = departmentRepository.save(new Department(null, hospA.getId(), "Orthopedics", "ORT", "Bone and joint specialists"));
            Department pediaA = departmentRepository.save(new Department(null, hospA.getId(), "Pediatrics", "PED", "Child healthcare and wellness"));

            // Departments for Hospital B
            Department neuroB = departmentRepository.save(new Department(null, hospB.getId(), "Neurology", "NEU", "Brain and nervous system"));
            Department dermaB = departmentRepository.save(new Department(null, hospB.getId(), "Dermatology", "DER", "Skin and cosmetic care"));

            // 4. Create Users (Admins, Staff, Doctors, Patients)
            // Hospital A Admin
            User adminA = new User(null, hospA.getId(), "CityCare Admin", "admin@citycare.org", passwordEncoder.encode("admin123"), "+15551111", Role.HOSPITAL_ADMIN, true, java.time.LocalDateTime.now());
            userRepository.save(adminA);

            // Hospital A Staff
            User staffA = new User(null, hospA.getId(), "Sarah Staff (Desk A)", "staff@citycare.org", passwordEncoder.encode("staff123"), "+15552222", Role.STAFF, true, java.time.LocalDateTime.now());
            userRepository.save(staffA);

            // Hospital A Doctor User
            User docUser1 = new User(null, hospA.getId(), "Dr. Aris Vance", "dr.vance@citycare.org", passwordEncoder.encode("doctor123"), "+15553333", Role.DOCTOR, true, java.time.LocalDateTime.now());
            docUser1 = userRepository.save(docUser1);

            // Hospital A Doctor Record
            Doctor doc1 = new Doctor(null, hospA.getId(), docUser1.getId(), "Dr. Aris Vance", cardA.getId(), cardA.getName(), "Senior Cardiologist", "Room 302", 30, true,
                    Arrays.asList("09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"));
            doc1 = doctorRepository.save(doc1);

            // Hospital A Doctor 2
            User docUser2 = new User(null, hospA.getId(), "Dr. Elena Rostova", "dr.rostova@citycare.org", passwordEncoder.encode("doctor123"), "+15554444", Role.DOCTOR, true, java.time.LocalDateTime.now());
            docUser2 = userRepository.save(docUser2);
            Doctor doc2 = new Doctor(null, hospA.getId(), docUser2.getId(), "Dr. Elena Rostova", orthoA.getId(), orthoA.getName(), "Orthopedic Surgeon", "Room 105", 25, true,
                    Arrays.asList("09:00", "10:00", "11:00", "14:00", "15:00"));
            doctorRepository.save(doc2);

            // Patient User
            User patient1 = new User(null, hospA.getId(), "David Miller", "david.m@gmail.com", passwordEncoder.encode("patient123"), "+15559999", Role.PATIENT, true, java.time.LocalDateTime.now());
            patient1 = userRepository.save(patient1);

            // Hospital B Doctor
            User docUserB = new User(null, hospB.getId(), "Dr. Maya Lin", "dr.lin@metrohealth.org", passwordEncoder.encode("doctor123"), "+15557777", Role.DOCTOR, true, java.time.LocalDateTime.now());
            docUserB = userRepository.save(docUserB);
            Doctor docB = new Doctor(null, hospB.getId(), docUserB.getId(), "Dr. Maya Lin", neuroB.getId(), neuroB.getName(), "Neurologist", "Suite 4B", 20, true,
                    Arrays.asList("10:00", "11:00", "14:00"));
            doctorRepository.save(docB);

            // Patients for Dr. Aris Vance seeded appointments
            User patientA0 = new User(null, hospA.getId(), "Marcus Brody", "marcus.b@gmail.com", passwordEncoder.encode("patient123"), "+15550001", Role.PATIENT, true, java.time.LocalDateTime.now());
            patientA0 = userRepository.save(patientA0);

            User patientA2 = new User(null, hospA.getId(), "Emily Watson", "emily.w@gmail.com", passwordEncoder.encode("patient123"), "+15550002", Role.PATIENT, true, java.time.LocalDateTime.now());
            patientA2 = userRepository.save(patientA2);

            User patientA3 = new User(null, hospA.getId(), "Robert Chen", "robert.c@gmail.com", passwordEncoder.encode("patient123"), "+15550003", Role.PATIENT, true, java.time.LocalDateTime.now());
            patientA3 = userRepository.save(patientA3);

            // Seed initial sample appointments for Dr. Aris Vance
            String todayStr = java.time.LocalDate.now().toString();

            Appointment app0 = new Appointment(null, hospA.getId(), patientA0.getId(), "Marcus Brody", doc1.getId(), doc1.getName(), cardA.getId(), cardA.getName(), todayStr, "08:30", null, "BOOKED", java.time.LocalDateTime.now().minusHours(1));
            app0 = appointmentRepository.save(app0);
            QueueEntry q0 = queueService.generateQueueForAppointment(app0);
            q0.setStatus("COMPLETED");
            q0.setCalledAt(java.time.LocalDateTime.now().minusMinutes(25));
            q0.setCompletedAt(java.time.LocalDateTime.now().minusMinutes(10));
            queueRepository.save(q0);
            app0.setStatus("COMPLETED");
            appointmentRepository.save(app0);

            Appointment app1 = new Appointment(null, hospA.getId(), patient1.getId(), patient1.getName(), doc1.getId(), doc1.getName(), cardA.getId(), cardA.getName(), todayStr, "09:00", null, "BOOKED", java.time.LocalDateTime.now());
            app1 = appointmentRepository.save(app1);
            queueService.generateQueueForAppointment(app1);

            Appointment app2 = new Appointment(null, hospA.getId(), patientA2.getId(), "Emily Watson", doc1.getId(), doc1.getName(), cardA.getId(), cardA.getName(), todayStr, "09:30", null, "BOOKED", java.time.LocalDateTime.now());
            app2 = appointmentRepository.save(app2);
            queueService.generateQueueForAppointment(app2);

            Appointment app3 = new Appointment(null, hospA.getId(), patientA3.getId(), "Robert Chen", doc1.getId(), doc1.getName(), cardA.getId(), cardA.getName(), todayStr, "10:00", null, "BOOKED", java.time.LocalDateTime.now());
            app3 = appointmentRepository.save(app3);
            queueService.generateQueueForAppointment(app3);

            log.info(">>> Multi-Tenant Hospital Data Initialized Successfully!");
        } catch (Exception e) {
            log.error(">>> Data initialization warning: {}", e.getMessage());
        }
    }
}
