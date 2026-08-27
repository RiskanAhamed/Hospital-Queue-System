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
@Document(collection = "login_attempts")
public class LoginAttempt {
    @Id
    private String id;

    @Indexed
    private String email;

    @Indexed(expireAfter = "900s") // TTL: auto-delete after 15 minutes
    private LocalDateTime attemptTime;
}
