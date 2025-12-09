-- Quick MySQL Test Commands
-- Run these commands one by one in MySQL

-- 1. Select the database
USE hotel_booking_db;

-- 2. Show all tables
SHOW TABLES;

-- 3. Check admin user
SELECT id, username, email, role FROM users;

-- 4. Check global charges
SELECT * FROM global_charges;

-- 5. Check hotel owners (if any exist)
SELECT 
    ho.id AS owner_id,
    u.username,
    u.email,
    ho.balance,
    ho.opening_balance_date
FROM hotel_owners ho
JOIN users u ON ho.user_id = u.id;

-- 6. Check transactions (if any exist)
SELECT 
    t.id,
    t.transaction_type,
    t.amount,
    t.description,
    t.transaction_date,
    u.username AS owner_username
FROM transactions t
JOIN hotel_owners ho ON t.hotel_owner_id = ho.id
JOIN users u ON ho.user_id = u.id
ORDER BY t.transaction_date DESC;

-- 7. Count records in each table
SELECT 'users' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'hotel_owners', COUNT(*) FROM hotel_owners
UNION ALL
SELECT 'hotels', COUNT(*) FROM hotels
UNION ALL
SELECT 'rooms', COUNT(*) FROM rooms
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'global_charges', COUNT(*) FROM global_charges;

