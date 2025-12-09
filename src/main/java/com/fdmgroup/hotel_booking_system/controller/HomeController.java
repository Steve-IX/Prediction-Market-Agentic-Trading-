package com.fdmgroup.hotel_booking_system.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
public class HomeController {
    
    @GetMapping("/")
    public ResponseEntity<Map<String, Object>> home() {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Hotel Booking System V2 - REST API");
        response.put("version", "0.0.1-SNAPSHOT");
        response.put("status", "running");
        response.put("api", Map.of(
            "baseUrl", "/api",
            "adminEndpoints", "/api/admin/**",
            "documentation", "See README.md for API documentation"
        ));
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/api")
    public ResponseEntity<Map<String, Object>> apiInfo() {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Hotel Booking System V2 API");
        response.put("endpoints", Map.of(
            "admin", "/api/admin/**",
            "hotelOwner", "/api/hotel-owner/** (to be implemented)",
            "customer", "/api/customer/** (to be implemented)"
        ));
        response.put("authentication", "HTTP Basic Auth required for admin endpoints");
        response.put("defaultAdmin", Map.of(
            "username", "admin",
            "password", "admin123"
        ));
        return ResponseEntity.ok(response);
    }
}

