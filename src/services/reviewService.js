import { initializeMockData } from './mockData'
import { getBookingsByCustomer } from './bookingService'

initializeMockData()

export const getAllReviews = () => {
  const reviews = JSON.parse(localStorage.getItem('reviews') || '[]')
  return reviews.map(review => ({
    ...review,
    createdAt: new Date(review.createdAt),
  }))
}

export const getReviewsByHotel = (hotelId) => {
  return getAllReviews().filter(r => r.hotelId === hotelId)
}

export const getReviewById = (reviewId) => {
  return getAllReviews().find(r => r.id === reviewId) || null
}

export const canCustomerReview = (customerId, hotelId) => {
  const bookings = getBookingsByCustomer(customerId)
  return bookings.some(b => b.hotelId === hotelId && b.status === 'confirmed')
}

export const createReview = (reviewData) => {
  const reviews = getAllReviews()
  
  // Check if customer has previous bookings
  if (!canCustomerReview(reviewData.customerId, reviewData.hotelId)) {
    throw new Error('You must have a previous booking at this hotel to leave a review')
  }
  
  // Check if customer already reviewed this hotel
  const existingReview = reviews.find(
    r => r.customerId === reviewData.customerId && r.hotelId === reviewData.hotelId
  )
  if (existingReview) {
    throw new Error('You have already reviewed this hotel')
  }
  
  const newReview = {
    id: `review_${Date.now()}`,
    ...reviewData,
    ownerReply: null,
    createdAt: new Date(),
  }
  
  reviews.push(newReview)
  localStorage.setItem('reviews', JSON.stringify(reviews))
  return newReview
}

export const updateReviewWithReply = (reviewId, ownerReply) => {
  const reviews = getAllReviews()
  const index = reviews.findIndex(r => r.id === reviewId)
  
  if (index === -1) return null
  
  reviews[index].ownerReply = ownerReply
  localStorage.setItem('reviews', JSON.stringify(reviews))
  return reviews[index]
}

export const getAverageRating = (hotelId) => {
  const reviews = getReviewsByHotel(hotelId)
  if (reviews.length === 0) return 0
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  return (sum / reviews.length).toFixed(1)
}

