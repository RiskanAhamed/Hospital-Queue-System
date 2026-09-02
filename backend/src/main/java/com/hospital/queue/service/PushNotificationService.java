package com.hospital.queue.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class PushNotificationService {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Sends a native mobile push notification to an Expo push token.
     * Works when app is closed, locked, or backgrounded.
     */
    @Async
    public void sendExpoPushNotification(String expoPushToken, String title, String body, Map<String, Object> data) {
        if (expoPushToken == null || !expoPushToken.trim().startsWith("ExponentPushToken[")) {
            log.debug("Skipping push notification: invalid or missing Expo push token '{}'", expoPushToken);
            return;
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Accept", "application/json");
            headers.set("Accept-Encoding", "gzip, deflate");

            Map<String, Object> payload = new HashMap<>();
            payload.put("to", expoPushToken.trim());
            payload.put("sound", "default");
            payload.put("title", title);
            payload.put("body", body);
            payload.put("priority", "high");
            if (data != null && !data.isEmpty()) {
                payload.put("data", data);
            }

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
            restTemplate.postForObject(EXPO_PUSH_URL, request, String.class);
            log.info("Mobile push notification successfully dispatched to {}", expoPushToken);
        } catch (Exception e) {
            log.warn("Failed to dispatch Expo push notification to {}: {}", expoPushToken, e.getMessage());
        }
    }
}
