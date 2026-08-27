package com.hospital.queue.repository;

import com.hospital.queue.model.QueueEntry;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface QueueRepository extends MongoRepository<QueueEntry, String> {
    List<QueueEntry> findByHospitalId(String hospitalId);
    List<QueueEntry> findByHospitalIdAndQueueDate(String hospitalId, String queueDate);
    List<QueueEntry> findByHospitalIdAndDoctorId(String hospitalId, String doctorId);
    List<QueueEntry> findByHospitalIdAndDoctorIdAndQueueDate(String hospitalId, String doctorId, String queueDate);
    List<QueueEntry> findByHospitalIdAndDoctorIdAndStatusIn(String hospitalId, String doctorId, List<String> statuses);
    Optional<QueueEntry> findByAppointmentId(String appointmentId);
    Optional<QueueEntry> findFirstByHospitalIdAndDoctorIdAndStatusOrderBySequenceNumberAsc(String hospitalId, String doctorId, String status);
    Optional<QueueEntry> findFirstByHospitalIdAndDoctorIdAndQueueDateAndStatusOrderBySequenceNumberAsc(String hospitalId, String doctorId, String queueDate, String status);
    long countByHospitalIdAndDoctorId(String hospitalId, String doctorId);
    long countByHospitalIdAndDoctorIdAndQueueDate(String hospitalId, String doctorId, String queueDate);
}
