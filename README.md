# Hotel Booking System V2 - Administrator Module

A comprehensive Spring Boot REST API for managing hotel bookings, owners, and transactions. This project implements the **Administrator Module** as specified in the functional requirements, providing complete CRUD operations for hotel owners, account statements, and global charges management.

## Features

- **Hotel Owner Management**: Create, Read, Update, Delete hotel owners with automatic opening balance of £5,000.00
- **Owner Overview**: View all hotels owned by a specific hotel owner with detailed information
- **Account Statements**: View complete transaction history including monthly charges and transaction fees
- **Global Charges Management**: Configure and update system-wide charges (base monthly fee, per room fee, transaction fee percentage)
- **Security**: Role-based access control with HTTP Basic Authentication
- **Validation**: Jakarta Validation with custom error messages
- **Exception Handling**: Custom exceptions with global exception handler

## Technology Stack

- **Java 21**
- **Spring Boot 4.0.0**
- **Spring Security** for authentication and authorization
- **Spring Data JPA** with Hibernate
- **MySQL 8.0+** for database
- **Maven** for dependency management
- **Jakarta Validation** for input validation

## Prerequisites

- Java 21 or higher
- Maven 3.8+
- MySQL 8.0+ (server must be running)

## Database Setup

1. Install MySQL and start the MySQL server

2. The application will automatically create the `hotel_booking_db` database

3. Set environment variables for database credentials (recommended):

### Option 1: Using PowerShell Script (Quick Setup)

1. Copy the example script:
   ```powershell
   Copy-Item setup-env.example.ps1 setup-env.ps1
   ```

2. Edit `setup-env.ps1` and replace `YOUR_PASSWORD_HERE` with your actual MySQL password

3. Run the script:
   ```powershell
   .\setup-env.ps1
   mvn spring-boot:run
   ```

**Note:** `setup-env.ps1` is in `.gitignore` and should NOT be committed to Git!

### Option 2: Set Environment Variables Manually

**Windows PowerShell:**
```powershell
$env:DB_USERNAME="root"
$env:DB_PASSWORD="your_password_here"
mvn spring-boot:run
```

**Windows Command Prompt:**
```cmd
set DB_USERNAME=root
set DB_PASSWORD=your_password_here
mvn spring-boot:run
```

**Linux/Mac:**
```bash
export DB_USERNAME=root
export DB_PASSWORD=your_password_here
mvn spring-boot:run
```

### Option 3: Use Default Values (Fallback)

If environment variables are not set, the application will use default values from `application.properties`. However, using environment variables is recommended for security.

**Note:** The password in `application.properties` is a fallback and should not be used in production.

## Running the Application

1. Clone the repository
2. Navigate to the project directory
3. Set environment variables (see Database Setup above)
4. Run using Maven:

```bash
mvn spring-boot:run
```

Or build and run the JAR:

```bash
mvn clean package
java -jar target/Hotel_Booking_System-0.0.1-SNAPSHOT.jar
```

The application will start on `http://localhost:8080`

On startup, the application will:
- Create default admin user (username: `admin`, password: `admin123`)
- Initialize global charges with default values
- Create all database tables automatically

Check the console output for confirmation messages.

## API Endpoints

### Base URL

All API endpoints are prefixed with: `http://localhost:8080/api`

### Authentication

All admin endpoints require HTTP Basic Authentication with ADMIN role credentials.

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/hotel-owners` | Create a new hotel owner |
| GET | `/api/admin/hotel-owners` | Get all hotel owners |
| GET | `/api/admin/hotel-owners/{id}` | Get hotel owner by ID |
| PUT | `/api/admin/hotel-owners/{id}` | Update hotel owner |
| DELETE | `/api/admin/hotel-owners/{id}` | Delete hotel owner |
| GET | `/api/admin/hotel-owners/{id}/overview` | Get owner overview (all hotels) |
| GET | `/api/admin/hotel-owners/{id}/account-statement` | Get account statement |
| GET | `/api/admin/global-charges` | Get global charges |
| PUT | `/api/admin/global-charges` | Update global charges |

## Sample Requests

### Create a Hotel Owner

```json
POST /api/admin/hotel-owners
{
  "username": "hotelowner1",
  "email": "owner@example.com",
  "password": "password123"
}
```

### Get All Hotel Owners

```
GET /api/admin/hotel-owners
```

### Get Account Statement

```
GET /api/admin/hotel-owners/1/account-statement
```

### Update Global Charges

```json
PUT /api/admin/global-charges
{
  "baseMonthlyFee": 120.00,
  "perRoomFee": 12.00,
  "transactionFeePercentage": 6.00
}
```

## Testing

### Using PowerShell

```powershell
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin123"))
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/global-charges" `
  -Method GET `
  -Headers @{
    "Authorization" = "Basic $base64Auth"
  }
```

### Using cURL

```bash
curl -u admin:admin123 http://localhost:8080/api/admin/hotel-owners
```

See `TEST_MYSQL.md` for comprehensive testing guide with PowerShell examples.

## Database Schema

### Tables

- **users**: Stores user information (ADMIN, HOTEL_OWNER, CUSTOMER roles)
- **hotel_owners**: Stores hotel owner information with balance
- **hotels**: Stores hotel information
- **rooms**: Stores room information
- **bookings**: Stores booking information
- **transactions**: Stores transaction history (OPENING_BALANCE, MONTHLY_CHARGE, TRANSACTION_FEE)
- **global_charges**: Stores system-wide charge configuration

## Business Logic

### Opening Balance

When a hotel owner is created:
- Automatically receives £5,000.00 opening balance
- A transaction record is created with type `OPENING_BALANCE`
- Balance is stored in the `HotelOwner` entity

### Monthly Charge Calculation

The monthly charge for each hotel owner is calculated using the formula:

```java
calculateMonthlyCharge(double baseFee, double perRoomFee, List<Room> rooms) {
    return baseFee + (rooms.size() * perRoomFee);
}
```

**Example:**
- Base Monthly Fee: £100.00
- Per Room Fee: £10.00
- Hotel has 50 rooms
- Monthly Charge = £100.00 + (50 × £10.00) = £600.00

### Transaction Fees

When a booking is completed:
- Transaction fee = Booking Total × Transaction Fee Percentage
- Default transaction fee: 5% (configurable via global charges)
- Fee is deducted from hotel owner's balance
- Transaction record is created with type `TRANSACTION_FEE`

### Global Charges

The system maintains a single global charges record with:
- **Base Monthly Fee**: Default £100.00 (charged per hotel)
- **Per Room Fee**: Default £10.00 (charged per room per hotel)
- **Transaction Fee Percentage**: Default 5.00% (of booking total)

These values can be updated by administrators through the API.

## Project Structure

```
src/main/java/com/fdmgroup/hotel_booking_system/
├── HotelBookingSystemApplication.java
├── config/
│   ├── DataInitializer.java
│   └── SecurityConfig.java
├── controller/
│   ├── AdminController.java
│   └── HomeController.java
├── dto/
│   ├── AccountStatementDTO.java
│   ├── GlobalChargesDTO.java
│   ├── HotelDTO.java
│   ├── HotelOwnerRequestDTO.java
│   ├── HotelOwnerResponseDTO.java
│   ├── OwnerOverviewDTO.java
│   └── TransactionDTO.java
├── exception/
│   ├── ErrorResponse.java
│   ├── GlobalChargesNotFoundException.java
│   ├── GlobalExceptionHandler.java
│   ├── HotelOwnerNotFoundException.java
│   ├── UnauthorizedAccessException.java
│   └── UserNotFoundException.java
├── model/
│   ├── Booking.java
│   ├── BookingStatus.java
│   ├── GlobalCharges.java
│   ├── Hotel.java
│   ├── HotelOwner.java
│   ├── Room.java
│   ├── Transaction.java
│   ├── TransactionType.java
│   ├── User.java
│   └── UserRole.java
├── repository/
│   ├── BookingRepository.java
│   ├── GlobalChargesRepository.java
│   ├── HotelOwnerRepository.java
│   ├── HotelRepository.java
│   ├── RoomRepository.java
│   ├── TransactionRepository.java
│   └── UserRepository.java
└── service/
    ├── AccountStatementService.java
    ├── CustomUserDetailsService.java
    ├── GlobalChargesService.java
    ├── HotelOwnerService.java
    ├── HotelService.java
    ├── TransactionService.java
    └── UserService.java
```

## Current Implementation Status

**Administrator Module - COMPLETE**

- Hotel owner management (CRUD operations)
- Owner overview pages
- Account statements
- Global charges configuration
- Opening balance management
- Monthly charge calculation
- Transaction fee processing

**Hotel Owner Module - PENDING**

- Hotel creation and management
- Room management
- Special offers
- Review management

**Customer Module - PENDING**

- Hotel browsing and search
- Booking functionality
- Review system
- Account management

## Validation Rules

- **Username**: Required, 3-50 characters, unique
- **Email**: Required, valid email format
- **Password**: Required, minimum 6 characters
- **Base Monthly Fee**: Required, must be greater than 0
- **Per Room Fee**: Required, must be greater than 0
- **Transaction Fee Percentage**: Required, must be greater than 0

## Error Handling

The API returns structured error responses:

```json
{
  "timestamp": "2025-12-09T12:00:00",
  "status": 404,
  "error": "Not Found",
  "message": "Hotel owner not found with ID: 1",
  "path": "/api/admin/hotel-owners/1"
}
```

## Notes

- The application uses `spring.jpa.hibernate.ddl-auto=update`, which means tables are created/updated automatically on startup
- For production, change to `validate` or `none` and use proper database migrations
- Default admin credentials should be changed in production
- Transaction fees are calculated when bookings are completed (to be implemented in Customer module)
- Monthly charges need to be processed via scheduled job (to be implemented)

## Author

FDM Group - Hotel Booking System Development Team

## License

Educational Project - FDM Group

---

**Last Updated**: December 9, 2025  
**Version**: 0.0.1-SNAPSHOT  
**Status**: Administrator Module Complete
