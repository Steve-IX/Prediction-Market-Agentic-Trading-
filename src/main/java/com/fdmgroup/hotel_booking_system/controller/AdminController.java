package com.fdmgroup.hotel_booking_system.controller;

import com.fdmgroup.hotel_booking_system.dto.*;
import com.fdmgroup.hotel_booking_system.model.Hotel;
import com.fdmgroup.hotel_booking_system.model.HotelOwner;
import com.fdmgroup.hotel_booking_system.service.*;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
    
    private final HotelOwnerService hotelOwnerService;
    private final HotelService hotelService;
    private final AccountStatementService accountStatementService;
    private final GlobalChargesService globalChargesService;
    
    @Autowired
    public AdminController(HotelOwnerService hotelOwnerService,
                          HotelService hotelService,
                          AccountStatementService accountStatementService,
                          GlobalChargesService globalChargesService) {
        this.hotelOwnerService = hotelOwnerService;
        this.hotelService = hotelService;
        this.accountStatementService = accountStatementService;
        this.globalChargesService = globalChargesService;
    }
    
    @PostMapping("/hotel-owners")
    public ResponseEntity<HotelOwnerResponseDTO> addHotelOwner(
            @Valid @RequestBody HotelOwnerRequestDTO requestDTO) {
        HotelOwner hotelOwner = hotelOwnerService.createHotelOwner(requestDTO);
        HotelOwnerResponseDTO responseDTO = hotelOwnerService.convertToDTO(hotelOwner);
        return new ResponseEntity<>(responseDTO, HttpStatus.CREATED);
    }
    
    @GetMapping("/hotel-owners")
    public ResponseEntity<List<HotelOwnerResponseDTO>> getAllHotelOwners() {
        List<HotelOwner> hotelOwners = hotelOwnerService.getAllHotelOwners();
        List<HotelOwnerResponseDTO> responseDTOs = hotelOwnerService.convertToDTOList(hotelOwners);
        return ResponseEntity.ok(responseDTOs);
    }
    
    @GetMapping("/hotel-owners/{id}")
    public ResponseEntity<HotelOwnerResponseDTO> getHotelOwnerById(@PathVariable Long id) {
        HotelOwner hotelOwner = hotelOwnerService.getHotelOwnerById(id);
        HotelOwnerResponseDTO responseDTO = hotelOwnerService.convertToDTO(hotelOwner);
        return ResponseEntity.ok(responseDTO);
    }
    
    @PutMapping("/hotel-owners/{id}")
    public ResponseEntity<HotelOwnerResponseDTO> updateHotelOwner(
            @PathVariable Long id,
            @Valid @RequestBody HotelOwnerRequestDTO requestDTO) {
        HotelOwner hotelOwner = hotelOwnerService.updateHotelOwner(id, requestDTO);
        HotelOwnerResponseDTO responseDTO = hotelOwnerService.convertToDTO(hotelOwner);
        return ResponseEntity.ok(responseDTO);
    }
    
    @DeleteMapping("/hotel-owners/{id}")
    public ResponseEntity<Void> deleteHotelOwner(@PathVariable Long id) {
        hotelOwnerService.deleteHotelOwner(id);
        return ResponseEntity.noContent().build();
    }
    
    @GetMapping("/hotel-owners/{id}/overview")
    public ResponseEntity<OwnerOverviewDTO> getOwnerOverview(@PathVariable Long id) {
        HotelOwner owner = hotelOwnerService.getHotelOwnerById(id);
        List<Hotel> hotels = hotelService.getHotelsByOwnerId(id);
        
        List<HotelDTO> hotelDTOs = hotels.stream()
            .map(this::convertHotelToDTO)
            .collect(Collectors.toList());
        
        OwnerOverviewDTO overviewDTO = new OwnerOverviewDTO(
            owner.getId(),
            owner.getUser().getUsername(),
            owner.getUser().getEmail(),
            owner.getBalance(),
            owner.getOpeningBalanceDate(),
            hotelDTOs
        );
        
        return ResponseEntity.ok(overviewDTO);
    }
    
    @GetMapping("/hotel-owners/{id}/account-statement")
    public ResponseEntity<AccountStatementDTO> getAccountStatement(@PathVariable Long id) {
        AccountStatementDTO statement = accountStatementService.getAccountStatement(id);
        return ResponseEntity.ok(statement);
    }
    
    @GetMapping("/global-charges")
    public ResponseEntity<GlobalChargesDTO> getGlobalCharges() {
        var charges = globalChargesService.getGlobalCharges();
        GlobalChargesDTO dto = new GlobalChargesDTO(
            charges.getBaseMonthlyFee(),
            charges.getPerRoomFee(),
            charges.getTransactionFeePercentage()
        );
        return ResponseEntity.ok(dto);
    }
    
    @PutMapping("/global-charges")
    public ResponseEntity<GlobalChargesDTO> updateGlobalCharges(
            @Valid @RequestBody GlobalChargesDTO chargesDTO) {
        var updatedCharges = globalChargesService.updateGlobalCharges(
            chargesDTO.getBaseMonthlyFee(),
            chargesDTO.getPerRoomFee(),
            chargesDTO.getTransactionFeePercentage()
        );
        
        GlobalChargesDTO responseDTO = new GlobalChargesDTO(
            updatedCharges.getBaseMonthlyFee(),
            updatedCharges.getPerRoomFee(),
            updatedCharges.getTransactionFeePercentage()
        );
        
        return ResponseEntity.ok(responseDTO);
    }
    
    private HotelDTO convertHotelToDTO(Hotel hotel) {
        HotelDTO dto = new HotelDTO();
        dto.setId(hotel.getId());
        dto.setName(hotel.getName());
        dto.setAddress(hotel.getAddress());
        dto.setDescription(hotel.getDescription());
        dto.setStarRating(hotel.getStarRating());
        dto.setFacilities(hotel.getFacilities());
        dto.setAmenities(hotel.getAmenities());
        dto.setPictureUrl(hotel.getPictureUrl());
        dto.setSpecialOfferPercentage(hotel.getSpecialOfferPercentage());
        dto.setRoomCount(hotel.getRooms() != null ? hotel.getRooms().size() : 0);
        return dto;
    }
}

