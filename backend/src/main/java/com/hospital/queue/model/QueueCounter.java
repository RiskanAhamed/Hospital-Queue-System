package com.hospital.queue.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Atomic counter for generating unique, sequential queue numbers per doctor per date.
 * Uses MongoDB's findAndModify with $inc for race-condition-free sequence generation.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "queue_counters")
@CompoundIndex(name = "unique_counter", def = "{'hospitalId': 1, 'doctorId': 1, 'queueDate': 1}", unique = true)
public class QueueCounter {
    @Id
    private String id;
    private String hospitalId;
    private String doctorId;
    private String queueDate;
    private int sequenceNumber;
}
