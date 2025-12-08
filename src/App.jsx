import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BookingProvider } from './context/BookingContext'
import ProtectedRoute from './components/layout/ProtectedRoute'

// Common pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import NotFoundPage from './pages/NotFoundPage'

// Customer pages
import LandingPage from './pages/customer/LandingPage'
import HotelDetailsPage from './pages/customer/HotelDetailsPage'
import BookingPage from './pages/customer/BookingPage'
import BookingConfirmationPage from './pages/customer/BookingConfirmationPage'
import BookingSuccessPage from './pages/customer/BookingSuccessPage'
import AccountPage from './pages/customer/AccountPage'
import MyBookingsPage from './pages/customer/MyBookingsPage'

// Owner pages
import OwnerDashboard from './pages/owner/Dashboard'
import HotelManagementPage from './pages/owner/HotelManagementPage'
import HotelFormPage from './pages/owner/HotelFormPage'
import BookingsViewPage from './pages/owner/BookingsViewPage'
import SpecialOffersPage from './pages/owner/SpecialOffersPage'
import OwnerAccountStatementPage from './pages/owner/AccountStatementPage'
import ReviewsManagementPage from './pages/owner/ReviewsManagementPage'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import OwnerManagementPage from './pages/admin/OwnerManagementPage'
import OwnerFormPage from './pages/admin/OwnerFormPage'
import OwnerOverviewPage from './pages/admin/OwnerOverviewPage'
import AdminAccountStatementPage from './pages/admin/AccountStatementPage'
import GlobalChargesPage from './pages/admin/GlobalChargesPage'

function App() {
  return (
    <AuthProvider>
      <BookingProvider>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/hotel/:id" element={<HotelDetailsPage />} />
            <Route path="/hotel/:id/book" element={<BookingPage />} />

            {/* Customer routes */}
            <Route
              path="/booking/confirm"
              element={
                <ProtectedRoute>
                  <BookingConfirmationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/booking/success"
              element={
                <ProtectedRoute>
                  <BookingSuccessPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <AccountPage />
                </ProtectedRoute>
              }
            />

            {/* Owner routes */}
            <Route
              path="/owner/dashboard"
              element={
                <ProtectedRoute requiredRole="owner">
                  <OwnerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/hotels"
              element={
                <ProtectedRoute requiredRole="owner">
                  <HotelManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/hotels/new"
              element={
                <ProtectedRoute requiredRole="owner">
                  <HotelFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/hotels/:id/edit"
              element={
                <ProtectedRoute requiredRole="owner">
                  <HotelFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/bookings"
              element={
                <ProtectedRoute requiredRole="owner">
                  <BookingsViewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/offers"
              element={
                <ProtectedRoute requiredRole="owner">
                  <SpecialOffersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/statement"
              element={
                <ProtectedRoute requiredRole="owner">
                  <OwnerAccountStatementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner/reviews"
              element={
                <ProtectedRoute requiredRole="owner">
                  <ReviewsManagementPage />
                </ProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/owners"
              element={
                <ProtectedRoute requiredRole="admin">
                  <OwnerManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/owners/new"
              element={
                <ProtectedRoute requiredRole="admin">
                  <OwnerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/owners/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <OwnerOverviewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/owners/:id/edit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <OwnerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/owners/:ownerId/statement"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminAccountStatementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/charges"
              element={
                <ProtectedRoute requiredRole="admin">
                  <GlobalChargesPage />
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Router>
      </BookingProvider>
    </AuthProvider>
  )
}

export default App
