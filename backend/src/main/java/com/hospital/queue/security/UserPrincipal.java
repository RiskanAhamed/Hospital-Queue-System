package com.hospital.queue.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserPrincipal {
    private String userId;
    private String email;
    private String role;
    private String hospitalId;
}
