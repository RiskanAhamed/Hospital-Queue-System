package com.hospital.queue.repository;

import com.hospital.queue.model.Department;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface DepartmentRepository extends MongoRepository<Department, String> {
    List<Department> findByHospitalId(String hospitalId);
}
