package com.fdmgroup.hotel_booking_system.service;

import com.fdmgroup.hotel_booking_system.model.*;
import com.fdmgroup.hotel_booking_system.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class TransactionService {
    
    private final TransactionRepository transactionRepository;
    private final GlobalChargesService globalChargesService;
    
    @Autowired
    public TransactionService(TransactionRepository transactionRepository, 
                             GlobalChargesService globalChargesService) {
        this.transactionRepository = transactionRepository;
        this.globalChargesService = globalChargesService;
    }
    
    public Transaction createTransaction(TransactionType type, BigDecimal amount, 
                                       String description, HotelOwner hotelOwner) {
        Transaction transaction = new Transaction(type, amount, description, hotelOwner);
        return transactionRepository.save(transaction);
    }
    
    public Transaction createOpeningBalanceTransaction(HotelOwner hotelOwner) {
        BigDecimal openingBalance = new BigDecimal("5000.00");
        String description = "Opening balance";
        return createTransaction(TransactionType.OPENING_BALANCE, openingBalance, description, hotelOwner);
    }
    
    public Transaction createMonthlyChargeTransaction(HotelOwner hotelOwner, BigDecimal amount, 
                                                     String description) {
        return createTransaction(TransactionType.MONTHLY_CHARGE, amount, description, hotelOwner);
    }
    
    public Transaction createTransactionFeeTransaction(HotelOwner hotelOwner, BigDecimal bookingAmount) {
        BigDecimal feePercentage = globalChargesService.getTransactionFeePercentage();
        BigDecimal feeAmount = bookingAmount.multiply(feePercentage).divide(new BigDecimal("100"));
        String description = "Transaction fee (5%) for booking";
        return createTransaction(TransactionType.TRANSACTION_FEE, feeAmount, description, hotelOwner);
    }
    
    public List<Transaction> getTransactionsByOwnerId(Long ownerId) {
        return transactionRepository.findByHotelOwnerId(ownerId);
    }
    
    public List<Transaction> getTransactionsByOwnerIdAndDateRange(Long ownerId, 
                                                                  LocalDateTime startDate, 
                                                                  LocalDateTime endDate) {
        return transactionRepository.findByHotelOwnerIdAndTransactionDateBetween(ownerId, startDate, endDate);
    }
    
    public List<Transaction> getTransactionsByOwnerIdAndType(Long ownerId, TransactionType type) {
        return transactionRepository.findByHotelOwnerIdAndTransactionType(ownerId, type);
    }
    
    public BigDecimal calculateMonthlyCharge(double baseFee, double perRoomFee, List<Room> rooms) {
        return BigDecimal.valueOf(baseFee + (rooms.size() * perRoomFee));
    }
    
    public BigDecimal calculateMonthlyChargeForOwner(HotelOwner owner) {
        GlobalCharges charges = globalChargesService.getGlobalCharges();
        double baseFee = charges.getBaseMonthlyFee().doubleValue();
        double perRoomFee = charges.getPerRoomFee().doubleValue();
        
        // Get all rooms from all hotels owned by this owner
        List<Room> allRooms = owner.getHotels().stream()
            .flatMap(hotel -> hotel.getRooms().stream())
            .collect(Collectors.toList());
        
        return calculateMonthlyCharge(baseFee, perRoomFee, allRooms);
    }
}

