package com.hospital.queue.repository;

import com.hospital.queue.model.Role;
import com.hospital.queue.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmail(String email);
    List<User> findByHospitalId(String hospitalId);
    List<User> findByHospitalIdAndRole(String hospitalId, Role role);
    Optional<User> findByEmailAndHospitalId(String email, String hospitalId);

    @Query("{ 'hospitalId': ?0, 'role': 'PATIENT', '$or': [ { 'name': { '$regex': ?1, '$options': 'i' } }, { 'email': { '$regex': ?1, '$options': 'i' } }, { 'phone': { '$regex': ?1, '$options': 'i' } } ] }")
    List<User> searchPatients(String hospitalId, String query);
}

