import { initializeMockData } from './mockData'
import { getHotelsByOwner } from './hotelService'

initializeMockData()

export const getAllOwners = () => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  return users
    .filter(u => u.role === 'owner')
    .map(({ password: _, ...owner }) => owner)
}

export const getOwnerById = (ownerId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const owner = users.find(u => u.id === ownerId && u.role === 'owner')
  if (owner) {
    const { password: _, ...ownerWithoutPassword } = owner
    return ownerWithoutPassword
  }
  return null
}

export const createOwner = (ownerData) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  
  // Check if username or email already exists
  if (users.some(u => u.username === ownerData.username || u.email === ownerData.email)) {
    throw new Error('Username or email already exists')
  }
  
  const newOwner = {
    id: `owner_${Date.now()}`,
    ...ownerData,
    role: 'owner',
    balance: 5000.00,
    createdAt: new Date(),
  }
  
  users.push(newOwner)
  localStorage.setItem('users', JSON.stringify(users))
  
  const { password: _, ...ownerWithoutPassword } = newOwner
  return ownerWithoutPassword
}

export const updateOwner = (ownerId, updates) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const index = users.findIndex(u => u.id === ownerId && u.role === 'owner')
  
  if (index === -1) return null
  
  users[index] = { ...users[index], ...updates }
  localStorage.setItem('users', JSON.stringify(users))
  
  const { password: _, ...ownerWithoutPassword } = users[index]
  return ownerWithoutPassword
}

export const deleteOwner = (ownerId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const filtered = users.filter(u => u.id !== ownerId)
  localStorage.setItem('users', JSON.stringify(filtered))
  return true
}

export const getOwnerOverview = (ownerId) => {
  const owner = getOwnerById(ownerId)
  if (!owner) return null
  
  const hotels = getHotelsByOwner(ownerId)
  return {
    owner,
    hotels,
  }
}

