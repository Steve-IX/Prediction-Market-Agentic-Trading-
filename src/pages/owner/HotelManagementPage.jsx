import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getHotelsByOwner, deleteHotel } from '../../services/hotelService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiPlus, FiEdit, FiTrash2, FiMapPin } from 'react-icons/fi'

const HotelManagementPage = () => {
  const { user } = useAuth()
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const ownerHotels = getHotelsByOwner(user.id)
      setHotels(ownerHotels)
      setLoading(false)
    }
  }, [user])

  const handleDelete = (hotelId) => {
    if (window.confirm('Are you sure you want to delete this hotel?')) {
      deleteHotel(hotelId)
      setHotels(hotels.filter(h => h.id !== hotelId))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="owner">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900">My Hotels</h1>
              <Link to="/owner/hotels/new">
                <Button>
                  <FiPlus className="inline h-4 w-4 mr-2" />
                  Add Hotel
                </Button>
              </Link>
            </div>

            {hotels.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">You haven't added any hotels yet.</p>
                  <Link to="/owner/hotels/new">
                    <Button>Create Your First Hotel</Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {hotels.map((hotel) => (
                  <Card key={hotel.id}>
                    <div className="h-48 bg-gray-200 rounded-lg overflow-hidden mb-4">
                      {hotel.imageUrl ? (
                        <img
                          src={hotel.imageUrl}
                          alt={hotel.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/400x300?text=Hotel+Image'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500">
                          No Image
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{hotel.name}</h3>
                    <div className="flex items-center text-gray-600 mb-2">
                      <FiMapPin className="h-4 w-4 mr-1" />
                      <span className="text-sm">{hotel.city}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{hotel.description}</p>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-600">
                        {hotel.rooms?.length || 0} {hotel.rooms?.length === 1 ? 'room' : 'rooms'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {hotel.starRating} ⭐
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <Link to={`/owner/hotels/${hotel.id}/edit`} className="flex-1">
                        <Button variant="outline" className="w-full">
                          <FiEdit className="inline h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(hotel.id)}
                        className="flex-1"
                      >
                        <FiTrash2 className="inline h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default HotelManagementPage

