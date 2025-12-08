import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAllOwners, deleteOwner } from '../../services/ownerService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import ProtectedRoute from '../../components/layout/ProtectedRoute'
import { FiPlus, FiEdit, FiTrash2, FiEye } from 'react-icons/fi'

const OwnerManagementPage = () => {
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ownersData = getAllOwners()
    setOwners(ownersData)
    setLoading(false)
  }, [])

  const handleDelete = (ownerId) => {
    if (window.confirm('Are you sure you want to delete this owner? This will also delete all their hotels.')) {
      deleteOwner(ownerId)
      setOwners(owners.filter(o => o.id !== ownerId))
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
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Owner Management</h1>
              <Link to="/admin/owners/new">
                <Button>
                  <FiPlus className="inline h-4 w-4 mr-2" />
                  Add Owner
                </Button>
              </Link>
            </div>

            {owners.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">No owners registered yet.</p>
                  <Link to="/admin/owners/new">
                    <Button>Add First Owner</Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {owners.map((owner) => (
                      <tr key={owner.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {owner.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {owner.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          £{owner.balance?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <Link to={`/admin/owners/${owner.id}`}>
                            <Button variant="outline" className="inline-flex items-center">
                              <FiEye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Link to={`/admin/owners/${owner.id}/edit`}>
                            <Button variant="outline" className="inline-flex items-center">
                              <FiEdit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="danger"
                            onClick={() => handleDelete(owner.id)}
                            className="inline-flex items-center"
                          >
                            <FiTrash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default OwnerManagementPage

