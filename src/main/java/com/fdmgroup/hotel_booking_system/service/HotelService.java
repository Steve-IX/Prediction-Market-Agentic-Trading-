package com.fdmgroup.hotel_booking_system.service;

import com.fdmgroup.hotel_booking_system.model.Hotel;
import com.fdmgroup.hotel_booking_system.repository.HotelRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class HotelService {
    
    private final HotelRepository hotelRepository;
    
    @Autowired
    public HotelService(HotelRepository hotelRepository) {
        this.hotelRepository = hotelRepository;
    }
    
    public List<Hotel> getHotelsByOwnerId(Long ownerId) {
        return hotelRepository.findByOwnerId(ownerId);
    }
    
    public List<Hotel> getAllHotels() {
        return hotelRepository.findAll();
    }
    
    public Hotel getHotelById(Long id) {
        return hotelRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Hotel not found with ID: " + id));
    }
    
    public List<Hotel> searchHotelsByName(String name) {
        return hotelRepository.findByNameContainingIgnoreCase(name);
    }
    
    public List<Hotel> searchHotelsByCity(String city) {
        return hotelRepository.findByAddressContainingIgnoreCase(city);
    }
}

