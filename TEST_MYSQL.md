# MySQL Database Testing Guide

## Quick Verification Steps

### 1. Connect to MySQL

**If MySQL is in your PATH:**
```bash
mysql -u root -p
```

**If MySQL is NOT in your PATH (Windows):**
```powershell
# Add MySQL to PATH for this session
$env:Path += ";C:\Program Files\MySQL\MySQL Server 9.5\bin"
mysql -u root -p

# OR use full path directly
& "C:\Program Files\MySQL\MySQL Server 9.5\bin\mysql.exe" -u root -p
```

**Note:** MySQL path may vary. Common locations:
- `C:\Program Files\MySQL\MySQL Server 9.5\bin\`
- `C:\Program Files\MySQL\MySQL Server 8.0\bin\`
- `C:\Program Files (x86)\MySQL\MySQL Server 8.0\bin\`

Enter your MySQL password when prompted.

### 2. Verify Database Exists

```sql
SHOW DATABASES;
USE hotel_booking_db;
SHOW TABLES;
```

You should see:
- `users`
- `hotel_owners`
- `hotels`
- `rooms`
- `bookings`
- `transactions`
- `global_charges`

### 3. Check Initial Data

```sql
-- Verify admin user
SELECT * FROM users WHERE username = 'admin';

-- Verify global charges
SELECT * FROM global_charges;
```

### 4. Test API and Verify in Database

#### Step 1: Create a Hotel Owner via API

**Option A: Using PowerShell (Recommended - No installation needed)**

```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/hotel-owners" `
  -Method POST `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
    "Content-Type" = "application/json"
  } `
  -Body '{"username":"testowner","email":"test@example.com","password":"password123"}'
```

**Expected Response:**
```json
{
  "id": 1,
  "username": "testowner",
  "email": "test@example.com",
  "balance": 5000.00,
  "registrationDate": "2025-12-09T12:30:29.869725"
}
```

**Option B: Using Postman or curl:**
```bash
curl -u admin:admin123 -X POST http://localhost:8080/api/admin/hotel-owners \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"testowner\",\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

#### Step 2: Verify in MySQL

```sql
-- Check the new user was created
SELECT id, username, email, role FROM users;

-- Expected Result:
-- +----+-----------+--------------------+-------------+
-- | id | username  | email              | role        |
-- +----+-----------+--------------------+-------------+
-- |  1 | admin     | admin@fdmgroup.com | ADMIN       |
-- |  2 | testowner | test@example.com   | HOTEL_OWNER |
-- +----+-----------+--------------------+-------------+

-- Check the hotel owner was created with opening balance
SELECT 
    ho.id AS owner_id,
    u.username,
    u.email,
    ho.balance,
    ho.opening_balance_date
FROM hotel_owners ho
JOIN users u ON ho.user_id = u.id;

-- Expected Result:
-- +----------+-----------+------------------+---------+----------------------------+
-- | owner_id | username  | email            | balance | opening_balance_date       |
-- +----------+-----------+------------------+---------+----------------------------+
-- |        1 | testowner | test@example.com | 5000.00 | 2025-12-09 12:30:29.869725 |
-- +----------+-----------+------------------+---------+----------------------------+

-- Check opening balance transaction was created
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

-- Expected Result:
-- +----+-------------------+---------+-----------------+----------------------------+----------------+
-- | id | transaction_type  | amount  | description     | transaction_date           | owner_username |
-- +----+-------------------+---------+-----------------+----------------------------+----------------+
-- |  1 | OPENING_BALANCE   | 5000.00 | Opening balance | 2025-12-09 12:30:29.884769 | testowner      |
-- +----+-------------------+---------+-----------------+----------------------------+----------------+
```

### 5. Test Additional API Endpoints

**Get All Hotel Owners:**
```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/hotel-owners" `
  -Method GET `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
  }
```

**Get Account Statement:**
```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/hotel-owners/1/account-statement" `
  -Method GET `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
  }
```

**Get Owner Overview:**
```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/hotel-owners/1/overview" `
  -Method GET `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
  }
```

**Get Global Charges:**
```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/global-charges" `
  -Method GET `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
  }
```

### 6. Run Comprehensive Test Queries

Execute the queries from `database_test_queries.sql` file to:
- Verify table structures
- Check data integrity
- View statistics
- Test relationships

## Expected Results

### After Application Startup:

1. **users table**: Should have 1 record (admin user)
2. **global_charges table**: Should have 1 record with default values:
   - base_monthly_fee: 100.00
   - per_room_fee: 10.00
   - transaction_fee_percentage: 5.00

### After Creating a Hotel Owner:

1. **users table**: Should have 2 records (admin + new owner)
2. **hotel_owners table**: Should have 1 record with balance = 5000.00
3. **transactions table**: Should have 1 record with type = 'OPENING_BALANCE' and amount = 5000.00

## Common Issues

### Issue: Cannot connect to MySQL
**Solution**: 
- Verify MySQL server is running: `mysqladmin -u root -p status`
- Check connection string in `application.properties`
- Verify username and password

### Issue: Database not created
**Solution**: 
- Check MySQL user has CREATE DATABASE permission
- Manually create: `CREATE DATABASE hotel_booking_db;`

### Issue: Tables not created
**Solution**: 
- Check `spring.jpa.hibernate.ddl-auto=update` in `application.properties`
- Verify Hibernate logs show table creation SQL
- Check MySQL user has CREATE TABLE permission

## Testing Checklist

- [x] MySQL server is running
- [x] Database `hotel_booking_db` exists
- [x] All 7 tables are created
- [x] Admin user exists in `users` table
- [x] Global charges initialized in `global_charges` table
- [x] Can create hotel owner via API (PowerShell method tested)
- [x] Hotel owner appears in `hotel_owners` table with balance 5000.00
- [x] Opening balance transaction created in `transactions` table
- [x] Can retrieve hotel owner via API (GET all owners tested)
- [x] Can view account statement via API (tested successfully)
- [x] Can view owner overview via API (tested successfully)
- [x] Can retrieve global charges via API (tested successfully)

## Verified Test Results (December 9, 2025)

### Database Verification ✅
- **Users Table**: 2 records (admin + testowner)
- **Hotel Owners Table**: 1 record with balance = 5000.00
- **Transactions Table**: 1 record (OPENING_BALANCE transaction)
- **Global Charges Table**: 1 record with default values

### API Endpoints Tested ✅
1. ✅ POST `/api/admin/hotel-owners` - Create hotel owner
2. ✅ GET `/api/admin/hotel-owners` - Get all hotel owners
3. ✅ GET `/api/admin/hotel-owners/1/account-statement` - Get account statement
4. ✅ GET `/api/admin/hotel-owners/1/overview` - Get owner overview
5. ✅ GET `/api/admin/global-charges` - Get global charges

### Test Method Used
- **PowerShell with Invoke-RestMethod** (No Postman installation required)
- All endpoints tested successfully
- All database verifications passed

