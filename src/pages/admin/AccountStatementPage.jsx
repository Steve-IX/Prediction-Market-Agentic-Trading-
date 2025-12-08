import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { generateAccountStatement } from '../../services/chargeService'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const AccountStatementPage = () => {
  const { ownerId } = useParams()
  const [statement, setStatement] = useState(null)
  const [startDate, setStartDate] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (ownerId) {
      loadStatement()
    }
  }, [ownerId, startDate, endDate])

  const loadStatement = () => {
    setLoading(true)
    const stmt = generateAccountStatement(ownerId, startDate, endDate)
    setStatement(stmt)
    setLoading(false)
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Owner Account Statement</h1>

            <Card className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </Card>

            {loading ? (
              <Card>
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading statement...</p>
                </div>
              </Card>
            ) : statement ? (
              <div className="space-y-6">
                <Card>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Owner</p>
                      <p className="font-semibold text-gray-900">{statement.ownerName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Period</p>
                      <p className="font-semibold text-gray-900">
                        {format(new Date(statement.period.start), 'MMM dd, yyyy')} - {format(new Date(statement.period.end), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Opening Balance</p>
                      <p className="font-semibold text-gray-900">£{statement.openingBalance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Monthly Charges</p>
                      <p className="font-semibold text-red-600">-£{statement.totalMonthlyCharges.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Transaction Fees</p>
                      <p className="font-semibold text-red-600">-£{statement.totalTransactionFees.toFixed(2)}</p>
                    </div>
                    <div className="md:col-span-2 border-t pt-4">
                      <p className="text-sm text-gray-600">Closing Balance</p>
                      <p className="text-2xl font-bold text-gray-900">£{statement.closingBalance.toFixed(2)}</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Monthly Charges</h2>
                  {statement.monthlyCharges.length === 0 ? (
                    <p className="text-gray-600">No monthly charges for this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hotel</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Fee</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rooms</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Per Room Fee</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {statement.monthlyCharges.map((charge, index) => (
                            <tr key={index}>
                              <td className="px-4 py-3 text-sm text-gray-900">{charge.hotelName}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">£{charge.baseFee.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{charge.numberOfRooms}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">£{charge.perRoomFee.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">£{charge.monthlyCharge.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Transaction Fees</h2>
                  {statement.transactionFees.length === 0 ? (
                    <p className="text-gray-600">No transaction fees for this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hotel</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {statement.transactionFees.map((fee) => (
                            <tr key={fee.bookingId}>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {format(new Date(fee.date), 'MMM dd, yyyy')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{fee.hotelName}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{fee.bookingId.slice(-6)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">£{fee.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            ) : null}
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default AccountStatementPage

