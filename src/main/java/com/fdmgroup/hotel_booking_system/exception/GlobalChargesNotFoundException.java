package com.fdmgroup.hotel_booking_system.exception;

public class GlobalChargesNotFoundException extends RuntimeException {
    
    public GlobalChargesNotFoundException(String message) {
        super(message);
    }
    
    public GlobalChargesNotFoundException() {
        super("Global charges not found. Please initialize global charges first.");
    }
}

