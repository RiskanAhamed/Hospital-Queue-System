package com.hospital.queue.repository;

import com.hospital.queue.model.Notification;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface NotificationRepository extends MongoRepository<Notification, String> {
    List<Notification> findByHospitalIdAndUserIdOrderByCreatedAtDesc(String hospitalId, String userId);
    long countByHospitalIdAndUserIdAndRead(String hospitalId, String userId, boolean read);
}
