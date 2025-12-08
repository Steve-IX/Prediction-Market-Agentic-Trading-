import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getOwnerOverview } from '../../services/ownerService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiMapPin, FiStar } from 'react-icons/fi'

const OwnerOverviewPage = () => {
  const { id } = useParams()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      const data = getOwnerOverview(id)
      setOverview(data)
      setLoading(false)
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!overview) {
    return (
      <ProtectedRoute requiredRole="admin">
        <div className="min-h-screen flex flex-col">
          <Header />
          <div className="flex flex-grow">
            <Sidebar />
            <main className="flex-grow p-8">
              <Card>
                <p className="text-gray-600">Owner not found</p>
                <Link to="/admin/owners" className="text-primary-600 hover:text-primary-700">
                  Back to Owners
                </Link>
              </Card>
            </main>
          </div>
          <Footer />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <div className="mb-6">
              <Link to="/admin/owners" className="text-primary-600 hover:text-primary-700 mb-4 inline-block">
                ← Back to Owners
              </Link>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-6">
              Owner Overview: {overview.owner.username}
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Owner Information</h2>
                <div className="space-y-2">
                  <p><span className="font-medium">Username:</span> {overview.owner.username}</p>
                  <p><span className="font-medium">Email:</span> {overview.owner.email}</p>
                  <p><span className="font-medium">Balance:</span> £{overview.owner.balance?.toFixed(2) || '0.00'}</p>
                  <p><span className="font-medium">Registered:</span> {new Date(overview.owner.createdAt).toLocaleDateString()}</p>
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Statistics</h2>
                <div className="space-y-2">
                  <p><span className="font-medium">Total Hotels:</span> {overview.hotels.length}</p>
                  <p><span className="font-medium">Total Rooms:</span> {overview.hotels.reduce((sum, h) => sum + (h.rooms?.length || 0), 0)}</p>
                </div>
              </Card>
            </div>

            <Card>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Hotels</h2>
              {overview.hotels.length === 0 ? (
                <p className="text-gray-600">This owner has no hotels yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {overview.hotels.map((hotel) => (
                    <div key={hotel.id} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-2">{hotel.name}</h3>
                      <div className="flex items-center text-gray-600 mb-2">
                        <FiMapPin className="h-4 w-4 mr-1" />
                        <span className="text-sm">{hotel.city}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {hotel.rooms?.length || 0} {hotel.rooms?.length === 1 ? 'room' : 'rooms'}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {hotel.starRating} ⭐
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default OwnerOverviewPage

