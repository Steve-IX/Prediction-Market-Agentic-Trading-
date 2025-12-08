import { createContext, useContext, useState, useEffect } from 'react'

const BookingContext = createContext(null)

export const useBooking = () => {
  const context = useContext(BookingContext)
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider')
  }
  return context
}

export const BookingProvider = ({ children }) => {
  const [basket, setBasket] = useState([])

  useEffect(() => {
    const savedBasket = localStorage.getItem('bookingBasket')
    if (savedBasket) {
      setBasket(JSON.parse(savedBasket))
    }
  }, [])

  const addToBasket = (item) => {
    const newBasket = [...basket, { ...item, id: `basket_${Date.now()}` }]
    setBasket(newBasket)
    localStorage.setItem('bookingBasket', JSON.stringify(newBasket))
  }

  const removeFromBasket = (itemId) => {
    const newBasket = basket.filter(item => item.id !== itemId)
    setBasket(newBasket)
    localStorage.setItem('bookingBasket', JSON.stringify(newBasket))
  }

  const clearBasket = () => {
    setBasket([])
    localStorage.removeItem('bookingBasket')
  }

  const value = {
    basket,
    addToBasket,
    removeFromBasket,
    clearBasket,
    basketCount: basket.length,
  }

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

