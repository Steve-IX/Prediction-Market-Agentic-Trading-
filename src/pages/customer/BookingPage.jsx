import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getHotelById } from '../../services/hotelService'
import { checkRoomAvailability } from '../../services/bookingService'
import { useAuth } from '../../context/AuthContext'
import { useBooking } from '../../context/BookingContext'
import { format, addDays, differenceInDays } from 'date-fns'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import { FiCalendar, FiUsers } from 'react-icons/fi'

const BookingPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { addToBasket } = useBooking()
  const [hotel, setHotel] = useState(null)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hotelData = getHotelById(id)
    if (!hotelData) {
      navigate('/')
      return
    }
    setHotel(hotelData)
    setLoading(false)
  }, [id, navigate])

  const handleAddToBasket = () => {
    if (!checkIn || !checkOut || !selectedRoom) {
      setError('Please select check-in date, check-out date, and a room')
      return
    }

    const checkInDate = new Date(checkIn)
    const checkOutDate = new Date(checkOut)

    if (checkOutDate <= checkInDate) {
      setError('Check-out date must be after check-in date')
      return
    }

    if (!isAuthenticated) {
      navigate('/login', { state: { returnTo: `/hotel/${id}/book` } })
      return
    }

    // Check availability
    if (!checkRoomAvailability(selectedRoom.id, checkInDate, checkOutDate)) {
      setError('This room is not available for the selected dates')
      return
    }

    const nights = differenceInDays(checkOutDate, checkInDate)
    const basePrice = selectedRoom.price * nights
    const discount = hotel.specialOffer ? (basePrice * hotel.specialOffer.discount) / 100 : 0
    const totalAmount = basePrice - discount

    addToBasket({
      hotelId: hotel.id,
      hotelName: hotel.name,
      roomId: selectedRoom.id,
      roomOccupancy: selectedRoom.occupancy,
      roomPrice: selectedRoom.price,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      nights,
      totalAmount,
      discount,
    })

    navigate('/booking/confirm')
  }

  const minDate = format(new Date(), 'yyyy-MM-dd')
  const maxCheckIn = format(addDays(new Date(), 365), 'yyyy-MM-dd')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!hotel) return null

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Book Your Stay</h1>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">{hotel.name}</h2>
                <p className="text-gray-600 mb-6">{hotel.address}, {hotel.city}</p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FiCalendar className="inline h-4 w-4 mr-1" />
                      Check-in Date
                    </label>
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => {
                        setCheckIn(e.target.value)
                        if (checkOut && new Date(e.target.value) >= new Date(checkOut)) {
                          setCheckOut('')
                        }
                      }}
                      min={minDate}
                      max={maxCheckIn}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FiCalendar className="inline h-4 w-4 mr-1" />
                      Check-out Date
                    </label>
                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      min={checkIn || minDate}
                      max={maxCheckIn}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      <FiUsers className="inline h-4 w-4 mr-1" />
                      Select Room
                    </label>
                    <div className="space-y-3">
                      {hotel.rooms.map((room) => (
                        <div
                          key={room.id}
                          onClick={() => setSelectedRoom(room)}
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                            selectedRoom?.id === room.id
                              ? 'border-primary-600 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-300'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-gray-900">
                                {room.occupancy === 1 ? 'Single' : 'Double'} Occupancy
                              </p>
                              <p className="text-sm text-gray-600">
                                Accommodates {room.occupancy} {room.occupancy === 1 ? 'person' : 'people'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary-600">£{room.price}</p>
                              <p className="text-xs text-gray-500">per night</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  <Button onClick={handleAddToBasket} className="w-full">
                    Add to Basket
                  </Button>
                </div>
              </Card>
            </div>

            <div>
              <Card className="sticky top-4">
                <h3 className="font-semibold text-gray-900 mb-4">Booking Summary</h3>
                {checkIn && checkOut && selectedRoom && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Nights:</span>
                      <span className="font-medium">
                        {differenceInDays(new Date(checkOut), new Date(checkIn))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Room Price:</span>
                      <span className="font-medium">£{selectedRoom.price}/night</span>
                    </div>
                    {hotel.specialOffer && (
                      <div className="flex justify-between text-red-600">
                        <span>Discount ({hotel.specialOffer.discount}%):</span>
                        <span className="font-medium">
                          -£{((selectedRoom.price * differenceInDays(new Date(checkOut), new Date(checkIn)) * hotel.specialOffer.discount) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span>
                          £{(
                            selectedRoom.price * differenceInDays(new Date(checkOut), new Date(checkIn)) *
                            (1 - (hotel.specialOffer ? hotel.specialOffer.discount / 100 : 0))
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default BookingPage

