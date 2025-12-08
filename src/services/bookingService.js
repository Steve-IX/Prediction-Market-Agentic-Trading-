import { initializeMockData } from './mockData'

initializeMockData()

export const getAllBookings = () => {
  const bookings = JSON.parse(localStorage.getItem('bookings') || '[]')
  return bookings.map(booking => ({
    ...booking,
    checkIn: new Date(booking.checkIn),
    checkOut: new Date(booking.checkOut),
    createdAt: new Date(booking.createdAt),
  }))
}

export const getBookingsByCustomer = (customerId) => {
  return getAllBookings().filter(b => b.customerId === customerId)
}

export const getBookingsByHotel = (hotelId) => {
  return getAllBookings().filter(b => b.hotelId === hotelId)
}

export const getBookingsByOwner = (ownerId) => {
  const hotels = JSON.parse(localStorage.getItem('hotels') || '[]')
  const ownerHotels = hotels.filter(h => h.ownerId === ownerId).map(h => h.id)
  return getAllBookings().filter(b => ownerHotels.includes(b.hotelId))
}

export const checkRoomAvailability = (roomId, checkIn, checkOut) => {
  const bookings = getAllBookings()
  const conflictingBookings = bookings.filter(
    booking =>
      booking.roomId === roomId &&
      booking.status === 'confirmed' &&
      !(
        new Date(booking.checkOut) <= new Date(checkIn) ||
        new Date(booking.checkIn) >= new Date(checkOut)
      )
  )
  return conflictingBookings.length === 0
}

export const createBooking = (bookingData) => {
  const bookings = getAllBookings()
  
  // Check availability
  if (!checkRoomAvailability(bookingData.roomId, bookingData.checkIn, bookingData.checkOut)) {
    throw new Error('Room is not available for the selected dates')
  }
  
  const charges = JSON.parse(localStorage.getItem('charges') || '{}')
  const transactionFeePercentage = charges.transactionFeePercentage || 5
  const transactionFee = (bookingData.totalAmount * transactionFeePercentage) / 100
  
  const newBooking = {
    id: `booking_${Date.now()}`,
    ...bookingData,
    transactionFee,
    status: 'confirmed',
    createdAt: new Date(),
    checkIn: new Date(bookingData.checkIn),
    checkOut: new Date(bookingData.checkOut),
  }
  
  bookings.push(newBooking)
  localStorage.setItem('bookings', JSON.stringify(bookings))
  
  // Deduct transaction fee from owner's balance
  const hotels = JSON.parse(localStorage.getItem('hotels') || '[]')
  const hotel = hotels.find(h => h.id === bookingData.hotelId)
  if (hotel) {
    const users = JSON.parse(localStorage.getItem('users') || '[]')
    const ownerIndex = users.findIndex(u => u.id === hotel.ownerId)
    if (ownerIndex !== -1 && users[ownerIndex].balance !== undefined) {
      users[ownerIndex].balance -= transactionFee
      localStorage.setItem('users', JSON.stringify(users))
    }
  }
  
  return newBooking
}

