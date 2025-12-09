-- Hotel Booking System V2 - MySQL Test Queries
-- Run these queries in MySQL to verify database structure and data

-- ==============================================
-- DATABASE VERIFICATION
-- ==============================================

-- Show current database
SELECT DATABASE();

-- Show all tables
SHOW TABLES;

-- ==============================================
-- TABLE STRUCTURE VERIFICATION
-- ==============================================

-- Describe all tables
DESC users;
DESC hotel_owners;
DESC hotels;
DESC rooms;
DESC bookings;
DESC transactions;
DESC global_charges;

-- ==============================================
-- DATA VERIFICATION QUERIES
-- ==============================================

-- View all users (including admin)
SELECT 
    id,
    username,
    email,
    role,
    CASE 
        WHEN role = 'ADMIN' THEN 'Administrator'
        WHEN role = 'HOTEL_OWNER' THEN 'Hotel Owner'
        WHEN role = 'CUSTOMER' THEN 'Customer'
    END AS role_description
FROM users
ORDER BY id;

-- View all hotel owners with their user details
SELECT 
    ho.id AS owner_id,
    u.username,
    u.email,
    ho.balance,
    ho.opening_balance_date,
    COUNT(h.id) AS hotel_count
FROM hotel_owners ho
JOIN users u ON ho.user_id = u.id
LEFT JOIN hotels h ON h.owner_id = ho.id
GROUP BY ho.id, u.username, u.email, ho.balance, ho.opening_balance_date
ORDER BY ho.id;

-- View global charges
SELECT 
    id,
    base_monthly_fee AS 'Base Monthly Fee (£)',
    per_room_fee AS 'Per Room Fee (£)',
    transaction_fee_percentage AS 'Transaction Fee (%)'
FROM global_charges;

-- View all transactions for a specific hotel owner
-- Replace 1 with the actual hotel_owner_id
SELECT 
    t.id,
    t.transaction_type,
    t.amount,
    t.description,
    t.transaction_date,
    ho.id AS owner_id,
    u.username AS owner_username
FROM transactions t
JOIN hotel_owners ho ON t.hotel_owner_id = ho.id
JOIN users u ON ho.user_id = u.id
WHERE ho.id = 1  -- Change this to test different owners
ORDER BY t.transaction_date DESC;

-- View hotels with owner information
SELECT 
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.address,
    h.star_rating,
    h.special_offer_percentage,
    u.username AS owner_username,
    COUNT(r.id) AS room_count
FROM hotels h
JOIN hotel_owners ho ON h.owner_id = ho.id
JOIN users u ON ho.user_id = u.id
LEFT JOIN rooms r ON r.hotel_id = h.id
GROUP BY h.id, h.name, h.address, h.star_rating, h.special_offer_percentage, u.username
ORDER BY h.id;

-- ==============================================
-- STATISTICS QUERIES
-- ==============================================

-- Count users by role
SELECT 
    role,
    COUNT(*) AS count
FROM users
GROUP BY role;

-- Total balance across all hotel owners
SELECT 
    COUNT(*) AS total_owners,
    SUM(balance) AS total_balance,
    AVG(balance) AS average_balance,
    MIN(balance) AS min_balance,
    MAX(balance) AS max_balance
FROM hotel_owners;

-- Transaction summary by type
SELECT 
    transaction_type,
    COUNT(*) AS transaction_count,
    SUM(amount) AS total_amount,
    AVG(amount) AS average_amount
FROM transactions
GROUP BY transaction_type;

-- Monthly charges summary
SELECT 
    ho.id AS owner_id,
    u.username,
    COUNT(CASE WHEN t.transaction_type = 'MONTHLY_CHARGE' THEN 1 END) AS monthly_charge_count,
    SUM(CASE WHEN t.transaction_type = 'MONTHLY_CHARGE' THEN t.amount ELSE 0 END) AS total_monthly_charges,
    SUM(CASE WHEN t.transaction_type = 'TRANSACTION_FEE' THEN t.amount ELSE 0 END) AS total_transaction_fees
FROM hotel_owners ho
JOIN users u ON ho.user_id = u.id
LEFT JOIN transactions t ON t.hotel_owner_id = ho.id
GROUP BY ho.id, u.username;

-- ==============================================
-- TEST DATA VERIFICATION
-- ==============================================

-- Verify admin user exists
SELECT 
    'Admin User Check' AS test,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS - Admin user exists'
        ELSE 'FAIL - Admin user not found'
    END AS result
FROM users
WHERE username = 'admin' AND role = 'ADMIN';

-- Verify global charges initialized
SELECT 
    'Global Charges Check' AS test,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS - Global charges initialized'
        ELSE 'FAIL - Global charges not found'
    END AS result,
    base_monthly_fee,
    per_room_fee,
    transaction_fee_percentage
FROM global_charges;

-- Verify opening balance for hotel owners
SELECT 
    ho.id AS owner_id,
    u.username,
    ho.balance,
    CASE 
        WHEN ho.balance = 5000.00 THEN 'PASS - Opening balance correct'
        ELSE 'WARNING - Opening balance not £5000.00'
    END AS balance_check
FROM hotel_owners ho
JOIN users u ON ho.user_id = u.id;

-- ==============================================
-- RELATIONSHIP VERIFICATION
-- ==============================================

-- Verify foreign key relationships
SELECT 
    'Foreign Key Check' AS test,
    (SELECT COUNT(*) FROM hotel_owners WHERE user_id NOT IN (SELECT id FROM users)) AS orphaned_hotel_owners,
    (SELECT COUNT(*) FROM hotels WHERE owner_id NOT IN (SELECT id FROM hotel_owners)) AS orphaned_hotels,
    (SELECT COUNT(*) FROM rooms WHERE hotel_id NOT IN (SELECT id FROM hotels)) AS orphaned_rooms,
    (SELECT COUNT(*) FROM transactions WHERE hotel_owner_id NOT IN (SELECT id FROM hotel_owners)) AS orphaned_transactions;

-- ==============================================
-- SAMPLE DATA INSERT (For Testing)
-- ==============================================

-- Note: These are examples. The application should handle data creation via API.

-- Example: View what a complete hotel owner record looks like
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.role,
    ho.id AS owner_id,
    ho.balance,
    ho.opening_balance_date
FROM users u
JOIN hotel_owners ho ON u.id = ho.user_id
LIMIT 1;

-- ==============================================
-- CLEANUP QUERIES (Use with caution!)
-- ==============================================

-- Delete all test data (maintains structure)
-- SET FOREIGN_KEY_CHECKS = 0;
-- TRUNCATE TABLE transactions;
-- TRUNCATE TABLE bookings;
-- TRUNCATE TABLE rooms;
-- TRUNCATE TABLE hotels;
-- TRUNCATE TABLE hotel_owners;
-- DELETE FROM users WHERE username != 'admin';
-- SET FOREIGN_KEY_CHECKS = 1;

-- Drop all tables (removes everything)
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP TABLE IF EXISTS transactions;
-- DROP TABLE IF EXISTS bookings;
-- DROP TABLE IF EXISTS rooms;
-- DROP TABLE IF EXISTS hotels;
-- DROP TABLE IF EXISTS hotel_owners;
-- DROP TABLE IF EXISTS global_charges;
-- DROP TABLE IF EXISTS users;
-- SET FOREIGN_KEY_CHECKS = 1;

