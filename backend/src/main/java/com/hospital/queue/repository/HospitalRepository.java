package com.hospital.queue.repository;

import com.hospital.queue.model.Hospital;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.Optional;

public interface HospitalRepository extends MongoRepository<Hospital, String> {
    Optional<Hospital> findByCode(String code);
}
