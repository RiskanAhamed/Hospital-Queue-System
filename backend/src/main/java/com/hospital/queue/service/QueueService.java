package com.hospital.queue.service;

import com.hospital.queue.model.Appointment;
import com.hospital.queue.model.QueueCounter;
import com.hospital.queue.model.QueueEntry;
import com.hospital.queue.repository.AppointmentRepository;
import com.hospital.queue.repository.QueueRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import com.hospital.queue.model.Doctor;
import com.hospital.queue.repository.DoctorRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@Service
@RequiredArgsConstructor
public class QueueService {

    private final QueueRepository queueRepository;
    private final AppointmentRepository appointmentRepository;
    private final DoctorRepository doctorRepository;
    private final com.hospital.queue.repository.UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationService notificationService;
    private final EmailService emailService;
    private final com.hospital.queue.repository.HospitalRepository hospitalRepository;
    private final MongoTemplate mongoTemplate;

    private String getPatientLanguage(String patientId) {
        if (patientId == null || patientId.trim().isEmpty()) return "ta";
        try {
            return userRepository.findById(patientId)
                    .map(com.hospital.queue.model.User::getPreferredLanguage)
                    .orElse("ta");
        } catch (Exception e) {
            return "ta";
        }
    }

    /**
     * FIX #9: Atomically generate the next sequence number for a doctor's queue on a given date.
     * Uses MongoDB's findAndModify with $inc to guarantee uniqueness even under concurrent requests.
     */
    private int getNextSequenceNumber(String hospitalId, String doctorId, String queueDate) {
        Query query = new Query(Criteria.where("hospitalId").is(hospitalId)
                .and("doctorId").is(doctorId)
                .and("queueDate").is(queueDate));
        Update update = new Update().inc("sequenceNumber", 1);
        FindAndModifyOptions options = FindAndModifyOptions.options().returnNew(true).upsert(true);

        QueueCounter counter = mongoTemplate.findAndModify(query, update, options, QueueCounter.class);
        return counter != null ? counter.getSequenceNumber() : 1;
    }

    public QueueEntry generateQueueForAppointment(Appointment appointment) {
        String targetDate = (appointment.getAppointmentDate() != null && !appointment.getAppointmentDate().trim().isEmpty())
                ? appointment.getAppointmentDate() : LocalDate.now().toString();

        // FIX #9: Use atomic counter instead of count+1 pattern
        int nextSequence = getNextSequenceNumber(appointment.getHospitalId(), appointment.getDoctorId(), targetDate);

        // BUG 15 FIX: Guard against empty departmentName
        String prefix = (appointment.getDepartmentName() != null && !appointment.getDepartmentName().isEmpty())
                ? appointment.getDepartmentName().substring(0, 1).toUpperCase() : "A";
        String queueNum = prefix + "-" + String.format("%02d", nextSequence);

        QueueEntry entry = new QueueEntry();
        entry.setHospitalId(appointment.getHospitalId());
        entry.setDoctorId(appointment.getDoctorId());
        entry.setAppointmentId(appointment.getId());
        entry.setPatientId(appointment.getPatientId());
        entry.setPatientName(appointment.getPatientName());
        entry.setQueueNumber(queueNum);
        entry.setSequenceNumber(nextSequence);
        entry.setQueueDate(targetDate);
        entry.setStatus("WAITING");

        QueueEntry saved = queueRepository.save(entry);

        appointment.setQueueNumber(queueNum);
        appointment.setStatus("CHECKED_IN");
        appointmentRepository.save(appointment);

        // Check if patient is first or next in line (e.g. no one ahead)
        List<QueueEntry> waitingList = queueRepository.findByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(
                appointment.getHospitalId(), appointment.getDoctorId(), targetDate, "WAITING");

        if (waitingList.size() <= 1) {
            Optional<Doctor> docOpt = doctorRepository.findById(appointment.getDoctorId());
            String roomNum = docOpt.map(Doctor::getRoomNumber).orElse("TBD");
            String doctorName = docOpt.map(Doctor::getName).orElse(appointment.getDoctorName() != null ? appointment.getDoctorName() : "Doctor");
            String lang = getPatientLanguage(appointment.getPatientId());

            String nextTitle = "en".equalsIgnoreCase(lang)
                    ? "You're Next, Please Be Ready!"
                    : "அடுத்து உங்கள் முறை! (You're Next)";
            String nextMsg = "en".equalsIgnoreCase(lang)
                    ? "Your token is " + queueNum + ". There is no one ahead for Dr. " + doctorName + ". Please be ready near Room " + roomNum + "."
                    : "உங்கள் டோக்கன் " + queueNum + ". Dr. " + doctorName + "-ஐ சந்திக்க வரிசையில் யாரும் இல்லை (அடுத்து உங்கள் முறை). தயவுசெய்து அறை " + roomNum + " அருகே தயாராக இருக்கவும்.";

            notificationService.createAndSendNotification(
                    appointment.getHospitalId(),
                    appointment.getPatientId(),
                    "QUEUE_NEXT",
                    nextTitle,
                    nextMsg
            );
        }

        broadcastQueueState(appointment.getHospitalId(), appointment.getDoctorId());
        return saved;
    }

    public QueueEntry callNextPatient(String hospitalId, String doctorId) {
        if (doctorId == null || doctorId.trim().isEmpty()) return null;
        // Verify doctor belongs to hospital
        Optional<Doctor> docOpt = doctorRepository.findById(doctorId);
        if (docOpt.isPresent() && !docOpt.get().getHospitalId().equals(hospitalId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Doctor does not belong to specified hospital.");
        }

        String today = LocalDate.now().toString();

        // Complete any current consultation
        Optional<QueueEntry> current = queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, today, "IN_CONSULTATION");
        if (current.isEmpty()) {
            current = queueRepository.findFirstByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, "IN_CONSULTATION");
        }
        current.ifPresent(q -> {
            q.setStatus("COMPLETED");
            q.setCompletedAt(LocalDateTime.now());
            queueRepository.save(q);
            if (q.getAppointmentId() != null) {
                appointmentRepository.findById(q.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("COMPLETED");
                    appointmentRepository.save(appt);
                });
            }
            sendRatingAndCompletionAlerts(q);
        });

        // Find next waiting patient
        Optional<QueueEntry> nextWaiting = queueRepository.findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, today, "WAITING");
        if (nextWaiting.isEmpty()) {
            nextWaiting = queueRepository.findFirstByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, "WAITING");
        }
        if (nextWaiting.isPresent()) {
            QueueEntry queue = nextWaiting.get();
            queue.setStatus("CALLED");
            queue.setCalledAt(LocalDateTime.now());
            QueueEntry updated = queueRepository.save(queue);

            if (queue.getAppointmentId() != null) {
                appointmentRepository.findById(queue.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("CALLED");
                    appointmentRepository.save(appt);
                });
            }

            // Notify the called patient "It's your turn"
            String roomNum = docOpt.map(Doctor::getRoomNumber).orElse("TBD");
            String doctorName = docOpt.map(Doctor::getName).orElse("your doctor");

            String langTurn = getPatientLanguage(updated.getPatientId());
            String turnTitle = "en".equalsIgnoreCase(langTurn) ? "It's your turn" : "உங்கள் முறை வந்துவிட்டது! (It's your turn)";
            String turnMsg = "en".equalsIgnoreCase(langTurn) 
                    ? "Please proceed to Room " + roomNum + " for Doctor " + doctorName + "."
                    : "தயவுசெய்து Dr. " + doctorName + "-ஐ சந்திக்க அறை " + roomNum + "-க்குள் செல்லவும்.";

            notificationService.createAndSendNotification(
                    hospitalId,
                    updated.getPatientId(),
                    "QUEUE_TURN",
                    turnTitle,
                    turnMsg
            );

            // Fetch upcoming waiting patients for proximity alerts
            List<QueueEntry> waitingList = queueRepository.findByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, today, "WAITING");
            if (waitingList.isEmpty()) {
                waitingList = queueRepository.findByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(hospitalId, doctorId, "WAITING");
            }

            // 1. Alert the patient directly next in line (1 away)
            if (waitingList.size() > 0) {
                QueueEntry next1 = waitingList.get(0);
                String langNext = getPatientLanguage(next1.getPatientId());
                String nextTitle = "en".equalsIgnoreCase(langNext) ? "You're next, please be ready" : "அடுத்து உங்கள் முறை! (You're Next)";
                String nextMsg = "en".equalsIgnoreCase(langNext)
                        ? "You are next in line for Doctor " + doctorName + ". Please be ready near Room " + roomNum + "."
                        : "Dr. " + doctorName + "-க்கு அடுத்து உங்கள் முறை. தயவுசெய்து அறை " + roomNum + " அருகே தயாராக இருக்கவும்.";

                notificationService.createAndSendNotification(
                        hospitalId,
                        next1.getPatientId(),
                        "QUEUE_NEXT",
                        nextTitle,
                        nextMsg
                );
            }

            // 2. Alert the patient 2 tokens away (Proximity Alert)
            if (waitingList.size() > 1) {
                QueueEntry next2 = waitingList.get(1);
                String langProx = getPatientLanguage(next2.getPatientId());
                String proxTitle = "en".equalsIgnoreCase(langProx) ? "Your turn is approaching (2 tokens away)" : "வரிசை எச்சரிக்கை (2 டோக்கன்கள் உள்ளன)";
                String proxMsg = "en".equalsIgnoreCase(langProx)
                        ? "Only 2 patients ahead for Doctor " + doctorName + " in Room " + roomNum + ". Please head towards the waiting area."
                        : "Dr. " + doctorName + "-ஐ சந்திக்க இன்னும் 2 நபர்களே உள்ளனர் (அறை " + roomNum + "). தயவுசெய்து காத்திருப்பு பகுதிக்கு வரவும்.";

                notificationService.createAndSendNotification(
                        hospitalId,
                        next2.getPatientId(),
                        "QUEUE_PROXIMITY_ALERT",
                        proxTitle,
                        proxMsg
                );
            }

            broadcastQueueState(hospitalId, doctorId);
            return updated;
        }
        broadcastQueueState(hospitalId, doctorId);
        return null;
    }

    public QueueEntry startConsultation(String hospitalId, String queueId) {
        if (queueId == null || queueId.trim().isEmpty()) return null;
        Optional<QueueEntry> optionalQueue = queueRepository.findById(queueId);
        if (optionalQueue.isPresent()) {
            QueueEntry entry = optionalQueue.get();
            if (!entry.getHospitalId().equals(hospitalId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Queue entry does not belong to specified hospital.");
            }
            entry.setStatus("IN_CONSULTATION");
            QueueEntry saved = queueRepository.save(entry);

            if (saved.getAppointmentId() != null) {
                appointmentRepository.findById(saved.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("IN_CONSULTATION");
                    appointmentRepository.save(appt);
                });
            }

            broadcastQueueState(saved.getHospitalId(), saved.getDoctorId());
            return saved;
        }
        return null;
    }

    public QueueEntry completeConsultation(String hospitalId, String queueId) {
        if (queueId == null || queueId.trim().isEmpty()) return null;
        Optional<QueueEntry> optionalQueue = queueRepository.findById(queueId);
        if (optionalQueue.isPresent()) {
            QueueEntry entry = optionalQueue.get();
            if (!entry.getHospitalId().equals(hospitalId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Queue entry does not belong to specified hospital.");
            }
            entry.setStatus("COMPLETED");
            entry.setCompletedAt(LocalDateTime.now());
            QueueEntry saved = queueRepository.save(entry);

            // Update associated appointment
            if (saved.getAppointmentId() != null) {
                appointmentRepository.findById(saved.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("COMPLETED");
                    appointmentRepository.save(appt);
                });
            }

            sendRatingAndCompletionAlerts(saved);

            broadcastQueueState(saved.getHospitalId(), saved.getDoctorId());
            return saved;
        }
        return null;
    }

    private void sendRatingAndCompletionAlerts(QueueEntry queueEntry) {
        if (queueEntry == null || queueEntry.getPatientId() == null) return;
        try {
            String hospitalId = queueEntry.getHospitalId();
            String patientId = queueEntry.getPatientId();
            String lang = getPatientLanguage(patientId);

            final String doctorName = queueEntry.getDoctorId() != null
                    ? doctorRepository.findById(queueEntry.getDoctorId()).map(Doctor::getName).orElse("your doctor")
                    : "your doctor";

            String title = "en".equalsIgnoreCase(lang) ? "Consultation Completed - Rate Your Doctor" : "சிகிச்சை முடிந்தது - உங்கள் மருத்துவரை மதிப்பிடுங்கள்";
            String msg = "en".equalsIgnoreCase(lang) 
                    ? "Your consultation with Dr. " + doctorName + " is complete. Please rate your experience (1-5 stars)."
                    : "Dr. " + doctorName + "-உடனான சிகிச்சை முடிந்தது. உங்கள் அனுபவத்திற்கு 1-5 நட்சத்திர மதிப்பீடு வழங்கவும்.";

            notificationService.createAndSendNotification(hospitalId, patientId, "RATE_DOCTOR", title, msg);

            // Send Gmail / Email notification if patient has an email address
            userRepository.findById(patientId).ifPresent(patientUser -> {
                if (patientUser.getEmail() != null && !patientUser.getEmail().trim().isEmpty()) {
                    String hospitalName = hospitalRepository.findById(hospitalId)
                            .map(com.hospital.queue.model.Hospital::getName)
                            .orElse("MediFlow Hospital");
                    emailService.sendConsultationRatingEmail(
                            patientUser.getEmail(),
                            patientUser.getName(),
                            doctorName,
                            hospitalName,
                            queueEntry.getAppointmentId()
                    );
                }
            });
        } catch (Exception e) {
            log.warn("Failed to dispatch consultation completion alerts: {}", e.getMessage());
        }
    }

    public QueueEntry skipPatient(String hospitalId, String queueId) {
        if (queueId == null || queueId.trim().isEmpty()) return null;
        Optional<QueueEntry> optionalQueue = queueRepository.findById(queueId);
        if (optionalQueue.isPresent()) {
            QueueEntry entry = optionalQueue.get();
            if (!entry.getHospitalId().equals(hospitalId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Queue entry does not belong to specified hospital.");
            }
            entry.setStatus("SKIPPED");
            QueueEntry saved = queueRepository.save(entry);

            if (saved.getAppointmentId() != null) {
                appointmentRepository.findById(saved.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("SKIPPED");
                    appointmentRepository.save(appt);
                });
            }

            broadcastQueueState(saved.getHospitalId(), saved.getDoctorId());
            return saved;
        }
        return null;
    }

    public QueueEntry recallPatient(String hospitalId, String queueId) {
        if (queueId == null || queueId.trim().isEmpty()) return null;
        Optional<QueueEntry> optionalQueue = queueRepository.findById(queueId);
        if (optionalQueue.isPresent()) {
            QueueEntry entry = optionalQueue.get();
            if (!entry.getHospitalId().equals(hospitalId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Queue entry does not belong to specified hospital.");
            }
            if (!"SKIPPED".equalsIgnoreCase(entry.getStatus()) && !"CALLED".equalsIgnoreCase(entry.getStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only SKIPPED or CALLED patients can be recalled.");
            }
            entry.setStatus("CALLED");
            entry.setCalledAt(LocalDateTime.now());
            QueueEntry saved = queueRepository.save(entry);

            if (saved.getAppointmentId() != null) {
                appointmentRepository.findById(saved.getAppointmentId()).ifPresent(appt -> {
                    appt.setStatus("CALLED");
                    appointmentRepository.save(appt);
                });
            }

            broadcastQueueState(saved.getHospitalId(), saved.getDoctorId());
            return saved;
        }
        return null;
    }

    public List<QueueEntry> getDoctorQueue(String hospitalId, String doctorId) {
        return getDoctorQueue(hospitalId, doctorId, LocalDate.now().toString());
    }

    public List<QueueEntry> getDoctorQueue(String hospitalId, String doctorId, String date) {
        String targetDate = (date != null && !date.trim().isEmpty()) ? date : LocalDate.now().toString();
        List<QueueEntry> entries = queueRepository.findByHospitalIdAndDoctorIdAndQueueDate(hospitalId, doctorId, targetDate);
        if (entries.isEmpty()) {
            return queueRepository.findByHospitalIdAndDoctorId(hospitalId, doctorId).stream()
                    .filter(e -> e.getQueueDate() == null || targetDate.equals(e.getQueueDate()) || (e.getCreatedAt() != null && targetDate.equals(e.getCreatedAt().toLocalDate().toString())))
                    .collect(Collectors.toList());
        }
        return entries;
    }

    public Map<String, Object> getQueueSummary(String hospitalId, String doctorId) {
        return getQueueSummary(hospitalId, doctorId, LocalDate.now().toString());
    }

    public Map<String, Object> getQueueSummary(String hospitalId, String doctorId, String date) {
        String targetDate = (date != null && !date.trim().isEmpty()) ? date : LocalDate.now().toString();
        if (doctorId == null || doctorId.trim().isEmpty()) {
            return Map.of(
                "hospitalId", hospitalId != null ? hospitalId : "",
                "doctorId", "",
                "currentlyServingToken", "--",
                "currentlyServingPatient", "None",
                "currentlyServingStatus", "IDLE",
                "waitingCount", 0L,
                "completedCount", 0L,
                "totalEntries", 0,
                "entries", List.of()
            );
        }
        List<QueueEntry> entries = queueRepository.findByHospitalIdAndDoctorIdAndQueueDate(hospitalId, doctorId, targetDate);
        if (entries.isEmpty()) {
            entries = queueRepository.findByHospitalIdAndDoctorId(hospitalId, doctorId).stream()
                    .filter(e -> e.getQueueDate() == null || targetDate.equals(e.getQueueDate()) || (e.getCreatedAt() != null && targetDate.equals(e.getCreatedAt().toLocalDate().toString())))
                    .collect(Collectors.toList());
        }
        
        QueueEntry currentServing = entries.stream()
                .filter(e -> "CALLED".equalsIgnoreCase(e.getStatus()) || "IN_CONSULTATION".equalsIgnoreCase(e.getStatus()))
                .findFirst()
                .orElse(null);

        long waitingCount = entries.stream().filter(e -> "WAITING".equalsIgnoreCase(e.getStatus())).count();
        long completedCount = entries.stream().filter(e -> "COMPLETED".equalsIgnoreCase(e.getStatus())).count();

        Map<String, Object> summary = new HashMap<>();
        summary.put("hospitalId", hospitalId);
        summary.put("doctorId", doctorId);
        summary.put("currentlyServingToken", currentServing != null ? currentServing.getQueueNumber() : "--");
        summary.put("currentlyServingPatient", currentServing != null ? currentServing.getPatientName() : "None");
        summary.put("currentlyServingStatus", currentServing != null ? currentServing.getStatus() : "IDLE");
        summary.put("waitingCount", waitingCount);
        summary.put("completedCount", completedCount);
        summary.put("totalEntries", entries.size());
        summary.put("entries", entries);
        return summary;
    }

    public void broadcastQueueState(String hospitalId, String doctorId) {
        if (hospitalId == null || doctorId == null || doctorId.trim().isEmpty()) return;
        Map<String, Object> summary = getQueueSummary(hospitalId, doctorId);
        String destination = "/topic/hospital/" + hospitalId + "/queue/" + doctorId;
        messagingTemplate.convertAndSend(destination, summary);
    }
}
