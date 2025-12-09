package com.fdmgroup.hotel_booking_system.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class GlobalChargesDTO {
    
    @NotNull(message = "Base monthly fee is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Base monthly fee must be greater than 0")
    private BigDecimal baseMonthlyFee;
    
    @NotNull(message = "Per room fee is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Per room fee must be greater than 0")
    private BigDecimal perRoomFee;
    
    @NotNull(message = "Transaction fee percentage is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Transaction fee percentage must be greater than 0")
    private BigDecimal transactionFeePercentage;
    
    public GlobalChargesDTO() {
    }
    
    public GlobalChargesDTO(BigDecimal baseMonthlyFee, BigDecimal perRoomFee, BigDecimal transactionFeePercentage) {
        this.baseMonthlyFee = baseMonthlyFee;
        this.perRoomFee = perRoomFee;
        this.transactionFeePercentage = transactionFeePercentage;
    }
    
    // Getters and Setters
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

