package com.fdmgroup.hotel_booking_system.repository;

import com.fdmgroup.hotel_booking_system.model.Hotel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HotelRepository extends JpaRepository<Hotel, Long> {
    List<Hotel> findByOwnerId(Long ownerId);
    List<Hotel> findByNameContainingIgnoreCase(String name);
    List<Hotel> findByAddressContainingIgnoreCase(String city);
}

