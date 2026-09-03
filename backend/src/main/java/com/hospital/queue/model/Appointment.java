package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "appointments")
public class Appointment {
    @Id
    private String id;
    private String hospitalId;
    private String patientId;
    private String patientName;
    private String doctorId;
    private String doctorName;
    private String departmentId;
    private String departmentName;
    private String appointmentDate; // YYYY-MM-DD
    private String timeSlot; // HH:mm
    private String queueNumber; // e.g. CAR-12
    private String status = "BOOKED"; // BOOKED, CHECKED_IN, IN_CONSULTATION, COMPLETED, CANCELLED
    private Integer rating; // 1 to 5 stars
    private String feedbackComment;
    private LocalDateTime ratedAt;
    private boolean reminderSent = false;
    private LocalDateTime createdAt = LocalDateTime.now();

    public Appointment(String id, String hospitalId, String patientId, String patientName, String doctorId, String doctorName, String departmentId, String departmentName, String appointmentDate, String timeSlot, String queueNumber, String status, LocalDateTime createdAt) {
        this.id = id;
        this.hospitalId = hospitalId;
        this.patientId = patientId;
        this.patientName = patientName;
        this.doctorId = doctorId;
        this.doctorName = doctorName;
        this.departmentId = departmentId;
        this.departmentName = departmentName;
        this.appointmentDate = appointmentDate;
        this.timeSlot = timeSlot;
        this.queueNumber = queueNumber;
        this.status = status;
        this.createdAt = createdAt;
    }
}
