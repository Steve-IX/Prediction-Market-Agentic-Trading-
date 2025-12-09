package com.fdmgroup.hotel_booking_system.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

@Entity
@Table(name = "global_charges")
public class GlobalCharges {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "base_monthly_fee", nullable = false, precision = 10, scale = 2)
    @NotNull
    @DecimalMin(value = "0.0", inclusive = false, message = "Base monthly fee must be greater than 0")
    private BigDecimal baseMonthlyFee;
    
    @Column(name = "per_room_fee", nullable = false, precision = 10, scale = 2)
    @NotNull
    @DecimalMin(value = "0.0", inclusive = false, message = "Per room fee must be greater than 0")
    private BigDecimal perRoomFee;
    
    @Column(name = "transaction_fee_percentage", nullable = false, precision = 5, scale = 2)
    @NotNull
    @DecimalMin(value = "0.0", inclusive = false, message = "Transaction fee percentage must be greater than 0")
    private BigDecimal transactionFeePercentage;
    
    public GlobalCharges() {
        // Default values
        this.baseMonthlyFee = new BigDecimal("100.00");
        this.perRoomFee = new BigDecimal("10.00");
        this.transactionFeePercentage = new BigDecimal("5.00");
    }
    
    public GlobalCharges(BigDecimal baseMonthlyFee, BigDecimal perRoomFee, BigDecimal transactionFeePercentage) {
        this.baseMonthlyFee = baseMonthlyFee;
        this.perRoomFee = perRoomFee;
        this.transactionFeePercentage = transactionFeePercentage;
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public BigDecimal getBaseMonthlyFee() {
        return baseMonthlyFee;
    }
    
    public void setBaseMonthlyFee(BigDecimal baseMonthlyFee) {
        this.baseMonthlyFee = baseMonthlyFee;
    }
    
    public BigDecimal getPerRoomFee() {
        return perRoomFee;
    }
    
    public void setPerRoomFee(BigDecimal perRoomFee) {
        this.perRoomFee = perRoomFee;
    }
    
    public BigDecimal getTransactionFeePercentage() {
        return transactionFeePercentage;
    }
    
    public void setTransactionFeePercentage(BigDecimal transactionFeePercentage) {
        this.transactionFeePercentage = transactionFeePercentage;
    }
}

