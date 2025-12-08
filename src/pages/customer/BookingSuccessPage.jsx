import { Link } from 'react-router-dom'
import { FiCheckCircle } from 'react-icons/fi'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import Button from '../../components/common/Button'

const BookingSuccessPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow flex items-center justify-center">
        <div className="max-w-md w-full text-center px-4">
          <FiCheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600 mb-6">
            Your booking has been successfully confirmed. You will receive a confirmation email shortly.
          </p>
          <div className="space-y-3">
            <Link to="/my-bookings">
              <Button className="w-full">View My Bookings</Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="w-full">Browse More Hotels</Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default BookingSuccessPage

