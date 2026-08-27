package com.hospital.queue.dto;

import com.hospital.queue.model.Role;
import lombok.Data;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuthDtos {

    @Data
    public static class LoginRequest {
        @NotBlank
        @Email
        private String email;

        @NotBlank
        private String password;
        private String hospitalId;
    }

    @Data
    public static class RegisterRequest {
        @NotBlank(message = "Name cannot be blank")
        @Size(max = 100, message = "Name must not exceed 100 characters")
        private String name;

        @NotBlank(message = "Email cannot be blank")
        @Email(message = "Invalid email address format")
        @Size(max = 100, message = "Email must not exceed 100 characters")
        private String email;

        @NotBlank(message = "Password cannot be blank")
        @Size(min = 6, max = 100, message = "Password must be between 6 and 100 characters")
        private String password;

        @Size(max = 20, message = "Phone must not exceed 20 characters")
        private String phone;
        private Role role = Role.PATIENT;
        private String hospitalId;
        private String hospitalCode;
    }

    @Data
    public static class AuthResponse {
        private String token;
        private String userId;
        private String name;
        private String email;
        private String role;
        private String hospitalId;
        private String hospitalName;

        public AuthResponse(String token, String userId, String name, String email, String role, String hospitalId, String hospitalName) {
            this.token = token;
            this.userId = userId;
            this.name = name;
            this.email = email;
            this.role = role;
            this.hospitalId = hospitalId;
            this.hospitalName = hospitalName;
        }
    }
}
