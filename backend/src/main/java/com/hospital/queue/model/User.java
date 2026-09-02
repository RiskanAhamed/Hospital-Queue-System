package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "users")
public class User {
    @Id
    private String id;
    private String hospitalId; // Mandatory for multi-tenant isolation
    private String name;

    @Indexed(unique = true)
    private String email;

    @JsonIgnore
    private String password;
    private String phone;
    private String pushToken; // Expo Push Token (e.g. ExponentPushToken[...])
    private Role role;
    private boolean active = true;
    private LocalDateTime createdAt = LocalDateTime.now();

    public User(String id, String hospitalId, String name, String email, String password, String phone, Role role, boolean active, LocalDateTime createdAt) {
        this.id = id;
        this.hospitalId = hospitalId;
        this.name = name;
        this.email = email;
        this.password = password;
        this.phone = phone;
        this.role = role;
        this.active = active;
        this.createdAt = createdAt;
    }
}
