import { useState, useEffect } from 'react'
import { getAllOwners } from '../../services/ownerService'
import { getAllHotels } from '../../services/hotelService'
import { getAllBookings } from '../../services/bookingService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiUsers, FiMapPin, FiCalendar, FiDollarSign } from 'react-icons/fi'

const Dashboard = () => {
  const [owners, setOwners] = useState([])
  const [hotels, setHotels] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ownersData = getAllOwners()
    const hotelsData = getAllHotels()
    const bookingsData = getAllBookings()
    
    setOwners(ownersData)
    setHotels(hotelsData)
    setBookings(bookingsData)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <div className="flex items-center">
                  <FiUsers className="h-8 w-8 text-primary-600 mr-4" />
                  <div>
                    <p className="text-sm text-gray-600">Total Owners</p>
                    <p className="text-2xl font-bold text-gray-900">{owners.length}</p>
                  </div>
                </div>
              </Card>

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
                    <p className="text-sm text-gray-600">Total Bookings</p>
                    <p className="text-2xl font-bold text-gray-900">{bookings.length}</p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center">
                  <FiDollarSign className="h-8 w-8 text-primary-600 mr-4" />
                  <div>
                    <p className="text-sm text-gray-600">System Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">
                      £{bookings.reduce((sum, b) => sum + (b.transactionFee || 0), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Owners</h2>
                {owners.length === 0 ? (
                  <p className="text-gray-600">No owners registered</p>
                ) : (
                  <div className="space-y-3">
                    {owners.slice(0, 5).map((owner) => (
                      <div key={owner.id} className="border-b border-gray-200 pb-3 last:border-0">
                        <p className="font-semibold text-gray-900">{owner.username}</p>
                        <p className="text-sm text-gray-600">{owner.email}</p>
                        <p className="text-sm text-gray-500">Balance: £{owner.balance?.toFixed(2) || '0.00'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Bookings</h2>
                {bookings.length === 0 ? (
                  <p className="text-gray-600">No bookings yet</p>
                ) : (
                  <div className="space-y-3">
                    {bookings.slice(0, 5).map((booking) => (
                      <div key={booking.id} className="border-b border-gray-200 pb-3 last:border-0">
                        <p className="font-semibold text-gray-900">Booking #{booking.id.slice(-6)}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(booking.checkIn).toLocaleDateString()} - {new Date(booking.checkOut).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-500">Fee: £{booking.transactionFee?.toFixed(2) || '0.00'}</p>
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

