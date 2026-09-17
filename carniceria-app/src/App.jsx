import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { Productos } from './pages/Productos'
import { Cajero } from './pages/Cajero'
import { CierreCaja } from './pages/CierreCaja'
import { CompraProveedor } from './pages/CompraProveedor'
import { Gastos } from './pages/Gastos'
import { Fiados } from './pages/Fiados'
import { PedidosOnline } from './pages/PedidosOnline'
import { TiendaLayout } from './pages/tienda/TiendaLayout'
import { Tienda } from './pages/tienda/Tienda'
import { Carrito } from './pages/tienda/Carrito'
import { Checkout } from './pages/tienda/Checkout'
import { Confirmacion } from './pages/tienda/Confirmacion'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Productos />} />
        <Route path="/cajero" element={<Cajero />} />
        <Route path="/cierre-caja" element={<CierreCaja />} />
        <Route path="/compras" element={<CompraProveedor />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/fiados" element={<Fiados />} />
        <Route path="/pedidos-online" element={<PedidosOnline />} />
      </Route>

      {/* Tienda online: rutas públicas, sin login */}
      <Route path="/tienda" element={<TiendaLayout />}>
        <Route index element={<Tienda />} />
        <Route path="carrito" element={<Carrito />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="confirmacion/:pedidoId" element={<Confirmacion />} />
      </Route>
    </Routes>
  )
}

export default App
