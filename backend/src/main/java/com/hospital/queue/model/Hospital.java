package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "hospitals")
public class Hospital {
    @Id
    private String id;
    private String name;

    @Indexed(unique = true)
    private String code;
    private String address;
    private String phone;
    private String email;
    private String subscriptionPlan = "BASIC";
    private String queueAlgorithm = "FIFO";
    private boolean active = true;
    private LocalDateTime createdAt = LocalDateTime.now();

    public String getSubscriptionPlan() {
        return (subscriptionPlan == null || subscriptionPlan.trim().isEmpty()) ? "BASIC" : subscriptionPlan;
    }

    public String getQueueAlgorithm() {
        return (queueAlgorithm == null || queueAlgorithm.trim().isEmpty()) ? "FIFO" : queueAlgorithm;
    }
}
