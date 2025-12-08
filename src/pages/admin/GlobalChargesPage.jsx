import { useState, useEffect } from 'react'
import { getCharges, updateCharges } from '../../services/chargeService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const GlobalChargesPage = () => {
  const [charges, setCharges] = useState({
    baseMonthlyFee: 100,
    perRoomFee: 10,
    transactionFeePercentage: 5,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const chargesData = getCharges()
    setCharges(chargesData)
    setLoading(false)
  }, [])

  const handleChange = (e) => {
    setCharges({
      ...charges,
      [e.target.name]: parseFloat(e.target.value) || 0,
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (charges.baseMonthlyFee < 0 || charges.perRoomFee < 0 || charges.transactionFeePercentage < 0) {
      setError('All values must be positive')
      return
    }

    if (charges.transactionFeePercentage > 100) {
      setError('Transaction fee percentage cannot exceed 100%')
      return
    }

    updateCharges(charges)
    setSuccess('Charges updated successfully')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Global Charges</h1>

            <Card>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Charges</h2>
                  <div className="space-y-4">
                    <Input
                      label="Base Monthly Fee per Hotel (£)"
                      name="baseMonthlyFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={charges.baseMonthlyFee}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Per Room Monthly Fee (£)"
                      name="perRoomFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={charges.perRoomFee}
                      onChange={handleChange}
                      required
                    />
                    <p className="text-sm text-gray-600">
                      Monthly charge = Base Fee + (Number of Rooms × Per Room Fee)
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Fees</h2>
                  <Input
                    label="Transaction Fee Percentage (%)"
                    name="transactionFeePercentage"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={charges.transactionFeePercentage}
                    onChange={handleChange}
                    required
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    This percentage is deducted from each booking amount
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                    {success}
                  </div>
                )}

                <Button type="submit">Update Charges</Button>
              </form>
            </Card>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default GlobalChargesPage

