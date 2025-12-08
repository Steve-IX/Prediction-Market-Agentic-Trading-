import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { updateUser, getUserById } from '../../services/authService'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiTrash2 } from 'react-icons/fi'

const AccountPage = () => {
  const { user, login } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    address: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedCards, setSavedCards] = useState([])

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        password: '',
        confirmPassword: '',
        address: user.address || '',
      })
      setSavedCards(user.cards || [])
    }
  }, [user])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const updates = {
        email: formData.email,
        address: formData.address,
      }
      if (formData.password) {
        updates.password = formData.password
      }

      const updatedUser = updateUser(user.id, updates)
      if (updatedUser) {
        login(updatedUser)
        setSuccess('Profile updated successfully')
        setFormData({
          ...formData,
          password: '',
          confirmPassword: '',
        })
      }
    } catch (err) {
      setError(err.message || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCard = (cardId) => {
    const users = JSON.parse(localStorage.getItem('users') || '[]')
    const userIndex = users.findIndex(u => u.id === user.id)
    if (userIndex !== -1) {
      users[userIndex].cards = (users[userIndex].cards || []).filter(c => c.id !== cardId)
      localStorage.setItem('users', JSON.stringify(users))
      setSavedCards(users[userIndex].cards)
      setSuccess('Card removed successfully')
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Account Settings</h1>

            <div className="space-y-6">
              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile Information</h2>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={user?.username || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
                  </div>

                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />

                  <Input
                    label="Address"
                    name="address"
                    type="text"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter your address"
                  />

                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                    <Input
                      label="New Password"
                      name="password"
                      type="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Leave blank to keep current password"
                    />
                    <Input
                      label="Confirm New Password"
                      name="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm new password"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                      {success}
                    </div>
                  )}

                  <Button type="submit" disabled={loading}>
                    {loading ? 'Updating...' : 'Update Profile'}
                  </Button>
                </form>
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Saved Cards</h2>
                {savedCards.length === 0 ? (
                  <p className="text-gray-600">No saved cards</p>
                ) : (
                  <div className="space-y-3">
                    {savedCards.map((card) => (
                      <div
                        key={card.id}
                        className="flex justify-between items-center p-4 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">**** **** **** {card.last4}</p>
                          <p className="text-sm text-gray-600">{card.cardholderName}</p>
                          <p className="text-sm text-gray-600">Expires: {card.expiryDate}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <FiTrash2 className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Links</h2>
                <div className="space-y-2">
                  <Link to="/my-bookings" className="block text-primary-600 hover:text-primary-700">
                    View My Bookings →
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default AccountPage

