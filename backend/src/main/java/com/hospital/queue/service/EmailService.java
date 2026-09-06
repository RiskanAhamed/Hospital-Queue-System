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

    @Async
    public void sendConsultationRatingEmail(String toEmail, String patientName, String doctorName, String hospitalName, String appointmentId) {
        if (!isEmailConfigured() || toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Skipping rating email: email not configured or recipient empty for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(mailFrom, hospitalName != null ? hospitalName : "MediFlow Hospital");
            helper.setTo(toEmail.trim());
            helper.setSubject("How was your visit with Dr. " + (doctorName != null ? doctorName : "Doctor") + "? - Rate your Consultation");

            String pName = patientName != null ? patientName : "Valued Patient";
            String dName = doctorName != null ? doctorName : "your doctor";
            String hName = hospitalName != null ? hospitalName : "MediFlow Hospital";

            String html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#0284c7;margin:0;'>" + hName + "</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Consultation Feedback & Star Rating</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'>"
                    + "<p style='color:#334155;font-size:15px;margin:0 0 12px 0;'>Dear <strong>" + pName + "</strong>,</p>"
                    + "<p style='color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px 0;'>Thank you for visiting today. Your consultation with <strong>Dr. " + dName + "</strong> has been marked as complete.</p>"
                    + "<p style='color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px 0;'>We would love to hear your feedback! Please open the <strong>MediFlow Mobile App</strong> or Portal to submit your 1 to 5 star rating and review.</p>"
                    + "<div style='text-align:center;margin:24px 0;'>"
                    + "<div style='display:inline-block;font-size:24px;color:#f59e0b;letter-spacing:6px;'>⭐⭐⭐⭐⭐</div>"
                    + "</div>"
                    + "<p style='color:#64748b;font-size:12px;margin:16px 0 0 0;text-align:center;'>Your feedback helps us continuously improve healthcare delivery.</p>"
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Consultation rating email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send consultation rating email to {}: {}", toEmail, e.getMessage());
        }
    }

    @Async
    public void sendAppointmentConfirmationEmail(String toEmail, String patientName, String doctorName, String specialty, String appointmentDate, String timeSlot, String queueToken, String roomNumber, String hospitalName) {
        if (!isEmailConfigured() || toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Skipping appointment confirmation email: email not configured or recipient empty for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            String hName = hospitalName != null ? hospitalName : "MediFlow Hospital";
            helper.setFrom(mailFrom, hName);
            helper.setTo(toEmail.trim());
            helper.setSubject("Appointment Confirmed: Dr. " + (doctorName != null ? doctorName : "Doctor") + " (" + (queueToken != null ? "Token " + queueToken : timeSlot) + ")");

            String tokenBadge = queueToken != null && !queueToken.trim().isEmpty() && !queueToken.equals("--")
                    ? "<div style='display:inline-block;padding:10px 20px;background:#0284c7;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:2px;border-radius:8px;margin:12px 0;'>" + queueToken + "</div>"
                    : "";

            String html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#0284c7;margin:0;'>" + hName + "</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Appointment Confirmation & Live Queue Token</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'>"
                    + "<p style='color:#334155;font-size:15px;margin:0 0 12px 0;'>Dear <strong>" + (patientName != null ? patientName : "Patient") + "</strong>,</p>"
                    + "<p style='color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px 0;'>Your appointment has been successfully booked with <strong>Dr. " + (doctorName != null ? doctorName : "Doctor") + "</strong> (" + (specialty != null ? specialty : "Specialist") + ").</p>"
                    + "<div style='background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:16px;'>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>📅 <strong>Date:</strong> " + appointmentDate + "</p>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>⏰ <strong>Time:</strong> " + timeSlot + "</p>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>🏥 <strong>Room / Cabin:</strong> " + (roomNumber != null ? roomNumber : "TBD") + "</p>"
                    + "</div>"
                    + (tokenBadge.isEmpty() ? "" : "<div style='text-align:center;'><p style='color:#64748b;font-size:12px;margin:0;'>Your Queue Token:</p>" + tokenBadge + "</div>")
                    + "<p style='color:#64748b;font-size:12px;margin:16px 0 0 0;text-align:center;'>You can track live queue status anytime using the MediFlow mobile app.</p>"
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Appointment confirmation email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send appointment confirmation email to {}: {}", toEmail, e.getMessage());
        }
    }

    @Async
    public void sendAppointmentCancellationEmail(String toEmail, String patientName, String doctorName, String appointmentDate, String hospitalName) {
        if (!isEmailConfigured() || toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Skipping cancellation email: email not configured or recipient empty for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            String hName = hospitalName != null ? hospitalName : "MediFlow Hospital";
            helper.setFrom(mailFrom, hName);
            helper.setTo(toEmail.trim());
            helper.setSubject("Appointment Cancelled: Dr. " + (doctorName != null ? doctorName : "Doctor") + " (" + appointmentDate + ")");

            String html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#e11d48;margin:0;'>" + hName + "</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Appointment Cancellation Notice</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'>"
                    + "<p style='color:#334155;font-size:15px;margin:0 0 12px 0;'>Dear <strong>" + (patientName != null ? patientName : "Patient") + "</strong>,</p>"
                    + "<p style='color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px 0;'>Your appointment with <strong>Dr. " + (doctorName != null ? doctorName : "Doctor") + "</strong> scheduled for <strong>" + appointmentDate + "</strong> has been cancelled.</p>"
                    + "<p style='color:#64748b;font-size:13px;line-height:1.6;margin:0 0 16px 0;'>If you would like to book a new appointment, please visit the MediFlow app or hospital reception.</p>"
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Appointment cancellation email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send appointment cancellation email to {}: {}", toEmail, e.getMessage());
        }
    }

    @Async
    public void sendAppointmentRescheduledEmail(String toEmail, String patientName, String doctorName, String newDate, String newTimeSlot, String queueToken, String roomNumber, String hospitalName) {
        if (!isEmailConfigured() || toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Skipping reschedule email: email not configured or recipient empty for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            String hName = hospitalName != null ? hospitalName : "MediFlow Hospital";
            helper.setFrom(mailFrom, hName);
            helper.setTo(toEmail.trim());
            helper.setSubject("Appointment Rescheduled: Dr. " + (doctorName != null ? doctorName : "Doctor") + " (" + newDate + " at " + newTimeSlot + ")");

            String tokenBadge = queueToken != null && !queueToken.trim().isEmpty() && !queueToken.equals("--")
                    ? "<div style='display:inline-block;padding:10px 20px;background:#0284c7;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:2px;border-radius:8px;margin:12px 0;'>" + queueToken + "</div>"
                    : "";

            String html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#0284c7;margin:0;'>" + hName + "</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Appointment Rescheduled</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'>"
                    + "<p style='color:#334155;font-size:15px;margin:0 0 12px 0;'>Dear <strong>" + (patientName != null ? patientName : "Patient") + "</strong>,</p>"
                    + "<p style='color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px 0;'>Your appointment with <strong>Dr. " + (doctorName != null ? doctorName : "Doctor") + "</strong> has been rescheduled.</p>"
                    + "<div style='background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:16px;'>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>📅 <strong>New Date:</strong> " + newDate + "</p>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>⏰ <strong>New Time:</strong> " + newTimeSlot + "</p>"
                    + "<p style='margin:4px 0;color:#334155;font-size:14px;'>🏥 <strong>Room:</strong> " + (roomNumber != null ? roomNumber : "TBD") + "</p>"
                    + "</div>"
                    + (tokenBadge.isEmpty() ? "" : "<div style='text-align:center;'><p style='color:#64748b;font-size:12px;margin:0;'>Your Queue Token:</p>" + tokenBadge + "</div>")
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Appointment reschedule email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send appointment reschedule email to {}: {}", toEmail, e.getMessage());
        }
    }

    @Async
    public void sendQueueTurnEmail(String toEmail, String patientName, String doctorName, String roomNumber, String tokenNumber, String hospitalName) {
        if (!isEmailConfigured() || toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Skipping queue turn email: email not configured or recipient empty for {}", toEmail);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            String hName = hospitalName != null ? hospitalName : "MediFlow Hospital";
            helper.setFrom(mailFrom, hName);
            helper.setTo(toEmail.trim());
            helper.setSubject("🔔 It's Your Turn! Token " + tokenNumber + " - Dr. " + (doctorName != null ? doctorName : "Doctor"));

            String html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>"
                    + "<div style='text-align:center;margin-bottom:20px;'>"
                    + "<h2 style='color:#0284c7;margin:0;'>" + hName + "</h2>"
                    + "<p style='color:#64748b;font-size:13px;margin:4px 0 0 0;'>Live Queue Alert</p>"
                    + "</div>"
                    + "<div style='padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;'>"
                    + "<div style='display:inline-block;padding:12px 28px;background:#16a34a;color:#ffffff;font-size:26px;font-weight:bold;letter-spacing:2px;border-radius:8px;'>"
                    + tokenNumber
                    + "</div>"
                    + "<h3 style='color:#1e293b;margin:16px 0 8px 0;'>Your Turn has arrived!</h3>"
                    + "<p style='color:#475569;font-size:15px;line-height:1.6;margin:0;'>Please proceed to <strong>Room " + (roomNumber != null ? roomNumber : "Doctor Cabin") + "</strong> to consult with <strong>Dr. " + (doctorName != null ? doctorName : "your doctor") + "</strong>.</p>"
                    + "</div>"
                    + "</div>";

            helper.setText(html, true);
            mailSender.send(message);
            log.info("Queue turn email dispatched successfully to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send queue turn email to {}: {}", toEmail, e.getMessage());
        }
    }
}
