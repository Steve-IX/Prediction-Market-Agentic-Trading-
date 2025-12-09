package com.fdmgroup.hotel_booking_system.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "hotels")
public class Hotel {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    @NotBlank(message = "Hotel name is required")
    private String name;
    
    @Column(nullable = false)
    @NotBlank(message = "Address is required")
    private String address;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(name = "star_rating", nullable = false)
    @NotNull
    @Min(value = 1, message = "Star rating must be at least 1")
    @Max(value = 5, message = "Star rating must be at most 5")
    private Integer starRating;
    
    @Column(columnDefinition = "TEXT")
    private String facilities;
    
    @Column(columnDefinition = "TEXT")
    private String amenities;
    
    @Column(name = "picture_url")
    private String pictureUrl;
    
    @Column(name = "special_offer_percentage", precision = 5, scale = 2)
    private BigDecimal specialOfferPercentage;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    @NotNull
    private HotelOwner owner;
    
    @OneToMany(mappedBy = "hotel", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Room> rooms = new ArrayList<>();
    
    @OneToMany(mappedBy = "hotel", cascade = CascadeType.ALL)
    private List<Booking> bookings = new ArrayList<>();
    
    public Hotel() {
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
        if (specialOfferPercentage != null && specialOfferPercentage.compareTo(new BigDecimal("10.00")) > 0) {
            throw new IllegalArgumentException("Special offer percentage cannot exceed 10%");
        }
        this.specialOfferPercentage = specialOfferPercentage;
    }
    
    public HotelOwner getOwner() {
        return owner;
    }
    
    public void setOwner(HotelOwner owner) {
        this.owner = owner;
    }
    
    public List<Room> getRooms() {
        return rooms;
    }
    
    public void setRooms(List<Room> rooms) {
        this.rooms = rooms;
    }
    
    public void addRoom(Room room) {
        rooms.add(room);
        room.setHotel(this);
    }
    
    public void removeRoom(Room room) {
        rooms.remove(room);
        room.setHotel(null);
    }
    
    public List<Booking> getBookings() {
        return bookings;
    }
    
    public void setBookings(List<Booking> bookings) {
        this.bookings = bookings;
    }
}

