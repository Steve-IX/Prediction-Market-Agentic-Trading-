// Initial mock data for the application

export const initialUsers = [
  {
    id: 'admin1',
    username: 'admin',
    email: 'admin@hotelbooking.com',
    password: 'admin123', // In real app, this would be hashed
    role: 'admin',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'owner1',
    username: 'john_owner',
    email: 'john@example.com',
    password: 'owner123',
    role: 'owner',
    balance: 5000.00,
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'owner2',
    username: 'sarah_owner',
    email: 'sarah@example.com',
    password: 'owner123',
    role: 'owner',
    balance: 5000.00,
    createdAt: new Date('2024-02-01'),
  },
  {
    id: 'customer1',
    username: 'customer1',
    email: 'customer1@example.com',
    password: 'customer123',
    role: 'customer',
    address: '123 Main St, London',
    cards: [],
    createdAt: new Date('2024-01-20'),
  },
]

export const initialHotels = [
  {
    id: 'hotel1',
    ownerId: 'owner1',
    name: 'Grand Plaza Hotel',
    address: '123 Oxford Street',
    city: 'London',
    description: 'A luxurious hotel in the heart of London with world-class amenities and exceptional service.',
    starRating: 5,
    facilities: ['WiFi', 'Parking', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service'],
    amenities: ['Air Conditioning', 'TV', 'Mini Bar', 'Safe', 'Hair Dryer'],
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    specialOffer: {
      discount: 10,
      description: 'Special 10% discount for early bookings!',
    },
    rooms: [
      { id: 'room1', hotelId: 'hotel1', occupancy: 1, price: 120.00 },
      { id: 'room2', hotelId: 'hotel1', occupancy: 2, price: 180.00 },
      { id: 'room3', hotelId: 'hotel1', occupancy: 2, price: 200.00 },
      { id: 'room4', hotelId: 'hotel1', occupancy: 1, price: 110.00 },
    ],
    createdAt: new Date('2024-01-16'),
  },
  {
    id: 'hotel2',
    ownerId: 'owner1',
    name: 'Seaside Resort',
    address: '456 Beach Road',
    city: 'Brighton',
    description: 'Beautiful seaside resort with stunning ocean views and modern facilities.',
    starRating: 4,
    facilities: ['WiFi', 'Parking', 'Pool', 'Beach Access', 'Restaurant'],
    amenities: ['Air Conditioning', 'TV', 'Balcony', 'Safe'],
    imageUrl: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
    rooms: [
      { id: 'room5', hotelId: 'hotel2', occupancy: 2, price: 150.00 },
      { id: 'room6', hotelId: 'hotel2', occupancy: 2, price: 170.00 },
      { id: 'room7', hotelId: 'hotel2', occupancy: 1, price: 100.00 },
    ],
    createdAt: new Date('2024-01-20'),
  },
  {
    id: 'hotel3',
    ownerId: 'owner2',
    name: 'City Center Inn',
    address: '789 High Street',
    city: 'Manchester',
    description: 'Comfortable and affordable accommodation in the city center.',
    starRating: 3,
    facilities: ['WiFi', 'Parking', 'Breakfast'],
    amenities: ['TV', 'Hair Dryer'],
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
    rooms: [
      { id: 'room8', hotelId: 'hotel3', occupancy: 1, price: 60.00 },
      { id: 'room9', hotelId: 'hotel3', occupancy: 2, price: 90.00 },
    ],
    createdAt: new Date('2024-02-02'),
  },
]

export const initialBookings = [
  {
    id: 'booking1',
    customerId: 'customer1',
    hotelId: 'hotel1',
    roomId: 'room2',
    checkIn: new Date('2024-12-15'),
    checkOut: new Date('2024-12-18'),
    totalAmount: 540.00,
    transactionFee: 27.00,
    status: 'confirmed',
    createdAt: new Date('2024-11-01'),
  },
]

export const initialReviews = [
  {
    id: 'review1',
    customerId: 'customer1',
    hotelId: 'hotel1',
    bookingId: 'booking1',
    rating: 5,
    comment: 'Excellent hotel with great service and amenities!',
    ownerReply: null,
    createdAt: new Date('2024-12-20'),
  },
]

export const initialCharges = {
  baseMonthlyFee: 100.00,
  perRoomFee: 10.00,
  transactionFeePercentage: 5,
}

// Initialize localStorage with mock data if not present
export const initializeMockData = () => {
  if (!localStorage.getItem('users')) {
    localStorage.setItem('users', JSON.stringify(initialUsers))
  }
  if (!localStorage.getItem('hotels')) {
    localStorage.setItem('hotels', JSON.stringify(initialHotels))
  }
  if (!localStorage.getItem('bookings')) {
    localStorage.setItem('bookings', JSON.stringify(initialBookings))
  }
  if (!localStorage.getItem('reviews')) {
    localStorage.setItem('reviews', JSON.stringify(initialReviews))
  }
  if (!localStorage.getItem('charges')) {
    localStorage.setItem('charges', JSON.stringify(initialCharges))
  }
}

