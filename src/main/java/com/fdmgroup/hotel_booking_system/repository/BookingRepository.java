package com.fdmgroup.hotel_booking_system.repository;

import com.fdmgroup.hotel_booking_system.model.Booking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {
    List<Booking> findByHotelId(Long hotelId);
    List<Booking> findByCustomerId(Long customerId);
    List<Booking> findByRoomIdAndCheckInDateLessThanEqualAndCheckOutDateGreaterThanEqual(
            Long roomId, LocalDate checkOutDate, LocalDate checkInDate);
}

