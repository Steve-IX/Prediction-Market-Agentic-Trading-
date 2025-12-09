package com.fdmgroup.hotel_booking_system.dto;

import com.fdmgroup.hotel_booking_system.model.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class TransactionDTO {
    
    private Long id;
    private TransactionType type;
    private BigDecimal amount;
    private String description;
    private LocalDateTime date;
    
    public TransactionDTO() {
    }
    
    public TransactionDTO(Long id, TransactionType type, BigDecimal amount, String description, LocalDateTime date) {
        this.id = id;
        this.type = type;
        this.amount = amount;
        this.description = description;
        this.date = date;
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public TransactionType getType() {
        return type;
    }
    
    public void setType(TransactionType type) {
        this.type = type;
    }
    
    public BigDecimal getAmount() {
        return amount;
    }
    
    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public LocalDateTime getDate() {
        return date;
    }
    
    public void setDate(LocalDateTime date) {
        this.date = date;
    }
}

