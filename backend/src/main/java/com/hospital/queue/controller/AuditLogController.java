package com.hospital.queue.controller;

import com.hospital.queue.model.AuditLog;
import com.hospital.queue.model.Role;
import com.hospital.queue.repository.AuditLogRepository;
import com.hospital.queue.security.TenantSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/hospitals/{hospitalId}/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;
    private final TenantSecurityService tenantSecurityService;

    @GetMapping
    public ResponseEntity<Page<AuditLog>> getAuditLogs(
            @PathVariable String hospitalId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        tenantSecurityService.validateTenantAccess(hospitalId, Role.HOSPITAL_ADMIN);
        // FIX #8: Paginated query — prevents loading unbounded audit log data.
        // Cap page size at 200 to prevent abuse.
        int cappedSize = Math.min(size, 200);
        Pageable pageable = PageRequest.of(page, cappedSize);
        Page<AuditLog> logs = auditLogRepository.findByHospitalIdOrderByTimestampDesc(hospitalId, pageable);
        return ResponseEntity.ok(logs);
    }
}
