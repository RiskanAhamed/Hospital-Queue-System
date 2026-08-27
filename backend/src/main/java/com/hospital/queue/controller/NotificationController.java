package com.hospital.queue.controller;

import com.hospital.queue.model.Notification;
import com.hospital.queue.repository.NotificationRepository;
import com.hospital.queue.security.TenantSecurityService;
import com.hospital.queue.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final TenantSecurityService tenantSecurityService;

    @GetMapping
    public ResponseEntity<List<Notification>> getNotifications(
            @PathVariable String hospitalId,
            @RequestParam(required = false) String userId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        String targetUserId = userId;
        // PATIENT users can only see their own notifications
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole())) {
            targetUserId = currentUser.getUserId();
        } else if (targetUserId == null || targetUserId.trim().isEmpty()) {
            targetUserId = currentUser.getUserId();
        }

        return ResponseEntity.ok(
            notificationRepository.findByHospitalIdAndUserIdOrderByCreatedAtDesc(hospitalId, targetUserId)
        );
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(
            @PathVariable String hospitalId,
            @RequestParam(required = false) String userId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        String targetUserId = userId;
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) || targetUserId == null || targetUserId.trim().isEmpty()) {
            targetUserId = currentUser.getUserId();
        }

        long count = notificationRepository.countByHospitalIdAndUserIdAndRead(hospitalId, targetUserId, false);
        return ResponseEntity.ok(Map.of("unreadCount", count));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<?> markAsRead(@PathVariable String hospitalId, @PathVariable String id) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));

        if (!notification.getHospitalId().equals(hospitalId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Notification belongs to another hospital.");
        }

        // Patients can only mark their own notifications as read
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) && !notification.getUserId().equals(currentUser.getUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: You can only read your own notifications.");
        }

        notification.setRead(true);
        notificationRepository.save(notification);
        return ResponseEntity.ok(Map.of("message", "Notification marked as read"));
    }

    @PostMapping("/read-all")
    public ResponseEntity<?> markAllAsRead(@PathVariable String hospitalId, @RequestParam(required = false) String userId) {
        tenantSecurityService.validateTenantAccess(hospitalId);
        UserPrincipal currentUser = tenantSecurityService.getCurrentUser();

        String targetUserId = userId;
        if ("PATIENT".equalsIgnoreCase(currentUser.getRole()) || targetUserId == null || targetUserId.trim().isEmpty()) {
            targetUserId = currentUser.getUserId();
        }

        List<Notification> unread = notificationRepository.findByHospitalIdAndUserIdOrderByCreatedAtDesc(hospitalId, targetUserId);
        for (Notification n : unread) {
            if (!n.isRead()) {
                n.setRead(true);
                notificationRepository.save(n);
            }
        }
        return ResponseEntity.ok(Map.of("message", "All notifications marked as read"));
    }
}
