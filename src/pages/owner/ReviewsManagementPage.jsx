import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getReviewsByHotel, updateReviewWithReply } from '../../services/reviewService'
import { getHotelsByOwner } from '../../services/hotelService'
import { format } from 'date-fns'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiStar } from 'react-icons/fi'

const ReviewsManagementPage = () => {
  const { user } = useAuth()
  const [hotels, setHotels] = useState([])
  const [selectedHotel, setSelectedHotel] = useState('all')
  const [reviews, setReviews] = useState([])
  const [selectedReview, setSelectedReview] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const ownerHotels = getHotelsByOwner(user.id)
      setHotels(ownerHotels)
      loadReviews()
      setLoading(false)
    }
  }, [user])

  const loadReviews = () => {
    if (selectedHotel === 'all') {
      const allReviews = hotels.flatMap(hotel => 
        getReviewsByHotel(hotel.id).map(review => ({ ...review, hotel }))
      )
      setReviews(allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    } else {
      const hotelReviews = getReviewsByHotel(selectedHotel)
      const hotel = hotels.find(h => h.id === selectedHotel)
      setReviews(hotelReviews.map(review => ({ ...review, hotel })))
    }
  }

  useEffect(() => {
    loadReviews()
  }, [selectedHotel, hotels])

  const handleOpenReplyModal = (review) => {
    setSelectedReview(review)
    setReplyText(review.ownerReply || '')
    setShowReplyModal(true)
  }

  const handleSaveReply = () => {
    if (!replyText.trim()) {
      return
    }
    updateReviewWithReply(selectedReview.id, replyText)
    loadReviews()
    setShowReplyModal(false)
    setReplyText('')
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
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Reviews Management</h1>

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

            {reviews.length === 0 ? (
              <Card>
                <p className="text-gray-600">No reviews yet</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <Card key={review.id}>
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900">{review.hotel?.name}</h3>
                      <p className="text-sm text-gray-500">
                        {format(new Date(review.createdAt), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center mb-2">
                      {[...Array(5)].map((_, i) => (
                        <FiStar
                          key={i}
                          className={`h-4 w-4 ${
                            i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-gray-700 mb-4">{review.comment}</p>
                    {review.ownerReply && (
                      <div className="bg-gray-50 border-l-4 border-primary-500 p-3 rounded mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-1">Your Reply:</p>
                        <p className="text-sm text-gray-600">{review.ownerReply}</p>
                      </div>
                    )}
                    <Button
                      onClick={() => handleOpenReplyModal(review)}
                      variant={review.ownerReply ? 'outline' : 'primary'}
                    >
                      {review.ownerReply ? 'Edit Reply' : 'Reply to Review'}
                    </Button>
                  </Card>
                ))}
              </div>
            )}

            <Modal
              isOpen={showReplyModal}
              onClose={() => {
                setShowReplyModal(false)
                setReplyText('')
              }}
              title="Reply to Review"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Reply
                  </label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Write your reply to this review..."
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowReplyModal(false)
                      setReplyText('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveReply}>Save Reply</Button>
                </div>
              </div>
            </Modal>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default ReviewsManagementPage

