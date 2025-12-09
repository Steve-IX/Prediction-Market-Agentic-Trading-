package com.fdmgroup.hotel_booking_system.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "transactions")
public class Transaction {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false)
    @NotNull
    private TransactionType transactionType;
    
    @Column(nullable = false, precision = 10, scale = 2)
    @NotNull
    private BigDecimal amount;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(name = "transaction_date", nullable = false)
    @NotNull
    private LocalDateTime transactionDate;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hotel_owner_id", nullable = false)
    @NotNull
    private HotelOwner hotelOwner;
    
    public Transaction() {
        this.transactionDate = LocalDateTime.now();
    }
    
    public Transaction(TransactionType transactionType, BigDecimal amount, String description, HotelOwner hotelOwner) {
        this.transactionType = transactionType;
        this.amount = amount;
        this.description = description;
        this.hotelOwner = hotelOwner;
        this.transactionDate = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public TransactionType getTransactionType() {
        return transactionType;
    }
    
    public void setTransactionType(TransactionType transactionType) {
        this.transactionType = transactionType;
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
    
    public LocalDateTime getTransactionDate() {
        return transactionDate;
    }
    
    public void setTransactionDate(LocalDateTime transactionDate) {
        this.transactionDate = transactionDate;
    }
    
    public HotelOwner getHotelOwner() {
        return hotelOwner;
    }
    
    public void setHotelOwner(HotelOwner hotelOwner) {
        this.hotelOwner = hotelOwner;
    }
}

