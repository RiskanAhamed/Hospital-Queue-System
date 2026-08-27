package com.hospital.queue.security;

import com.hospital.queue.model.Hospital;
import com.hospital.queue.repository.HospitalRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class WebSocketSecurityInterceptor implements ChannelInterceptor {

    private final JwtTokenProvider jwtTokenProvider;
    private final HospitalRepository hospitalRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null) {
            if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                String authHeader = accessor.getFirstNativeHeader("Authorization");
                if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                    throw new IllegalArgumentException("Unauthorized STOMP connection: Missing or invalid Authorization header");
                }
                String token = authHeader.substring(7);
                if (!jwtTokenProvider.validateToken(token)) {
                    throw new IllegalArgumentException("Unauthorized STOMP connection: Invalid JWT token");
                }
                Claims claims = jwtTokenProvider.getClaimsFromToken(token);
                String userId = claims.getSubject();
                String email = claims.get("email", String.class);
                String role = claims.get("role", String.class);
                String hospitalId = claims.get("hospitalId", String.class);

                UserPrincipal principal = new UserPrincipal(userId, email, role, hospitalId);
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        principal, null, Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + (role != null ? role : "PATIENT")))
                );
                accessor.setUser(auth);
                if (accessor.getSessionAttributes() != null) {
                    accessor.getSessionAttributes().put("userPrincipal", principal);
                }
            } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                UserPrincipal principal = null;
                if (accessor.getUser() instanceof UsernamePasswordAuthenticationToken) {
                    UsernamePasswordAuthenticationToken auth = (UsernamePasswordAuthenticationToken) accessor.getUser();
                    if (auth.getPrincipal() instanceof UserPrincipal) {
                        principal = (UserPrincipal) auth.getPrincipal();
                    }
                }
                if (principal == null && accessor.getSessionAttributes() != null) {
                    principal = (UserPrincipal) accessor.getSessionAttributes().get("userPrincipal");
                }

                if (principal == null) {
                    throw new IllegalArgumentException("Unauthorized STOMP subscription: Unauthenticated user");
                }

                String destination = accessor.getDestination();
                if (destination != null && destination.startsWith("/topic/hospital/")) {
                    String[] parts = destination.split("/");
                    if (parts.length >= 4) {
                        String topicHospitalId = parts[3];
                        validateSTOMPTenantAccess(principal, topicHospitalId);
                    }
                    if (parts.length >= 7 && "user".equalsIgnoreCase(parts[4]) && "notifications".equalsIgnoreCase(parts[6])) {
                        String topicUserId = parts[5];
                        validateSTOMPUserAccess(principal, topicUserId);
                    }
                }
            }
        }
        return message;
    }

    private void validateSTOMPUserAccess(UserPrincipal principal, String topicUserId) {
        String role = principal.getRole();
        if (role != null && (
                "HOSPITAL_ADMIN".equalsIgnoreCase(role) ||
                "STAFF".equalsIgnoreCase(role) ||
                "SUPER_ADMIN".equalsIgnoreCase(role)
        )) {
            return;
        }

        if (principal.getUserId() == null || !principal.getUserId().equals(topicUserId)) {
            throw new IllegalArgumentException("Forbidden STOMP subscription: Cannot subscribe to another user's notification topic");
        }
    }

    private void validateSTOMPTenantAccess(UserPrincipal principal, String topicHospitalId) {
        if ("SUPER_ADMIN".equalsIgnoreCase(principal.getRole())) {
            return;
        }

        String userHospId = principal.getHospitalId();
        if (userHospId == null || userHospId.trim().isEmpty()) {
            throw new IllegalArgumentException("Forbidden STOMP subscription: User has no hospital tenant");
        }

        if (userHospId.equals(topicHospitalId)) {
            return;
        }

        // Code matching (e.g. HOSP001 vs Mongo ID)
        Optional<Hospital> userHospOpt = hospitalRepository.findById(userHospId);
        if (userHospOpt.isPresent() && userHospOpt.get().getCode() != null && userHospOpt.get().getCode().equalsIgnoreCase(topicHospitalId)) {
            return;
        }

        Optional<Hospital> targetHospOpt = hospitalRepository.findById(topicHospitalId);
        if (targetHospOpt.isPresent()) {
            Hospital targetHosp = targetHospOpt.get();
            if (userHospId.equals(targetHosp.getId()) || (targetHosp.getCode() != null && userHospId.equalsIgnoreCase(targetHosp.getCode()))) {
                return;
            }
        }

        throw new IllegalArgumentException("Forbidden STOMP subscription: Cannot subscribe to another hospital's queue topic");
    }
}
