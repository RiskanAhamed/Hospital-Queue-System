package com.hospital.queue.service;

import com.hospital.queue.model.Notification;
import com.hospital.queue.model.User;
import com.hospital.queue.repository.NotificationRepository;
import com.hospital.queue.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final PushNotificationService pushNotificationService;
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

        // 1. Broadcast over WebSocket (for active in-app sessions)
        String destination = "/topic/hospital/" + hospitalId + "/user/" + userId + "/notifications";
        try {
            messagingTemplate.convertAndSend(destination, saved);
        } catch (Exception e) {
            log.error("Failed to send STOMP websocket notification: {}", e.getMessage(), e);
        }

        // 2. Dispatch Native Mobile Push Notification (works when app is closed / backgrounded)
        try {
            User user = userRepository.findById(userId).orElse(null);
            if (user != null && user.getPushToken() != null && !user.getPushToken().trim().isEmpty()) {
                pushNotificationService.sendExpoPushNotification(
                        user.getPushToken(),
                        title,
                        message,
                        Map.of("hospitalId", hospitalId, "type", type, "notificationId", saved.getId() != null ? saved.getId() : "")
                );
            }
        } catch (Exception e) {
            log.warn("Failed to check user push token for notification: {}", e.getMessage());
        }

        return saved;
    }
}
