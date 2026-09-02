package com.hospital.queue.security;

import com.hospital.queue.model.Hospital;
import com.hospital.queue.repository.HospitalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class WebSocketSecurityInterceptorTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private HospitalRepository hospitalRepository;

    @Mock
    private MessageChannel messageChannel;

    @InjectMocks
    private WebSocketSecurityInterceptor interceptor;

    private Hospital testHospital;

    @BeforeEach
    public void setUp() {
        testHospital = new Hospital();
        testHospital.setId("hosp123");
        testHospital.setCode("HOSP001");
    }

    private Message<?> createSubscribeMessage(UserPrincipal principal, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        if (principal != null) {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(principal, null, null);
            accessor.setUser(auth);
            accessor.setSessionAttributes(new java.util.HashMap<>());
            accessor.getSessionAttributes().put("userPrincipal", principal);
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    public void testPatientCanSubscribeToOwnNotificationTopic() {
        UserPrincipal principal = new UserPrincipal("patient1", "patient@example.com", "PATIENT", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/user/patient1/notifications");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testPatientCannotSubscribeToAnotherUserNotificationTopic() {
        UserPrincipal principal = new UserPrincipal("patient1", "patient@example.com", "PATIENT", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/user/patient2/notifications");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                interceptor.preSend(message, messageChannel)
        );
        assertTrue(ex.getMessage().contains("Forbidden STOMP subscription"));
        assertTrue(ex.getMessage().contains("Cannot subscribe to another user's notification topic"));
    }

    @Test
    public void testHospitalAdminCanSubscribeToAnyUserNotificationTopicInSameHospital() {
        UserPrincipal principal = new UserPrincipal("admin1", "admin@example.com", "HOSPITAL_ADMIN", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/user/patient2/notifications");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testStaffCanSubscribeToAnyUserNotificationTopicInSameHospital() {
        UserPrincipal principal = new UserPrincipal("staff1", "staff@example.com", "STAFF", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/user/patient2/notifications");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testSuperAdminCanSubscribeToAnyUserNotificationTopicAcrossHospitals() {
        UserPrincipal principal = new UserPrincipal("super1", "super@example.com", "SUPER_ADMIN", null);
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/user/patient2/notifications");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testPatientCannotSubscribeToDifferentHospitalTopic() {
        UserPrincipal principal = new UserPrincipal("patient1", "patient@example.com", "PATIENT", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp999/user/patient1/notifications");

        when(hospitalRepository.findById("hosp123")).thenReturn(Optional.of(testHospital));
        when(hospitalRepository.findById("hosp999")).thenReturn(Optional.empty());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                interceptor.preSend(message, messageChannel)
        );
        assertTrue(ex.getMessage().contains("Forbidden STOMP subscription"));
        assertTrue(ex.getMessage().contains("another hospital"));
    }

    @Test
    public void testDoctorCanSubscribeToGeneralQueueTopic() {
        UserPrincipal principal = new UserPrincipal("doc1", "doctor@example.com", "DOCTOR", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/queue");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testUserCanSubscribeToOwnHospitalDoctorsTopic() {
        UserPrincipal principal = new UserPrincipal("user1", "user@example.com", "PATIENT", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp123/doctors");

        assertDoesNotThrow(() -> interceptor.preSend(message, messageChannel));
    }

    @Test
    public void testUserCannotSubscribeToDifferentHospitalDoctorsTopic() {
        UserPrincipal principal = new UserPrincipal("user1", "user@example.com", "PATIENT", "hosp123");
        Message<?> message = createSubscribeMessage(principal, "/topic/hospital/hosp999/doctors");

        when(hospitalRepository.findById("hosp123")).thenReturn(Optional.of(testHospital));
        when(hospitalRepository.findById("hosp999")).thenReturn(Optional.empty());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                interceptor.preSend(message, messageChannel)
        );
        assertTrue(ex.getMessage().contains("Forbidden STOMP subscription"));
        assertTrue(ex.getMessage().contains("another hospital"));
    }
}
