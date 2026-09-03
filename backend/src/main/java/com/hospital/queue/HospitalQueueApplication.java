package com.hospital.queue;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class HospitalQueueApplication {
    public static void main(String[] args) {
        System.out.println("Connecting to MongoDB host: " + (System.getenv("MONGODB_URI") != null ? "ENV VAR IS SET (length=" + System.getenv("MONGODB_URI").length() + ")" : "ENV VAR IS NULL/MISSING"));
        SpringApplication.run(HospitalQueueApplication.class, args);
    }
}
