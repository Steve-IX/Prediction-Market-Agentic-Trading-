package com.fdmgroup.hotel_booking_system.exception;

public class UnauthorizedAccessException extends RuntimeException {
    
    public UnauthorizedAccessException(String message) {
        super(message);
    }
    
    public UnauthorizedAccessException() {
        super("Unauthorized access. You do not have permission to perform this action.");
    }
}

