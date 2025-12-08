import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useBooking } from '../../context/BookingContext'
import { createBooking } from '../../services/bookingService'
import { format } from 'date-fns'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const BookingConfirmationPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { basket, clearBasket } = useBooking()
  const [cardDetails, setCardDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    saveCard: false,
  })
  const [savedCards, setSavedCards] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (basket.length === 0) {
      navigate('/')
      return
    }
    // Load saved cards from user
    if (user?.cards) {
      setSavedCards(user.cards)
    }
  }, [basket, user, navigate])

  const handleCardChange = (e) => {
    const { name, value, type, checked } = e.target
    setCardDetails({
      ...cardDetails,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  const calculateTotal = () => {
    const subtotal = basket.reduce((sum, item) => sum + item.totalAmount, 0)
    const charges = JSON.parse(localStorage.getItem('charges') || '{}')
    const transactionFeePercentage = charges.transactionFeePercentage || 5
    const transactionFees = basket.reduce((sum, item) => {
      return sum + (item.totalAmount * transactionFeePercentage) / 100
    }, 0)
    return { subtotal, transactionFees, total: subtotal + transactionFees }
  }

  const handleConfirm = async () => {
    if (!selectedCard && (!cardDetails.cardNumber || !cardDetails.expiryDate || !cardDetails.cvv)) {
      setError('Please enter card details or select a saved card')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Create all bookings
      for (const item of basket) {
        await createBooking({
          customerId: user.id,
          hotelId: item.hotelId,
          roomId: item.roomId,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          totalAmount: item.totalAmount,
        })
      }

      // Save card if requested
      if (cardDetails.saveCard && !selectedCard) {
        // In a real app, this would be saved securely
        const newCard = {
          id: `card_${Date.now()}`,
          last4: cardDetails.cardNumber.slice(-4),
          expiryDate: cardDetails.expiryDate,
          cardholderName: cardDetails.cardholderName,
        }
        // Update user with saved card (mock)
        const users = JSON.parse(localStorage.getItem('users') || '[]')
        const userIndex = users.findIndex(u => u.id === user.id)
        if (userIndex !== -1) {
          if (!users[userIndex].cards) users[userIndex].cards = []
          users[userIndex].cards.push(newCard)
          localStorage.setItem('users', JSON.stringify(users))
        }
      }

      clearBasket()
      navigate('/booking/success')
    } catch (err) {
      setError(err.message || 'Booking failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const totals = calculateTotal()

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Confirm Your Booking</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Booking Details</h2>
                  <div className="space-y-4">
                    {basket.map((item, index) => (
                      <div key={index} className="border-b border-gray-200 pb-4 last:border-0">
                        <h3 className="font-semibold text-gray-900">{item.hotelName}</h3>
                        <p className="text-sm text-gray-600">
                          {format(new Date(item.checkIn), 'MMM dd, yyyy')} - {format(new Date(item.checkOut), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-gray-600">
                          {item.nights} {item.nights === 1 ? 'night' : 'nights'} • {item.roomOccupancy === 1 ? 'Single' : 'Double'} occupancy
                        </p>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          £{item.totalAmount.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Details</h2>
                  
                  {savedCards.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Use Saved Card
                      </label>
                      <select
                        value={selectedCard || ''}
                        onChange={(e) => setSelectedCard(e.target.value || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select a saved card</option>
                        {savedCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            **** **** **** {card.last4} - {card.cardholderName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!selectedCard && (
                    <div className="space-y-4">
                      <Input
                        label="Card Number"
                        name="cardNumber"
                        type="text"
                        value={cardDetails.cardNumber}
                        onChange={handleCardChange}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="Expiry Date"
                          name="expiryDate"
                          type="text"
                          value={cardDetails.expiryDate}
                          onChange={handleCardChange}
                          placeholder="MM/YY"
                          maxLength={5}
                        />
                        <Input
                          label="CVV"
                          name="cvv"
                          type="text"
                          value={cardDetails.cvv}
                          onChange={handleCardChange}
                          placeholder="123"
                          maxLength={3}
                        />
                      </div>
                      <Input
                        label="Cardholder Name"
                        name="cardholderName"
                        type="text"
                        value={cardDetails.cardholderName}
                        onChange={handleCardChange}
                        placeholder="John Doe"
                      />
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="saveCard"
                          name="saveCard"
                          checked={cardDetails.saveCard}
                          onChange={handleCardChange}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <label htmlFor="saveCard" className="ml-2 block text-sm text-gray-700">
                          Save card for future bookings
                        </label>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}
                </Card>
              </div>

              <div>
                <Card className="sticky top-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">£{totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Transaction Fees (5%):</span>
                      <span className="font-medium">£{totals.transactionFees.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total:</span>
                        <span>£{totals.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="w-full mt-6"
                  >
                    {loading ? 'Processing...' : 'Confirm Booking'}
                  </Button>
                </Card>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default BookingConfirmationPage

