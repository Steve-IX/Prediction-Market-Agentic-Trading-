package com.fdmgroup.hotel_booking_system.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class HotelOwnerResponseDTO {
    
    private Long id;
    private String username;
    private String email;
    private BigDecimal balance;
    private LocalDateTime registrationDate;
    
    public HotelOwnerResponseDTO() {
    }
    
    public HotelOwnerResponseDTO(Long id, String username, String email, BigDecimal balance, LocalDateTime registrationDate) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.balance = balance;
        this.registrationDate = registrationDate;
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
    
    public BigDecimal getBalance() {
        return balance;
    }
    
    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }
    
    public LocalDateTime getRegistrationDate() {
        return registrationDate;
    }
    
    public void setRegistrationDate(LocalDateTime registrationDate) {
        this.registrationDate = registrationDate;
    }
}

