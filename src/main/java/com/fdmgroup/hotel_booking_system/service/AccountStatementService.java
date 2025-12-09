package com.fdmgroup.hotel_booking_system.service;

import com.fdmgroup.hotel_booking_system.dto.AccountStatementDTO;
import com.fdmgroup.hotel_booking_system.dto.TransactionDTO;
import com.fdmgroup.hotel_booking_system.model.HotelOwner;
import com.fdmgroup.hotel_booking_system.model.Transaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class AccountStatementService {
    
    private final HotelOwnerService hotelOwnerService;
    private final TransactionService transactionService;
    
    @Autowired
    public AccountStatementService(HotelOwnerService hotelOwnerService, 
                                   TransactionService transactionService) {
        this.hotelOwnerService = hotelOwnerService;
        this.transactionService = transactionService;
    }
    
    public AccountStatementDTO getAccountStatement(Long ownerId) {
        HotelOwner owner = hotelOwnerService.getHotelOwnerById(ownerId);
        List<Transaction> transactions = transactionService.getTransactionsByOwnerId(ownerId);
        
        List<TransactionDTO> transactionDTOs = transactions.stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
        
        return new AccountStatementDTO(
            owner.getId(),
            owner.getUser().getUsername(),
            owner.getUser().getEmail(),
            owner.getBalance(),
            java.time.LocalDateTime.now(),
            transactionDTOs
        );
    }
    
    private TransactionDTO convertToDTO(Transaction transaction) {
        return new TransactionDTO(
            transaction.getId(),
            transaction.getTransactionType(),
            transaction.getAmount(),
            transaction.getDescription(),
            transaction.getTransactionDate()
        );
    }
}

