package com.hospital.queue.repository;

import com.hospital.queue.model.Appointment;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface AppointmentRepository extends MongoRepository<Appointment, String> {
    List<Appointment> findByHospitalId(String hospitalId);
    List<Appointment> findByHospitalIdAndPatientId(String hospitalId, String patientId);
    List<Appointment> findByHospitalIdAndDoctorId(String hospitalId, String doctorId);
    List<Appointment> findByHospitalIdAndAppointmentDate(String hospitalId, String appointmentDate);
    List<Appointment> findByHospitalIdAndDoctorIdAndAppointmentDate(String hospitalId, String doctorId, String date);
    List<Appointment> findByAppointmentDate(String appointmentDate);
    boolean existsByDoctorIdAndAppointmentDateAndTimeSlotAndStatusNot(String doctorId, String appointmentDate, String timeSlot, String status);
    boolean existsByPatientIdAndDoctorIdAndAppointmentDateAndStatusNot(String patientId, String doctorId, String appointmentDate, String status);
    long countByDoctorIdAndAppointmentDateAndStatusNot(String doctorId, String appointmentDate, String status);
}
