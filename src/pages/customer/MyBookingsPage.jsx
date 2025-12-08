import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getBookingsByCustomer } from '../../services/bookingService'
import { getHotelById } from '../../services/hotelService'
import { format } from 'date-fns'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const MyBookingsPage = () => {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const userBookings = getBookingsByCustomer(user.id)
      // Enrich with hotel data
      const enriched = userBookings.map(booking => {
        const hotel = getHotelById(booking.hotelId)
        return { ...booking, hotel }
      })
      setBookings(enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">My Bookings</h1>

            {bookings.length === 0 ? (
              <Card>
                <p className="text-gray-600 text-center py-8">You have no bookings yet.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {bookings.map((booking) => (
                  <Card key={booking.id}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          {booking.hotel?.name || 'Unknown Hotel'}
                        </h3>
                        <p className="text-gray-600 mb-1">
                          {booking.hotel?.address}, {booking.hotel?.city}
                        </p>
                        <p className="text-gray-600 mb-1">
                          <span className="font-medium">Check-in:</span>{' '}
                          {format(new Date(booking.checkIn), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-gray-600 mb-1">
                          <span className="font-medium">Check-out:</span>{' '}
                          {format(new Date(booking.checkOut), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                          Booked on {format(new Date(booking.createdAt), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            booking.status === 'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {booking.status}
                        </span>
                        <p className="text-xl font-bold text-gray-900 mt-2">
                          £{booking.totalAmount.toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500">
                          Transaction fee: £{booking.transactionFee.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default MyBookingsPage

