package com.fdmgroup.hotel_booking_system.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class OwnerOverviewDTO {
    
    private Long ownerId;
    private String username;
    private String email;
    private BigDecimal balance;
    private LocalDateTime registrationDate;
    private List<HotelDTO> hotels;
    
    public OwnerOverviewDTO() {
    }
    
    public OwnerOverviewDTO(Long ownerId, String username, String email, BigDecimal balance, 
                           LocalDateTime registrationDate, List<HotelDTO> hotels) {
        this.ownerId = ownerId;
        this.username = username;
        this.email = email;
        this.balance = balance;
        this.registrationDate = registrationDate;
        this.hotels = hotels;
    }
    
    // Getters and Setters
    public Long getOwnerId() {
        return ownerId;
    }
    
    public void setOwnerId(Long ownerId) {
        this.ownerId = ownerId;
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
    
    public List<HotelDTO> getHotels() {
        return hotels;
    }
    
    public void setHotels(List<HotelDTO> hotels) {
        this.hotels = hotels;
    }
}

