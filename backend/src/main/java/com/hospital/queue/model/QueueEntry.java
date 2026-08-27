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
@Document(collection = "queues")
public class QueueEntry {
    @Id
    private String id;
    private String hospitalId;
    private String doctorId;
    private String appointmentId;
    private String patientId;
    private String patientName;
    private String queueNumber; // e.g. A-21
    private int sequenceNumber;
    private String queueDate; // YYYY-MM-DD
    private String status = "WAITING"; // WAITING, CALLED, IN_CONSULTATION, COMPLETED, SKIPPED, CANCELLED
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime calledAt;
    private LocalDateTime completedAt;
}
