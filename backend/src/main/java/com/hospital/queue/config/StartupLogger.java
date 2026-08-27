package com.hospital.queue.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class StartupLogger {

    private final Environment env;

    @Value("${server.port:8080}")
    private String serverPort;

    public StartupLogger(Environment env) {
        this.env = env;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        String mongoUri = env.getProperty("spring.data.mongodb.uri", "UNKNOWN");
        String maskedMongoUri = maskMongoUri(mongoUri);
        String envPort = System.getenv("PORT");

        log.info("==========================================================");
        log.info(">>> MEDIFLOW BACKEND STARTED SUCCESSFULLY!");
        log.info(">>> ACTIVE SERVER PORT: {}", serverPort);
        log.info(">>> SYSTEM ENV PORT: {}", envPort);
        log.info(">>> ACTIVE MONGODB URI: {}", maskedMongoUri);
        log.info(">>> READY TO ACCEPT HTTP REQUESTS");
        log.info("==========================================================");
    }

    private String maskMongoUri(String uri) {
        if (uri == null || uri.isEmpty()) return "NOT_SET";
        return uri.replaceAll("://([^:]+):([^@]+)@", "://$1:****@");
    }
}
