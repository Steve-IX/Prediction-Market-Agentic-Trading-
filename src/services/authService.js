import { initializeMockData } from './mockData'

initializeMockData()

export const login = (username, password) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const user = users.find(
    (u) => (u.username === username || u.email === username) && u.password === password
  )
  
  if (user) {
    // Remove password from returned user object
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }
  return null
}

export const register = (userData) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  
  // Check if username or email already exists
  if (users.some(u => u.username === userData.username || u.email === userData.email)) {
    throw new Error('Username or email already exists')
  }
  
  const newUser = {
    id: `user_${Date.now()}`,
    ...userData,
    role: userData.role || 'customer',
    balance: userData.role === 'owner' ? 5000.00 : undefined,
    createdAt: new Date(),
  }
  
  users.push(newUser)
  localStorage.setItem('users', JSON.stringify(users))
  
  const { password: _, ...userWithoutPassword } = newUser
  return userWithoutPassword
}

export const getUserById = (userId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const user = users.find(u => u.id === userId)
  if (user) {
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }
  return null
}

export const updateUser = (userId, updates) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const index = users.findIndex(u => u.id === userId)
  
  if (index === -1) return null
  
  users[index] = { ...users[index], ...updates }
  localStorage.setItem('users', JSON.stringify(users))
  
  const { password: _, ...userWithoutPassword } = users[index]
  return userWithoutPassword
}

