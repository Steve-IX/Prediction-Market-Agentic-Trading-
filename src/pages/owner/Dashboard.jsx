import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getHotelsByOwner } from '../../services/hotelService'
import { getBookingsByOwner } from '../../services/bookingService'
import { getOwnerMonthlyCharge } from '../../services/chargeService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiMapPin, FiCalendar, FiDollarSign } from 'react-icons/fi'
import { Link } from 'react-router-dom'

const Dashboard = () => {
  const { user } = useAuth()
  const [hotels, setHotels] = useState([])
  const [bookings, setBookings] = useState([])
  const [monthlyCharge, setMonthlyCharge] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const ownerHotels = getHotelsByOwner(user.id)
      setHotels(ownerHotels)
      
      const ownerBookings = getBookingsByOwner(user.id)
      setBookings(ownerBookings)
      
      const charge = getOwnerMonthlyCharge(user.id)
      setMonthlyCharge(charge)
      
      setLoading(false)
    }
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const totalRooms = hotels.reduce((sum, hotel) => sum + (hotel.rooms?.length || 0), 0)
  const upcomingBookings = bookings.filter(b => new Date(b.checkIn) >= new Date())

  return (
    <ProtectedRoute requiredRole="owner">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <div className="flex items-center">
                  <FiMapPin className="h-8 w-8 text-primary-600 mr-4" />
                  <div>
                    <p className="text-sm text-gray-600">Total Hotels</p>
                    <p className="text-2xl font-bold text-gray-900">{hotels.length}</p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center">
                  <FiCalendar className="h-8 w-8 text-primary-600 mr-4" />
                  <div>
                    <p className="text-sm text-gray-600">Upcoming Bookings</p>
                    <p className="text-2xl font-bold text-gray-900">{upcomingBookings.length}</p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center">
                  <FiDollarSign className="h-8 w-8 text-primary-600 mr-4" />
                  <div>
                    <p className="text-sm text-gray-600">Monthly Charge</p>
                    <p className="text-2xl font-bold text-gray-900">£{monthlyCharge.toFixed(2)}</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">My Hotels</h2>
                  <Link to="/owner/hotels">
                    <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                      Manage →
                    </button>
                  </Link>
                </div>
                {hotels.length === 0 ? (
                  <p className="text-gray-600">No hotels yet. Create your first hotel!</p>
                ) : (
                  <div className="space-y-3">
                    {hotels.slice(0, 5).map((hotel) => (
                      <div key={hotel.id} className="border-b border-gray-200 pb-3 last:border-0">
                        <h3 className="font-semibold text-gray-900">{hotel.name}</h3>
                        <p className="text-sm text-gray-600">{hotel.city}</p>
                        <p className="text-sm text-gray-500">
                          {hotel.rooms?.length || 0} {hotel.rooms?.length === 1 ? 'room' : 'rooms'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Recent Bookings</h2>
                  <Link to="/owner/bookings">
                    <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                      View All →
                    </button>
                  </Link>
                </div>
                {upcomingBookings.length === 0 ? (
                  <p className="text-gray-600">No upcoming bookings</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingBookings.slice(0, 5).map((booking) => (
                      <div key={booking.id} className="border-b border-gray-200 pb-3 last:border-0">
                        <p className="font-semibold text-gray-900">Booking #{booking.id.slice(-6)}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(booking.checkIn).toLocaleDateString()} - {new Date(booking.checkOut).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-500">£{booking.totalAmount.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default Dashboard

