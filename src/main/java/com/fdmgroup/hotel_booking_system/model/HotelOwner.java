package com.fdmgroup.hotel_booking_system.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "hotel_owners")
public class HotelOwner {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    @NotNull
    private User user;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal balance;
    
    @Column(name = "opening_balance_date", nullable = false)
    private LocalDateTime openingBalanceDate;
    
    @OneToMany(mappedBy = "owner", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Hotel> hotels = new ArrayList<>();
    
    @OneToMany(mappedBy = "hotelOwner", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Transaction> transactions = new ArrayList<>();
    
    public HotelOwner() {
        this.balance = new BigDecimal("5000.00");
        this.openingBalanceDate = LocalDateTime.now();
    }
    
    public HotelOwner(User user) {
        this.user = user;
        this.balance = new BigDecimal("5000.00");
        this.openingBalanceDate = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public User getUser() {
        return user;
    }
    
    public void setUser(User user) {
        this.user = user;
    }
    
    public BigDecimal getBalance() {
        return balance;
    }
    
    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }
    
    public LocalDateTime getOpeningBalanceDate() {
        return openingBalanceDate;
    }
    
    public void setOpeningBalanceDate(LocalDateTime openingBalanceDate) {
        this.openingBalanceDate = openingBalanceDate;
    }
    
    public List<Hotel> getHotels() {
        return hotels;
    }
    
    public void setHotels(List<Hotel> hotels) {
        this.hotels = hotels;
    }
    
    public void addHotel(Hotel hotel) {
        hotels.add(hotel);
        hotel.setOwner(this);
    }
    
    public void removeHotel(Hotel hotel) {
        hotels.remove(hotel);
        hotel.setOwner(null);
    }
    
    public List<Transaction> getTransactions() {
        return transactions;
    }
    
    public void setTransactions(List<Transaction> transactions) {
        this.transactions = transactions;
    }
}

