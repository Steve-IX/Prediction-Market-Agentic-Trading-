import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getHotelById } from '../../services/hotelService'
import { getReviewsByHotel, getAverageRating, canCustomerReview, createReview } from '../../services/reviewService'
import { useAuth } from '../../context/AuthContext'
import { FiStar, FiMapPin, FiWifi, FiTruck, FiActivity, FiCoffee } from 'react-icons/fi'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Button from '../../components/common/Button'
import Card from '../../components/common/Card'
import Modal from '../../components/common/Modal'
import Input from '../../components/common/Input'

const HotelDetailsPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [hotel, setHotel] = useState(null)
  const [reviews, setReviews] = useState([])
  const [averageRating, setAverageRating] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' })
  const [canReview, setCanReview] = useState(false)

  useEffect(() => {
    loadHotel()
  }, [id, user])

  const loadHotel = () => {
    const hotelData = getHotelById(id)
    if (!hotelData) {
      navigate('/')
      return
    }
    setHotel(hotelData)
    const hotelReviews = getReviewsByHotel(id)
    setReviews(hotelReviews)
    setAverageRating(getAverageRating(id))
    if (user) {
      setCanReview(canCustomerReview(user.id, id))
    }
    setLoading(false)
  }

  const handleReviewSubmit = (e) => {
    e.preventDefault()
    try {
      createReview({
        customerId: user.id,
        hotelId: id,
        bookingId: null, // In real app, would link to a booking
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      })
      setShowReviewModal(false)
      setReviewForm({ rating: 5, comment: '' })
      loadHotel()
    } catch (err) {
      alert(err.message || 'Failed to submit review')
    }
  }

  const facilityIcons = {
    WiFi: FiWifi,
    Parking: FiTruck,
    Gym: FiActivity,
    Restaurant: FiCoffee,
  }

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link to="/" className="text-primary-600 hover:text-primary-700 mb-4 inline-block">
            ← Back to Hotels
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="h-96 bg-gray-200 rounded-lg overflow-hidden mb-6">
                {hotel.imageUrl ? (
                  <img
                    src={hotel.imageUrl}
                    alt={hotel.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/800x400?text=Hotel+Image'
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500">
                    No Image Available
                  </div>
                )}
              </div>

              <Card className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{hotel.name}</h1>
                <div className="flex items-center text-gray-600 mb-4">
                  <FiMapPin className="h-5 w-5 mr-2" />
                  <span>{hotel.address}, {hotel.city}</span>
                </div>
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <FiStar
                      key={i}
                      className={`h-5 w-5 ${
                        i < hotel.starRating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-gray-600">
                    {hotel.starRating} Star Hotel
                    {averageRating > 0 && ` • ${averageRating} / 5.0 (${reviews.length} reviews)`}
                  </span>
                </div>
                {hotel.specialOffer && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-800 font-semibold">
                      🎉 Special Offer: {hotel.specialOffer.discount}% OFF
                    </p>
                    <p className="text-red-700 text-sm mt-1">{hotel.specialOffer.description}</p>
                  </div>
                )}
                <p className="text-gray-700 leading-relaxed">{hotel.description}</p>
              </Card>

              <Card className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Facilities</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {hotel.facilities.map((facility) => {
                    const Icon = facilityIcons[facility] || FiCoffee
                    return (
                      <div key={facility} className="flex items-center space-x-2">
                        <Icon className="h-5 w-5 text-primary-600" />
                        <span className="text-gray-700">{facility}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Reviews</h2>
                {reviews.length === 0 ? (
                  <p className="text-gray-600">No reviews yet. Be the first to review!</p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
                        <div className="flex items-center mb-2">
                          {[...Array(5)].map((_, i) => (
                            <FiStar
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-sm text-gray-600">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-700">{review.comment}</p>
                        {review.ownerReply && (
                          <div className="mt-2 pl-4 border-l-4 border-primary-200 bg-gray-50 p-2 rounded">
                            <p className="text-sm font-semibold text-gray-700">Owner Reply:</p>
                            <p className="text-sm text-gray-600">{review.ownerReply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canReview && (
                  <div className="mt-4">
                    <Button onClick={() => setShowReviewModal(true)}>
                      Write a Review
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            <div>
              <Card className="sticky top-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Book Your Stay</h2>
                <p className="text-gray-600 mb-4">
                  {hotel.rooms.length} {hotel.rooms.length === 1 ? 'Room' : 'Rooms'} Available
                </p>
                <p className="text-sm text-gray-600 mb-6">
                  Prices start from £{Math.min(...hotel.rooms.map(r => r.price))} per night
                </p>
                <Link to={`/hotel/${hotel.id}/book`}>
                  <Button className="w-full">Book Now</Button>
                </Link>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="Write a Review"
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
            <select
              value={reviewForm.rating}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {[5, 4, 3, 2, 1].map(rating => (
                <option key={rating} value={rating}>{rating} Stars</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
            <textarea
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
              required
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Share your experience..."
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="secondary" onClick={() => setShowReviewModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit Review</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default HotelDetailsPage

