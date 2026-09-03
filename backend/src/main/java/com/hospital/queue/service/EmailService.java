package com.hospital.queue.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

@Slf4j
@Service
public class EmailService {

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailFrom;

    public boolean isEmailConfigured() {
        return mailSender != null && mailFrom != null && !mailFrom.trim().isEmpty();
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String resetCode, String resetLink) {
        if (!isEmailConfigured()) {
            log.info("Email service not configured with MAIL_USERNAME. Skipping real email send for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(mailFrom, "MediFlow Hospital Portal");
            helper.setTo(toEmail);
            helper.setSubject("MediFlow - Password Reset Code: " + resetCode);

            String html = "<div style='font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#0284c7;margin:0;'>MediFlow</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Smart Hospital Queue & Appointment System</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;'>"
                    + "<p style='color:#334155;font-size:15px;margin:0 0 16px 0;'>You requested to reset your password. Use the verification code below:</p>"
                    + "<div style='display:inline-block;padding:12px 28px;background:#0284c7;color:#ffffff;font-size:24px;font-weight:bold;letter-spacing:4px;border-radius:8px;'>"
                    + resetCode
                    + "</div>"
                    + "<p style='color:#64748b;font-size:12px;margin:16px 0 0 0;'>This code expires in 15 minutes. If you did not request this, please ignore this email.</p>"
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Real password reset email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send real password reset email to {}: {}", toEmail, e.getMessage());
        }
    }
}
