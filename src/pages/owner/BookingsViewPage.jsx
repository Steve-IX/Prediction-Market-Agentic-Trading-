import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getBookingsByOwner } from '../../services/bookingService'
import { getHotelById } from '../../services/hotelService'
import { format } from 'date-fns'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const BookingsViewPage = () => {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [selectedHotel, setSelectedHotel] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const ownerBookings = getBookingsByOwner(user.id)
      const enriched = ownerBookings.map(booking => {
        const hotel = getHotelById(booking.hotelId)
        return { ...booking, hotel }
      })
      setBookings(enriched.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn)))
      setLoading(false)
    }
  }, [user])

  const filteredBookings = selectedHotel === 'all'
    ? bookings
    : bookings.filter(b => b.hotelId === selectedHotel)

  const hotels = [...new Set(bookings.map(b => b.hotelId))]
    .map(id => getHotelById(id))
    .filter(Boolean)

  const currentBookings = filteredBookings.filter(b => {
    const checkIn = new Date(b.checkIn)
    const checkOut = new Date(b.checkOut)
    const now = new Date()
    return checkIn <= now && checkOut >= now
  })

  const upcomingBookings = filteredBookings.filter(b => new Date(b.checkIn) > new Date())

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
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Bookings</h1>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Hotel
              </label>
              <select
                value={selectedHotel}
                onChange={(e) => setSelectedHotel(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All Hotels</option>
                {hotels.map(hotel => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Occupancy</h2>
                {currentBookings.length === 0 ? (
                  <Card>
                    <p className="text-gray-600">No current bookings</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {currentBookings.map((booking) => (
                      <Card key={booking.id}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-900">{booking.hotel?.name}</h3>
                            <p className="text-sm text-gray-600">
                              {format(new Date(booking.checkIn), 'MMM dd, yyyy')} - {format(new Date(booking.checkOut), 'MMM dd, yyyy')}
                            </p>
                            <p className="text-sm text-gray-500">Booking ID: {booking.id.slice(-6)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">£{booking.totalAmount.toFixed(2)}</p>
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              Active
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Future Bookings</h2>
                {upcomingBookings.length === 0 ? (
                  <Card>
                    <p className="text-gray-600">No upcoming bookings</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {upcomingBookings.map((booking) => (
                      <Card key={booking.id}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-900">{booking.hotel?.name}</h3>
                            <p className="text-sm text-gray-600">
                              {format(new Date(booking.checkIn), 'MMM dd, yyyy')} - {format(new Date(booking.checkOut), 'MMM dd, yyyy')}
                            </p>
                            <p className="text-sm text-gray-500">Booking ID: {booking.id.slice(-6)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">£{booking.totalAmount.toFixed(2)}</p>
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Upcoming
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default BookingsViewPage

