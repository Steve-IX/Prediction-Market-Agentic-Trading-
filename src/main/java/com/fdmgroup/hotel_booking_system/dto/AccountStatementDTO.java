package com.fdmgroup.hotel_booking_system.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class AccountStatementDTO {
    
    private Long ownerId;
    private String username;
    private String email;
    private BigDecimal currentBalance;
    private LocalDateTime statementDate;
    private List<TransactionDTO> transactions;
    private BigDecimal totalMonthlyCharges;
    private BigDecimal totalTransactionFees;
    
    public AccountStatementDTO() {
        this.statementDate = LocalDateTime.now();
    }
    
    public AccountStatementDTO(Long ownerId, String username, String email, BigDecimal currentBalance, 
                              LocalDateTime statementDate, List<TransactionDTO> transactions) {
        this.ownerId = ownerId;
        this.username = username;
        this.email = email;
        this.currentBalance = currentBalance;
        this.statementDate = statementDate;
        this.transactions = transactions;
        calculateTotals();
    }
    
    private void calculateTotals() {
        this.totalMonthlyCharges = transactions.stream()
            .filter(t -> t.getType() == com.fdmgroup.hotel_booking_system.model.TransactionType.MONTHLY_CHARGE)
            .map(TransactionDTO::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        this.totalTransactionFees = transactions.stream()
            .filter(t -> t.getType() == com.fdmgroup.hotel_booking_system.model.TransactionType.TRANSACTION_FEE)
            .map(TransactionDTO::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
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
    
    public BigDecimal getCurrentBalance() {
        return currentBalance;
    }
    
    public void setCurrentBalance(BigDecimal currentBalance) {
        this.currentBalance = currentBalance;
    }
    
    public LocalDateTime getStatementDate() {
        return statementDate;
    }
    
    public void setStatementDate(LocalDateTime statementDate) {
        this.statementDate = statementDate;
    }
    
    public List<TransactionDTO> getTransactions() {
        return transactions;
    }
    
    public void setTransactions(List<TransactionDTO> transactions) {
        this.transactions = transactions;
        calculateTotals();
    }
    
    public BigDecimal getTotalMonthlyCharges() {
        return totalMonthlyCharges;
    }
    
    public void setTotalMonthlyCharges(BigDecimal totalMonthlyCharges) {
        this.totalMonthlyCharges = totalMonthlyCharges;
    }
    
    public BigDecimal getTotalTransactionFees() {
        return totalTransactionFees;
    }
    
    public void setTotalTransactionFees(BigDecimal totalTransactionFees) {
        this.totalTransactionFees = totalTransactionFees;
    }
}

