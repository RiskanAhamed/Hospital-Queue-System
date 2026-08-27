package com.hospital.queue.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public class AppointmentDtos {

    @Data
    public static class BookAppointmentRequest {
        private String hospitalId;
        private String patientId;

        @Size(max = 100, message = "Patient name must not exceed 100 characters")
        private String patientName;

        @NotBlank(message = "Doctor ID is required")
        private String doctorId;
        private String departmentId;

        @NotBlank(message = "Appointment date is required")
        private String appointmentDate; // YYYY-MM-DD

        @NotBlank(message = "Time slot is required")
        private String timeSlot;
    }

    @Data
    public static class QueueActionRequest {
        private String hospitalId;
        private String doctorId;
        private String action; // CALL_NEXT, START_CONSULTATION, COMPLETE, SKIP, RECALL, CANCEL
        private String queueId;
    }

    @Data
    public static class LiveQueueStatusResponse {
        private String doctorId;
        private String doctorName;
        private String currentServingToken; // e.g. "A-21"
        private String currentStatus; // IN_CONSULTATION, CALLED, IDLE
        private int totalWaiting;
        private int totalCompleted;
    }
}
