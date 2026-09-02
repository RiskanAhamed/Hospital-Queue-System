package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "doctors")
public class Doctor {
    @Id
    private String id;
    private String hospitalId;
    private String userId;
    private String name;
    private String departmentId;
    private String departmentName;
    private String specialization;
    private String roomNumber;
    private int maxDailyAppointments = 30;
    private boolean available = true;
    private List<String> availableSlots; // e.g. ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"]
    private Double averageRating = 5.0;
    private Integer totalRatings = 0;
}
