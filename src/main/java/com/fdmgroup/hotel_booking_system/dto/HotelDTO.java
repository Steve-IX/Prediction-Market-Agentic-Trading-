package com.fdmgroup.hotel_booking_system.dto;

import java.math.BigDecimal;

public class HotelDTO {
    
    private Long id;
    private String name;
    private String address;
    private String description;
    private Integer starRating;
    private String facilities;
    private String amenities;
    private String pictureUrl;
    private BigDecimal specialOfferPercentage;
    private Integer roomCount;
    
    public HotelDTO() {
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getAddress() {
        return address;
    }
    
    public void setAddress(String address) {
        this.address = address;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public Integer getStarRating() {
        return starRating;
    }
    
    public void setStarRating(Integer starRating) {
        this.starRating = starRating;
    }
    
    public String getFacilities() {
        return facilities;
    }
    
    public void setFacilities(String facilities) {
        this.facilities = facilities;
    }
    
    public String getAmenities() {
        return amenities;
    }
    
    public void setAmenities(String amenities) {
        this.amenities = amenities;
    }
    
    public String getPictureUrl() {
        return pictureUrl;
    }
    
    public void setPictureUrl(String pictureUrl) {
        this.pictureUrl = pictureUrl;
    }
    
    public BigDecimal getSpecialOfferPercentage() {
        return specialOfferPercentage;
    }
    
    public void setSpecialOfferPercentage(BigDecimal specialOfferPercentage) {
        this.specialOfferPercentage = specialOfferPercentage;
    }
    
    public Integer getRoomCount() {
        return roomCount;
    }
    
    public void setRoomCount(Integer roomCount) {
        this.roomCount = roomCount;
    }
}

