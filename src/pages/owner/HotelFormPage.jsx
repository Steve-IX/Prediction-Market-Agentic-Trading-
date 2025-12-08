import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getHotelById, createHotel, updateHotel } from '../../services/hotelService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const HotelFormPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = !!id
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    description: '',
    starRating: 3,
    facilities: '',
    amenities: '',
    imageUrl: '',
    rooms: [],
  })
  const [roomForm, setRoomForm] = useState({ occupancy: 2, price: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEdit && id) {
      const hotel = getHotelById(id)
      if (hotel && hotel.ownerId === user?.id) {
        setFormData({
          ...hotel,
          facilities: hotel.facilities.join(', '),
          amenities: hotel.amenities.join(', '),
        })
      } else {
        navigate('/owner/hotels')
      }
    }
  }, [id, isEdit, user, navigate])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleAddRoom = () => {
    if (!roomForm.price || roomForm.price <= 0) {
      setError('Please enter a valid room price')
      return
    }
    const newRoom = {
      id: `room_${Date.now()}`,
      occupancy: parseInt(roomForm.occupancy),
      price: parseFloat(roomForm.price),
    }
    setFormData({
      ...formData,
      rooms: [...formData.rooms, newRoom],
    })
    setRoomForm({ occupancy: 2, price: '' })
  }

  const handleRemoveRoom = (roomId) => {
    setFormData({
      ...formData,
      rooms: formData.rooms.filter(r => r.id !== roomId),
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const hotelData = {
        ...formData,
        ownerId: user.id,
        facilities: formData.facilities.split(',').map(f => f.trim()).filter(f => f),
        amenities: formData.amenities.split(',').map(a => a.trim()).filter(a => a),
        starRating: parseInt(formData.starRating),
      }

      if (isEdit) {
        updateHotel(id, hotelData)
      } else {
        createHotel(hotelData)
      }
      navigate('/owner/hotels')
    } catch (err) {
      setError(err.message || 'Failed to save hotel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute requiredRole="owner">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">
              {isEdit ? 'Edit Hotel' : 'Create New Hotel'}
            </h1>

            <Card>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Hotel Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                  <Input
                    label="City"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                  />
                </div>

                <Input
                  label="Address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Star Rating
                    </label>
                    <select
                      name="starRating"
                      value={formData.starRating}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      {[1, 2, 3, 4, 5].map(rating => (
                        <option key={rating} value={rating}>{rating} Stars</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Image URL"
                    name="imageUrl"
                    type="url"
                    value={formData.imageUrl}
                    onChange={handleChange}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Facilities (comma-separated)
                  </label>
                  <Input
                    name="facilities"
                    value={formData.facilities}
                    onChange={handleChange}
                    placeholder="WiFi, Parking, Gym, Pool"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amenities (comma-separated)
                  </label>
                  <Input
                    name="amenities"
                    value={formData.amenities}
                    onChange={handleChange}
                    placeholder="Air Conditioning, TV, Mini Bar"
                  />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Rooms</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Occupancy
                      </label>
                      <select
                        value={roomForm.occupancy}
                        onChange={(e) => setRoomForm({ ...roomForm, occupancy: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value={1}>Single (1 person)</option>
                        <option value={2}>Double (2 people)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price per Night (£)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={roomForm.price}
                        onChange={(e) => setRoomForm({ ...roomForm, price: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={handleAddRoom} className="w-full">
                        Add Room
                      </Button>
                    </div>
                  </div>

                  {formData.rooms.length > 0 && (
                    <div className="space-y-2">
                      {formData.rooms.map((room) => (
                        <div
                          key={room.id}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-md"
                        >
                          <span>
                            {room.occupancy === 1 ? 'Single' : 'Double'} - £{room.price}/night
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoom(room.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : isEdit ? 'Update Hotel' : 'Create Hotel'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/owner/hotels')}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default HotelFormPage

