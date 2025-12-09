package com.fdmgroup.hotel_booking_system.exception;

public class HotelOwnerNotFoundException extends RuntimeException {
    
    public HotelOwnerNotFoundException(String message) {
        super(message);
    }
    
    public HotelOwnerNotFoundException(Long id) {
        super("Hotel owner not found with ID: " + id);
    }
}

