package com.fdmgroup.hotel_booking_system.service;

import com.fdmgroup.hotel_booking_system.dto.HotelOwnerRequestDTO;
import com.fdmgroup.hotel_booking_system.dto.HotelOwnerResponseDTO;
import com.fdmgroup.hotel_booking_system.exception.HotelOwnerNotFoundException;
import com.fdmgroup.hotel_booking_system.model.*;
import com.fdmgroup.hotel_booking_system.repository.HotelOwnerRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class HotelOwnerService {
    
    private final HotelOwnerRepository hotelOwnerRepository;
    private final UserService userService;
    private final TransactionService transactionService;
    
    @Autowired
    public HotelOwnerService(HotelOwnerRepository hotelOwnerRepository, 
                            UserService userService,
                            TransactionService transactionService) {
        this.hotelOwnerRepository = hotelOwnerRepository;
        this.userService = userService;
        this.transactionService = transactionService;
    }
    
    public HotelOwner createHotelOwner(HotelOwnerRequestDTO requestDTO) {
        // Create user with HOTEL_OWNER role
        User user = userService.createUser(
            requestDTO.getUsername(),
            requestDTO.getEmail(),
            requestDTO.getPassword(),
            UserRole.HOTEL_OWNER
        );
        
        // Create hotel owner with opening balance of £5000.00
        HotelOwner hotelOwner = new HotelOwner(user);
        hotelOwner = hotelOwnerRepository.save(hotelOwner);
        
        // Create opening balance transaction
        transactionService.createOpeningBalanceTransaction(hotelOwner);
        
        return hotelOwner;
    }
    
    public HotelOwner getHotelOwnerById(Long id) {
        return hotelOwnerRepository.findById(id)
            .orElseThrow(() -> new HotelOwnerNotFoundException(id));
    }
    
    public List<HotelOwner> getAllHotelOwners() {
        return hotelOwnerRepository.findAll();
    }
    
    public HotelOwner updateHotelOwner(Long id, HotelOwnerRequestDTO requestDTO) {
        HotelOwner hotelOwner = getHotelOwnerById(id);
        User user = hotelOwner.getUser();
        
        if (requestDTO.getEmail() != null && !requestDTO.getEmail().isEmpty()) {
            user.setEmail(requestDTO.getEmail());
        }
        if (requestDTO.getPassword() != null && !requestDTO.getPassword().isEmpty()) {
            userService.updateUser(user.getId(), requestDTO.getEmail(), requestDTO.getPassword());
        }
        
        return hotelOwnerRepository.save(hotelOwner);
    }
    
    public void deleteHotelOwner(Long id) {
        HotelOwner hotelOwner = getHotelOwnerById(id);
        User user = hotelOwner.getUser();
        hotelOwnerRepository.delete(hotelOwner);
        userService.deleteUser(user.getId());
    }
    
    public HotelOwnerResponseDTO convertToDTO(HotelOwner hotelOwner) {
        User user = hotelOwner.getUser();
        return new HotelOwnerResponseDTO(
            hotelOwner.getId(),
            user.getUsername(),
            user.getEmail(),
            hotelOwner.getBalance(),
            hotelOwner.getOpeningBalanceDate()
        );
    }
    
    public List<HotelOwnerResponseDTO> convertToDTOList(List<HotelOwner> hotelOwners) {
        return hotelOwners.stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }
}

