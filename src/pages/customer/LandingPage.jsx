import { useState, useEffect } from 'react'
import { getAllHotels, searchHotels } from '../../services/hotelService'
import { getAverageRating } from '../../services/reviewService'
import HotelCard from '../../components/features/HotelCard'
import SearchBar from '../../components/features/SearchBar'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'

const LandingPage = () => {
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHotels()
  }, [])

  const loadHotels = () => {
    const allHotels = getAllHotels()
    // Sort alphabetically
    const sorted = allHotels.sort((a, b) => a.name.localeCompare(b.name))
    // Add average ratings
    const withRatings = sorted.map(hotel => ({
      ...hotel,
      averageRating: getAverageRating(hotel.id),
    }))
    setHotels(withRatings)
    setLoading(false)
  }

  const handleSearch = (query) => {
    if (!query.trim()) {
      loadHotels()
      return
    }
    const results = searchHotels(query)
    const withRatings = results.map(hotel => ({
      ...hotel,
      averageRating: getAverageRating(hotel.id),
    }))
    setHotels(withRatings)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold mb-4">Find Your Perfect Hotel</h1>
            <p className="text-xl mb-8 text-primary-100">
              Discover amazing hotels and book your stay with ease
            </p>
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading hotels...</p>
            </div>
          ) : hotels.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">No hotels found. Try a different search.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {hotels.length} {hotels.length === 1 ? 'Hotel' : 'Hotels'} Available
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {hotels.map((hotel) => (
                  <HotelCard key={hotel.id} hotel={hotel} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default LandingPage

