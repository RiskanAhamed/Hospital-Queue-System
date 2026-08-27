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
    private Role role;
    private boolean active = true;
    private LocalDateTime createdAt = LocalDateTime.now();
}
