package com.fdmgroup.hotel_booking_system.repository;

import com.fdmgroup.hotel_booking_system.model.Transaction;
import com.fdmgroup.hotel_booking_system.model.TransactionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    List<Transaction> findByHotelOwnerId(Long hotelOwnerId);
    List<Transaction> findByHotelOwnerIdAndTransactionDateBetween(
            Long hotelOwnerId, LocalDateTime startDate, LocalDateTime endDate);
    List<Transaction> findByHotelOwnerIdAndTransactionType(
            Long hotelOwnerId, TransactionType transactionType);
}

