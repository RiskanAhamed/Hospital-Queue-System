package com.hospital.queue.service;

import com.hospital.queue.model.Notification;
import com.hospital.queue.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public Notification createAndSendNotification(String hospitalId, String userId, String type, String title, String message) {
        if (userId == null || userId.trim().isEmpty()) {
            return null;
        }

        Notification notification = new Notification();
        notification.setHospitalId(hospitalId);
        notification.setUserId(userId);
        notification.setType(type);
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setRead(false);
        notification.setCreatedAt(LocalDateTime.now());

        Notification saved = notificationRepository.save(notification);

        // Broadcast over WebSocket
        String destination = "/topic/hospital/" + hospitalId + "/user/" + userId + "/notifications";
        try {
            messagingTemplate.convertAndSend(destination, saved);
        } catch (Exception e) {
            // FIX #15: Use SLF4J logger instead of System.err.println
            log.error("Failed to send STOMP websocket notification: {}", e.getMessage(), e);
        }

        return saved;
    }
}
