package com.fdmgroup.hotel_booking_system.config;

import com.fdmgroup.hotel_booking_system.model.GlobalCharges;
import com.fdmgroup.hotel_booking_system.model.User;
import com.fdmgroup.hotel_booking_system.model.UserRole;
import com.fdmgroup.hotel_booking_system.repository.GlobalChargesRepository;
import com.fdmgroup.hotel_booking_system.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
    
    private final UserRepository userRepository;
    private final GlobalChargesRepository globalChargesRepository;
    private final PasswordEncoder passwordEncoder;
    
    @Autowired
    public DataInitializer(UserRepository userRepository,
                          GlobalChargesRepository globalChargesRepository,
                          PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.globalChargesRepository = globalChargesRepository;
        this.passwordEncoder = passwordEncoder;
    }
    
    @Override
    public void run(String... args) throws Exception {
        initializeAdminUser();
        initializeGlobalCharges();
    }
    
    private void initializeAdminUser() {
        if (!userRepository.existsByUsername("admin")) {
            User admin = new User();
            admin.setUsername("admin");
            admin.setEmail("admin@fdmgroup.com");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setRole(UserRole.ADMIN);
            userRepository.save(admin);
            System.out.println("Default admin user created: username=admin, password=admin123");
        }
    }
    
    private void initializeGlobalCharges() {
        GlobalCharges existingCharges = globalChargesRepository.findFirstByOrderByIdAsc();
        if (existingCharges == null) {
            GlobalCharges defaultCharges = new GlobalCharges();
            globalChargesRepository.save(defaultCharges);
            System.out.println("Global charges initialized with default values:");
            System.out.println("  Base Monthly Fee: £" + defaultCharges.getBaseMonthlyFee());
            System.out.println("  Per Room Fee: £" + defaultCharges.getPerRoomFee());
            System.out.println("  Transaction Fee Percentage: " + defaultCharges.getTransactionFeePercentage() + "%");
        }
    }
}

