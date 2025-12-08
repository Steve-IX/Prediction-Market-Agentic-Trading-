import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getOwnerById, createOwner, updateOwner } from '../../services/ownerService'
import Header from '../../components/layout/Header'
import Sidebar from '../../components/layout/Sidebar'
import Footer from '../../components/layout/Footer'
import Card from '../../components/common/Card'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import ProtectedRoute from '../../components/layout/ProtectedRoute'

const OwnerFormPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEdit && id) {
      const owner = getOwnerById(id)
      if (owner) {
        setFormData({
          username: owner.username,
          email: owner.email,
          password: '',
        })
      } else {
        navigate('/admin/owners')
      }
    }
  }, [id, isEdit, navigate])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isEdit) {
        const updates = {
          username: formData.username,
          email: formData.email,
        }
        if (formData.password) {
          updates.password = formData.password
        }
        updateOwner(id, updates)
      } else {
        if (!formData.password) {
          setError('Password is required for new owners')
          setLoading(false)
          return
        }
        createOwner({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        })
      }
      navigate('/admin/owners')
    } catch (err) {
      setError(err.message || 'Failed to save owner')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-grow">
          <Sidebar />
          <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">
              {isEdit ? 'Edit Owner' : 'Create New Owner'}
            </h1>

            <Card>
              <form onSubmit={handleSubmit} className="space-y-6">
                <Input
                  label="Username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                />

                <Input
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />

                <Input
                  label={isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!isEdit}
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : isEdit ? 'Update Owner' : 'Create Owner'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/admin/owners')}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </main>
        </div>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

export default OwnerFormPage

