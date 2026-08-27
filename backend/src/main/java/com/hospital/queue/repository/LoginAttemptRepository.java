package com.hospital.queue.repository;

import com.hospital.queue.model.LoginAttempt;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.LocalDateTime;

public interface LoginAttemptRepository extends MongoRepository<LoginAttempt, String> {
    long countByEmailAndAttemptTimeAfter(String email, LocalDateTime cutoff);
    void deleteByEmail(String email);
}
