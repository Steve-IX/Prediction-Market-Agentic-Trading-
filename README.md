# Hotel Booking System V2 - Frontend Prototype

A comprehensive hotel management and booking system prototype built with React, Vite, and Tailwind CSS.

## Features

### Customer Features
- Browse hotels with search functionality (by name or city)
- View detailed hotel information including facilities, amenities, star ratings, and reviews
- Book rooms with date selection and room type
- Multiple bookings support with basket functionality
- Account management (update profile, manage saved cards)
- View booking history
- Add reviews (only after previous bookings)

### Hotel Owner Features
- Dashboard with overview of hotels and bookings
- Create, edit, and delete hotels
- Manage rooms (add/edit/delete with occupancy and pricing)
- View current occupancy and future bookings
- Add special offers (up to 10% discount)
- View account statements with monthly charges and transaction fees
- Manage and reply to customer reviews

### Administrator Features
- Dashboard with system statistics
- Manage hotel owners (add/edit/remove)
- View owner overview pages
- View owner account statements
- Configure global charges (base monthly fee, per-room fee, transaction fee percentage)

## Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Router v6** - Routing
- **Tailwind CSS** - Styling
- **React Hook Form** - Form handling
- **date-fns** - Date manipulation
- **React Icons** - Icon library
- **localStorage** - Data persistence (mock backend)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Navigate to the project directory:
```bash
cd hotel-booking-system
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Deploy to Vercel

The project is configured for easy deployment to Vercel:

1. **Using Vercel CLI:**
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Using Vercel Dashboard:**
   - Push your code to GitHub, GitLab, or Bitbucket
   - Import your repository in [Vercel Dashboard](https://vercel.com)
   - Vercel will automatically detect Vite and configure the build settings
   - Click "Deploy"

3. **Configuration:**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Framework Preset: Vite

The `vercel.json` file is already configured with the correct settings for SPA routing.

## Demo Accounts

The system comes pre-populated with demo accounts:

- **Admin**: 
  - Username: `admin`
  - Password: `admin123`

- **Hotel Owner**: 
  - Username: `john_owner`
  - Password: `owner123`

- **Customer**: 
  - Username: `customer1`
  - Password: `customer123`

## Project Structure

```
hotel-booking-system/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/         # Buttons, Inputs, Cards, Modals
│   │   ├── layout/         # Header, Footer, Sidebar, Navigation
│   │   └── features/       # Feature-specific components
│   ├── pages/              # Page components
│   │   ├── admin/          # Administrator pages
│   │   ├── owner/          # Hotel Owner pages
│   │   └── customer/       # Customer pages
│   ├── services/           # Mock data services
│   ├── context/            # React Context providers
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Utility functions
│   └── App.jsx             # Main app component
├── public/                 # Static assets
└── package.json
```

## Key Features Implementation

### Financial Calculations
- Monthly charges: `baseFee + (numberOfRooms × perRoomFee)`
- Transaction fees: 5% of booking amount (configurable)
- Opening balance: £5000.00 for new owners

### Booking System
- Date range validation
- Room availability checking
- Multiple hotel bookings support
- Transaction fee calculation
- Special offer discounts (max 10%)

### Data Persistence
- All data is stored in browser localStorage
- Data persists across page refreshes
- Mock data is initialized on first load

## Notes

- This is a **frontend prototype** with mock data services
- No real backend or database is used
- All authentication is simulated
- Data is stored in browser localStorage
- Image uploads are simulated (URLs only)

## License

This project is created for demonstration purposes.

