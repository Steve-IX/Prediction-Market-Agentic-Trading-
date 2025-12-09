package com.fdmgroup.hotel_booking_system.repository;

import com.fdmgroup.hotel_booking_system.model.GlobalCharges;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GlobalChargesRepository extends JpaRepository<GlobalCharges, Long> {
    // Since we only want one record, we can use findFirst
    GlobalCharges findFirstByOrderByIdAsc();
}

