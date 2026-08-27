package com.hospital.queue.repository;

import com.hospital.queue.model.Doctor;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface DoctorRepository extends MongoRepository<Doctor, String> {
    List<Doctor> findByHospitalId(String hospitalId);
    List<Doctor> findByHospitalIdAndDepartmentId(String hospitalId, String departmentId);
    Optional<Doctor> findByUserId(String userId);
}
