import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  FiHome,
  FiMapPin,
  FiCalendar,
  FiTag,
  FiFileText,
  FiMessageSquare,
  FiUsers,
  FiSettings,
  FiDollarSign,
} from 'react-icons/fi'

const Sidebar = () => {
  const { user } = useAuth()
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  const adminLinks = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: FiHome },
    { path: '/admin/owners', label: 'Owner Management', icon: FiUsers },
    { path: '/admin/charges', label: 'Global Charges', icon: FiDollarSign },
  ]

  const ownerLinks = [
    { path: '/owner/dashboard', label: 'Dashboard', icon: FiHome },
    { path: '/owner/hotels', label: 'My Hotels', icon: FiMapPin },
    { path: '/owner/bookings', label: 'Bookings', icon: FiCalendar },
    { path: '/owner/offers', label: 'Special Offers', icon: FiTag },
    { path: '/owner/statement', label: 'Account Statement', icon: FiFileText },
    { path: '/owner/reviews', label: 'Reviews', icon: FiMessageSquare },
  ]

  const customerLinks = [
    { path: '/', label: 'Browse Hotels', icon: FiHome },
    { path: '/my-bookings', label: 'My Bookings', icon: FiCalendar },
    { path: '/account', label: 'Account', icon: FiSettings },
  ]

  const getLinks = () => {
    if (user?.role === 'admin') return adminLinks
    if (user?.role === 'owner') return ownerLinks
    return customerLinks
  }

  const links = getLinks()

  return (
    <aside className="w-64 bg-gray-50 min-h-screen p-4">
      <nav className="space-y-2">
        {links.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(link.path)
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar

