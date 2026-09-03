package com.hospital.queue.scheduler;

import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.Doctor;
import com.hospital.queue.model.User;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.DoctorRepository;
import com.hospital.queue.repository.UserRepository;
import com.hospital.queue.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class AppointmentReminderScheduler {

    private final AppointmentRepository appointmentRepository;
    private final NotificationService notificationService;
    private final DoctorRepository doctorRepository;
    private final UserRepository userRepository;

    /**
     * Checks every minute for upcoming appointments (e.g. within 20 mins prior to timeSlot)
     * and sends advance push + in-app notification alerts to patients.
     */
    @Scheduled(fixedRate = 60000)
    public void sendAdvanceAppointmentReminders() {
        try {
            String today = LocalDate.now().toString();
            LocalTime now = LocalTime.now();

            List<Appointment> todayAppointments = appointmentRepository.findByAppointmentDate(today);

            for (Appointment appt : todayAppointments) {
                if (appt.isReminderSent()) {
                    continue;
                }
                if ("CANCELLED".equalsIgnoreCase(appt.getStatus()) || "COMPLETED".equalsIgnoreCase(appt.getStatus())) {
                    continue;
                }
                if (appt.getTimeSlot() == null || appt.getTimeSlot().trim().isEmpty()) {
                    continue;
                }

                try {
                    LocalTime slotTime = LocalTime.parse(appt.getTimeSlot().trim());
                    long minutesUntilSlot = ChronoUnit.MINUTES.between(now, slotTime);

                    // Send reminder if between 0 and 20 minutes before the scheduled time slot
                    if (minutesUntilSlot >= 0 && minutesUntilSlot <= 20) {
                        Optional<Doctor> docOpt = doctorRepository.findById(appt.getDoctorId());
                        String roomNum = docOpt.map(Doctor::getRoomNumber).orElse("TBD");
                        String doctorName = docOpt.map(Doctor::getName).orElse(appt.getDoctorName() != null ? appt.getDoctorName() : "Doctor");

                        String lang = "ta";
                        if (appt.getPatientId() != null) {
                            lang = userRepository.findById(appt.getPatientId())
                                    .map(User::getPreferredLanguage)
                                    .orElse("ta");
                        }

                        String queueTokenStr = appt.getQueueNumber() != null ? " (Token: " + appt.getQueueNumber() + ")" : "";
                        String title = "en".equalsIgnoreCase(lang)
                                ? "Appointment Reminder (in " + minutesUntilSlot + " mins)"
                                : "சந்திப்பு நினைவூட்டல் (இன்னும் " + minutesUntilSlot + " நிமிடங்களில்)";

                        String msg = "en".equalsIgnoreCase(lang)
                                ? "Your appointment with Dr. " + doctorName + " is scheduled for " + appt.getTimeSlot() + queueTokenStr + ". Please arrive near Room " + roomNum + "."
                                : "Dr. " + doctorName + "-உடன் உங்கள் சந்திப்பு " + appt.getTimeSlot() + "-க்கு உள்ளது" + queueTokenStr + ". தயவுசெய்து அறை " + roomNum + " அருகே வரவும்.";

                        notificationService.createAndSendNotification(
                                appt.getHospitalId(),
                                appt.getPatientId(),
                                "APPOINTMENT_REMINDER",
                                title,
                                msg
                        );

                        appt.setReminderSent(true);
                        appointmentRepository.save(appt);
                        log.info("Dispatched advance appointment reminder to patient {} for appointment {}", appt.getPatientId(), appt.getId());
                    }
                } catch (Exception parseEx) {
                    log.debug("Could not parse timeSlot '{}' for appointment {}: {}", appt.getTimeSlot(), appt.getId(), parseEx.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error in sendAdvanceAppointmentReminders scheduler: {}", e.getMessage(), e);
        }
    }
}
