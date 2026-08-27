package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "notifications")
public class Notification {
    @Id
    private String id;
    private String hospitalId;
    private String userId;
    private String type; // e.g., APPOINTMENT_CONFIRMED, APPOINTMENT_CANCELLED, QUEUE_TURN, QUEUE_NEXT
    private String title;
    private String message;
    private boolean read = false;
    private LocalDateTime createdAt = LocalDateTime.now();
}
