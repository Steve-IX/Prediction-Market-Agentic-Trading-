import { initializeMockData } from './mockData'

initializeMockData()

export const getAllHotels = () => {
  const hotels = JSON.parse(localStorage.getItem('hotels') || '[]')
  return hotels.map(hotel => ({
    ...hotel,
    rooms: hotel.rooms || [],
  }))
}

export const getHotelsByOwner = (ownerId) => {
  return getAllHotels().filter(hotel => hotel.ownerId === ownerId)
}

export const getHotelById = (hotelId) => {
  const hotels = getAllHotels()
  return hotels.find(h => h.id === hotelId) || null
}

export const createHotel = (hotelData) => {
  const hotels = getAllHotels()
  const newHotel = {
    id: `hotel_${Date.now()}`,
    ...hotelData,
    rooms: hotelData.rooms || [],
    createdAt: new Date(),
  }
  hotels.push(newHotel)
  localStorage.setItem('hotels', JSON.stringify(hotels))
  return newHotel
}

export const updateHotel = (hotelId, updates) => {
  const hotels = getAllHotels()
  const index = hotels.findIndex(h => h.id === hotelId)
  
  if (index === -1) return null
  
  hotels[index] = { ...hotels[index], ...updates }
  localStorage.setItem('hotels', JSON.stringify(hotels))
  return hotels[index]
}

export const deleteHotel = (hotelId) => {
  const hotels = getAllHotels()
  const filtered = hotels.filter(h => h.id !== hotelId)
  localStorage.setItem('hotels', JSON.stringify(filtered))
  return true
}

export const searchHotels = (query) => {
  const hotels = getAllHotels()
  const lowerQuery = query.toLowerCase()
  return hotels.filter(
    hotel =>
      hotel.name.toLowerCase().includes(lowerQuery) ||
      hotel.city.toLowerCase().includes(lowerQuery)
  )
}

