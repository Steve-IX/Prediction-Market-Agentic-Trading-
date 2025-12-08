import { Link } from 'react-router-dom'
import { FiStar, FiMapPin } from 'react-icons/fi'

const HotelCard = ({ hotel }) => {
  const averageRating = hotel.averageRating || hotel.starRating

  return (
    <Link
      to={`/hotel/${hotel.id}`}
      className="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="h-48 bg-gray-200 overflow-hidden">
        {hotel.imageUrl ? (
          <img
            src={hotel.imageUrl}
            alt={hotel.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/400x300?text=Hotel+Image'
            }}
          />
        ) : (
          <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500">
            No Image
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{hotel.name}</h3>
        <div className="flex items-center text-gray-600 mb-2">
          <FiMapPin className="h-4 w-4 mr-1" />
          <span className="text-sm">{hotel.city}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <FiStar
                key={i}
                className={`h-4 w-4 ${
                  i < hotel.starRating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                }`}
              />
            ))}
            <span className="ml-2 text-sm text-gray-600">
              {averageRating ? `${averageRating} / 5` : 'No ratings'}
            </span>
          </div>
          {hotel.specialOffer && (
            <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded">
              {hotel.specialOffer.discount}% OFF
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{hotel.description}</p>
      </div>
    </Link>
  )
}

export default HotelCard

