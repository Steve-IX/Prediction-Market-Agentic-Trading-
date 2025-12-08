import { initializeMockData } from './mockData'

initializeMockData()

export const getCharges = () => {
  return JSON.parse(localStorage.getItem('charges') || '{}')
}

export const updateCharges = (updates) => {
  const charges = getCharges()
  const updated = { ...charges, ...updates }
  localStorage.setItem('charges', JSON.stringify(updated))
  return updated
}

export const calculateMonthlyCharge = (baseFee, perRoomFee, numberOfRooms) => {
  return baseFee + (numberOfRooms * perRoomFee)
}

export const getOwnerMonthlyCharge = (ownerId) => {
  const hotels = JSON.parse(localStorage.getItem('hotels') || '[]')
  const ownerHotels = hotels.filter(h => h.ownerId === ownerId)
  const totalRooms = ownerHotels.reduce((sum, hotel) => sum + (hotel.rooms?.length || 0), 0)
  
  const charges = getCharges()
  const baseFee = charges.baseMonthlyFee || 100
  const perRoomFee = charges.perRoomFee || 10
  
  return calculateMonthlyCharge(baseFee, perRoomFee, totalRooms)
}

export const generateAccountStatement = (ownerId, startDate, endDate) => {
  const owner = JSON.parse(localStorage.getItem('users') || '[]')
    .find(u => u.id === ownerId && u.role === 'owner')
  
  if (!owner) return null
  
  const hotels = JSON.parse(localStorage.getItem('hotels') || '[]')
    .filter(h => h.ownerId === ownerId)
  
  const bookings = JSON.parse(localStorage.getItem('bookings') || '[]')
    .filter(b => {
      const bookingDate = new Date(b.createdAt)
      return hotels.some(h => h.id === b.hotelId) &&
        bookingDate >= new Date(startDate) &&
        bookingDate <= new Date(endDate)
    })
  
  const charges = getCharges()
  const monthlyCharges = hotels.map(hotel => ({
    hotelId: hotel.id,
    hotelName: hotel.name,
    baseFee: charges.baseMonthlyFee || 100,
    perRoomFee: charges.perRoomFee || 10,
    numberOfRooms: hotel.rooms?.length || 0,
    monthlyCharge: calculateMonthlyCharge(
      charges.baseMonthlyFee || 100,
      charges.perRoomFee || 10,
      hotel.rooms?.length || 0
    ),
  }))
  
  const transactionFees = bookings.map(booking => ({
    bookingId: booking.id,
    hotelId: booking.hotelId,
    hotelName: hotels.find(h => h.id === booking.hotelId)?.name || 'Unknown',
    amount: booking.transactionFee || 0,
    date: new Date(booking.createdAt),
  }))
  
  return {
    ownerId,
    ownerName: owner.username,
    period: {
      start: new Date(startDate),
      end: new Date(endDate),
    },
    openingBalance: owner.balance || 5000.00,
    monthlyCharges,
    transactionFees,
    totalMonthlyCharges: monthlyCharges.reduce((sum, mc) => sum + mc.monthlyCharge, 0),
    totalTransactionFees: transactionFees.reduce((sum, tf) => sum + tf.amount, 0),
    closingBalance: (owner.balance || 5000.00) - 
      monthlyCharges.reduce((sum, mc) => sum + mc.monthlyCharge, 0) -
      transactionFees.reduce((sum, tf) => sum + tf.amount, 0),
  }
}

