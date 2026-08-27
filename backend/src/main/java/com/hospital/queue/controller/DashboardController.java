package com.hospital.queue.controller;

import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.QueueEntry;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.HospitalRepository;
import com.hospital.queue.repository.QueueRepository;
import com.hospital.queue.security.TenantSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.hospital.queue.repository.DepartmentRepository;
import com.hospital.queue.model.Department;

import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final AppointmentRepository appointmentRepository;
    private final DoctorRepository doctorRepository;
    private final HospitalRepository hospitalRepository;
    private final QueueRepository queueRepository;
    private final TenantSecurityService tenantSecurityService;
    private final DepartmentRepository departmentRepository;

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getDashboardStats(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF, Role.DOCTOR);
        String today = LocalDate.now().toString();

        // FIX #7: Use date-filtered queries instead of loading ALL records and filtering in-memory.
        // This pushes the date predicate to MongoDB for O(1)-ish vs O(n) at scale.
        List<Doctor> doctors = doctorRepository.findByHospitalId(hospitalId);
        List<Appointment> appointments = appointmentRepository.findByHospitalIdAndAppointmentDate(hospitalId, today);
        List<QueueEntry> queueEntries = queueRepository.findByHospitalIdAndQueueDate(hospitalId, today);

        long totalAppointments = appointments.size();
        long completed = queueEntries.stream()
                .filter(q -> "COMPLETED".equalsIgnoreCase(q.getStatus()))
                .count();
        if (completed == 0) {
            completed = appointments.stream().filter(a -> "COMPLETED".equalsIgnoreCase(a.getStatus())).count();
        }

        long waiting = queueEntries.stream()
                .filter(q -> "WAITING".equalsIgnoreCase(q.getStatus()) || "CALLED".equalsIgnoreCase(q.getStatus()) || "IN_CONSULTATION".equalsIgnoreCase(q.getStatus()))
                .count();

        long cancelled = appointments.stream()
                .filter(a -> "CANCELLED".equalsIgnoreCase(a.getStatus()))
                .count();

        // 1. Calculate Real Average Wait Time in Minutes (from calledAt to completedAt)
        List<QueueEntry> completedWithTimes = queueEntries.stream()
                .filter(q -> "COMPLETED".equalsIgnoreCase(q.getStatus()) && q.getCalledAt() != null && q.getCompletedAt() != null)
                .collect(Collectors.toList());

        long avgWaitMinutes = 0;
        if (!completedWithTimes.isEmpty()) {
            double totalWaitSecs = completedWithTimes.stream()
                    .mapToDouble(q -> Math.max(0, Duration.between(q.getCalledAt(), q.getCompletedAt()).getSeconds()))
                    .sum();
            avgWaitMinutes = Math.max(1, Math.round(totalWaitSecs / completedWithTimes.size() / 60.0));
        }

        // 2. Calculate Real Peak Hours (hour with maximum queue/appointment creations today)
        Map<Integer, Long> hourCounts = new HashMap<>();
        for (QueueEntry q : queueEntries) {
            if (q.getCreatedAt() != null) {
                int h = q.getCreatedAt().getHour();
                hourCounts.put(h, hourCounts.getOrDefault(h, 0L) + 1);
            }
        }
        for (Appointment a : appointments) {
            if (a.getCreatedAt() != null) {
                int h = a.getCreatedAt().getHour();
                hourCounts.put(h, hourCounts.getOrDefault(h, 0L) + 1);
            }
        }

        String peakHoursStr = "Not enough data";
        if (!hourCounts.isEmpty()) {
            Map.Entry<Integer, Long> maxEntry = Collections.max(hourCounts.entrySet(), Map.Entry.comparingByValue());
            if (maxEntry.getValue() > 0) {
                int peakH = maxEntry.getKey();
                String startStr = String.format("%02d:00 %s", (peakH % 12 == 0 ? 12 : peakH % 12), (peakH < 12 ? "AM" : "PM"));
                int endH = (peakH + 1) % 24;
                String endStr = String.format("%02d:00 %s", (endH % 12 == 0 ? 12 : endH % 12), (endH < 12 ? "AM" : "PM"));
                peakHoursStr = startStr + " - " + endStr;
            }
        }

        // 3. Hourly distribution array for hours [8..16] (8 AM to 4 PM)
        int[] hours = {8, 9, 10, 11, 12, 13, 14, 15, 16};
        List<Long> hourlyDistribution = new ArrayList<>();
        for (int h : hours) {
            hourlyDistribution.add(hourCounts.getOrDefault(h, 0L));
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("hospitalId", hospitalId);
        // Expose both naming variants for complete frontend compatibility
        stats.put("totalAppointments", totalAppointments);
        stats.put("totalAppointmentsToday", totalAppointments);
        stats.put("completedAppointments", completed);
        stats.put("completedCount", completed);
        stats.put("activeQueuePatients", waiting);
        stats.put("waitingCount", waiting);
        stats.put("cancelledAppointments", cancelled);
        stats.put("activeDoctorsCount", doctors.stream().filter(Doctor::isAvailable).count());
        stats.put("avgWaitMinutes", avgWaitMinutes);
        stats.put("peakHours", peakHoursStr);
        stats.put("hourlyDistribution", hourlyDistribution);

        return ResponseEntity.ok(stats);
    }

    @GetMapping("/reports/appointments-by-date")
    public ResponseEntity<?> getAppointmentsByDate(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        List<Appointment> appts = appointmentRepository.findByHospitalId(hospitalId);

        Map<String, Long> dateCounts = appts.stream()
                .filter(a -> a.getAppointmentDate() != null)
                .collect(Collectors.groupingBy(Appointment::getAppointmentDate, Collectors.counting()));

        List<Map<String, Object>> result = new ArrayList<>();
        LocalDate start = LocalDate.now().minusDays(29);
        for (int i = 0; i < 30; i++) {
            String dateStr = start.plusDays(i).toString();
            Map<String, Object> entry = new HashMap<>();
            entry.put("date", dateStr);
            entry.put("count", dateCounts.getOrDefault(dateStr, 0L));
            result.add(entry);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/reports/cancellation-stats")
    public ResponseEntity<?> getCancellationStats(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        List<Appointment> appts = appointmentRepository.findByHospitalId(hospitalId);
        long totalBooked = appts.size();
        long totalCancelled = appts.stream()
                .filter(a -> "CANCELLED".equalsIgnoreCase(a.getStatus()))
                .count();
        double percentage = totalBooked > 0 ? ((double) totalCancelled / totalBooked) * 100.0 : 0.0;

        Map<String, Object> result = new HashMap<>();
        result.put("totalBooked", totalBooked);
        result.put("totalCancelled", totalCancelled);
        result.put("cancellationPercentage", percentage);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/reports/doctor-workload")
    public ResponseEntity<?> getDoctorWorkload(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        List<Doctor> doctors = doctorRepository.findByHospitalId(hospitalId);
        List<Appointment> appts = appointmentRepository.findByHospitalId(hospitalId);

        Map<String, List<Appointment>> apptsByDoctor = appts.stream()
                .filter(a -> a.getDoctorId() != null)
                .collect(Collectors.groupingBy(Appointment::getDoctorId));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Doctor doc : doctors) {
            List<Appointment> docAppts = apptsByDoctor.getOrDefault(doc.getId(), Collections.emptyList());
            long total = docAppts.size();
            long completedCount = docAppts.stream()
                    .filter(a -> "COMPLETED".equalsIgnoreCase(a.getStatus()))
                    .count();

            Map<String, Object> docStats = new HashMap<>();
            docStats.put("doctorId", doc.getId());
            docStats.put("doctorName", doc.getName());
            docStats.put("totalAppointments", total);
            docStats.put("completedAppointments", completedCount);
            result.add(docStats);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/reports/department-workload")
    public ResponseEntity<?> getDepartmentWorkload(@PathVariable String hospitalId) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN, Role.STAFF);
        List<Department> departments = departmentRepository.findByHospitalId(hospitalId);
        List<Appointment> appts = appointmentRepository.findByHospitalId(hospitalId);

        Map<String, List<Appointment>> apptsByDept = appts.stream()
                .filter(a -> a.getDepartmentId() != null)
                .collect(Collectors.groupingBy(Appointment::getDepartmentId));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Department dept : departments) {
            List<Appointment> deptAppts = apptsByDept.getOrDefault(dept.getId(), Collections.emptyList());
            long total = deptAppts.size();

            Map<String, Object> deptStats = new HashMap<>();
            deptStats.put("departmentId", dept.getId());
            deptStats.put("departmentName", dept.getName());
            deptStats.put("totalAppointments", total);
            result.add(deptStats);
        }
        return ResponseEntity.ok(result);
    }
}
