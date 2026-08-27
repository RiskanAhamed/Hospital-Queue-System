package com.hospital.queue.service;

import com.hospital.queue.model.AuditLog;
import com.hospital.queue.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public void log(String hospitalId, String userId, String action, String details) {
        AuditLog auditLog = new AuditLog();
        auditLog.setHospitalId(hospitalId);
        auditLog.setUserId(userId);
        auditLog.setAction(action);
        auditLog.setDetails(details);
        auditLog.setTimestamp(LocalDateTime.now());
        try {
            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            // FIX #15: Use SLF4J logger instead of System.err.println
            log.error("Failed to write audit log to database: {}", e.getMessage(), e);
        }
    }
}
