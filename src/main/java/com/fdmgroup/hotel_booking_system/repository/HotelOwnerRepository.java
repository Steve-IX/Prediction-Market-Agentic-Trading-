package com.fdmgroup.hotel_booking_system.repository;

import com.fdmgroup.hotel_booking_system.model.HotelOwner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HotelOwnerRepository extends JpaRepository<HotelOwner, Long> {
    Optional<HotelOwner> findByUserId(Long userId);
}

