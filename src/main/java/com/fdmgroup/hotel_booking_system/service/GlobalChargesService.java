package com.fdmgroup.hotel_booking_system.service;

import com.fdmgroup.hotel_booking_system.model.GlobalCharges;
import com.fdmgroup.hotel_booking_system.repository.GlobalChargesRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@Transactional
public class GlobalChargesService {
    
    private final GlobalChargesRepository globalChargesRepository;
    
    @Autowired
    public GlobalChargesService(GlobalChargesRepository globalChargesRepository) {
        this.globalChargesRepository = globalChargesRepository;
    }
    
    public GlobalCharges getGlobalCharges() {
        GlobalCharges charges = globalChargesRepository.findFirstByOrderByIdAsc();
        if (charges == null) {
            // Initialize with default values if not exists
            charges = initializeDefaultCharges();
        }
        return charges;
    }
    
    public GlobalCharges updateGlobalCharges(BigDecimal baseMonthlyFee, BigDecimal perRoomFee, 
                                             BigDecimal transactionFeePercentage) {
        GlobalCharges charges = getGlobalCharges();
        charges.setBaseMonthlyFee(baseMonthlyFee);
        charges.setPerRoomFee(perRoomFee);
        charges.setTransactionFeePercentage(transactionFeePercentage);
        return globalChargesRepository.save(charges);
    }
    
    public GlobalCharges initializeDefaultCharges() {
        GlobalCharges charges = new GlobalCharges();
        return globalChargesRepository.save(charges);
    }
    
    public BigDecimal getBaseMonthlyFee() {
        return getGlobalCharges().getBaseMonthlyFee();
    }
    
    public BigDecimal getPerRoomFee() {
        return getGlobalCharges().getPerRoomFee();
    }
    
    public BigDecimal getTransactionFeePercentage() {
        return getGlobalCharges().getTransactionFeePercentage();
    }
}

