import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getHotelsByOwner, updateHotel } from '../../services/hotelService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Modal from '../../components/common/Modal'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const SpecialOffersPage = () => {
  const { user } = useAuth()
  const [hotels, setHotels] = useState([])
  const [selectedHotel, setSelectedHotel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [offerForm, setOfferForm] = useState({ discount: '', description: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const ownerHotels = getHotelsByOwner(user.id)
      setHotels(ownerHotels)
      setLoading(false)
    }
  }, [user])

  const handleOpenModal = (hotel) => {
    setSelectedHotel(hotel)
    setOfferForm({
      discount: hotel.specialOffer?.discount?.toString() || '',
      description: hotel.specialOffer?.description || '',
    })
    setShowModal(true)
    setError('')
  }

  const handleSaveOffer = () => {
    if (!offerForm.discount || parseFloat(offerForm.discount) <= 0) {
      setError('Please enter a valid discount percentage')
      return
    }

    const discount = parseFloat(offerForm.discount)
    if (discount > 10) {
      setError('Discount cannot exceed 10%')
      return
    }

    if (!offerForm.description.trim()) {
      setError('Please enter a description')
      return
    }

    const specialOffer = {
      discount,
      description: offerForm.description,
    }

    updateHotel(selectedHotel.id, { specialOffer })
    setHotels(hotels.map(h => h.id === selectedHotel.id ? { ...h, specialOffer } : h))
    setShowModal(false)
    setOfferForm({ discount: '', description: '' })
  }

  const handleRemoveOffer = (hotelId) => {
    if (window.confirm('Are you sure you want to remove this special offer?')) {
      updateHotel(hotelId, { specialOffer: null })
      setHotels(hotels.map(h => h.id === hotelId ? { ...h, specialOffer: null } : h))
    }
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
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Special Offers</h1>

            {hotels.length === 0 ? (
              <Card>
                <p className="text-gray-600">You need to create hotels first before adding special offers.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {hotels.map((hotel) => (
                  <Card key={hotel.id}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">{hotel.name}</h3>
                        {hotel.specialOffer ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="font-semibold text-red-800">
                              {hotel.specialOffer.discount}% OFF
                            </p>
                            <p className="text-red-700 text-sm mt-1">{hotel.specialOffer.description}</p>
                          </div>
                        ) : (
                          <p className="text-gray-600">No special offer</p>
                        )}
                      </div>
                      <div className="ml-4 space-x-2">
                        <Button onClick={() => handleOpenModal(hotel)}>
                          {hotel.specialOffer ? 'Edit Offer' : 'Add Offer'}
                        </Button>
                        {hotel.specialOffer && (
                          <Button
                            variant="danger"
                            onClick={() => handleRemoveOffer(hotel.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Modal
              isOpen={showModal}
              onClose={() => {
                setShowModal(false)
                setError('')
              }}
              title={`Special Offer - ${selectedHotel?.name}`}
            >
              <div className="space-y-4">
                <Input
                  label="Discount Percentage (max 10%)"
                  name="discount"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={offerForm.discount}
                  onChange={(e) => setOfferForm({ ...offerForm, discount: e.target.value })}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={offerForm.description}
                    onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                    required
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Describe your special offer..."
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowModal(false)
                      setError('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveOffer}>Save Offer</Button>
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

export default SpecialOffersPage

