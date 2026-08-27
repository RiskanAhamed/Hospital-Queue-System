package com.hospital.queue.repository;

import com.hospital.queue.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface AuditLogRepository extends MongoRepository<AuditLog, String> {
    List<AuditLog> findByHospitalIdOrderByTimestampDesc(String hospitalId);
    Page<AuditLog> findByHospitalIdOrderByTimestampDesc(String hospitalId, Pageable pageable);
}
