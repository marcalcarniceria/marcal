import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { Productos } from './pages/Productos'
import { AdminCombos } from './pages/AdminCombos'
import { Cajero } from './pages/Cajero'
import { CierreCaja } from './pages/CierreCaja'
import { CompraProveedor } from './pages/CompraProveedor'
import { Proveedores } from './pages/Proveedores'
import { PlantillasDespiece } from './pages/PlantillasDespiece'
import { MovimientosStock } from './pages/MovimientosStock'
import { Gastos } from './pages/Gastos'
import { MovimientosDinero } from './pages/MovimientosDinero'
import { Fiados } from './pages/Fiados'
import { PedidosOnline } from './pages/PedidosOnline'
import { TiendaLayout } from './pages/tienda/TiendaLayout'
import { Tienda } from './pages/tienda/Tienda'
import { Carrito } from './pages/tienda/Carrito'
import { Checkout } from './pages/tienda/Checkout'
import { Confirmacion } from './pages/tienda/Confirmacion'
import { CrearCuenta } from './pages/tienda/CrearCuenta'

function App() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Productos />} />
        <Route path="/combos" element={<AdminCombos />} />
        <Route path="/cajero" element={<Cajero />} />
        <Route path="/cierre-caja" element={<CierreCaja />} />
        <Route path="/compras" element={<CompraProveedor />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/plantillas-despiece" element={<PlantillasDespiece />} />
        <Route path="/movimientos-stock" element={<MovimientosStock />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/movimientos-dinero" element={<MovimientosDinero />} />
        <Route path="/fiados" element={<Fiados />} />
        <Route path="/pedidos-online" element={<PedidosOnline />} />
      </Route>

      {/* Tienda online: rutas públicas, sin login */}
      <Route path="/tienda" element={<TiendaLayout />}>
        <Route index element={<Tienda />} />
        <Route path="carrito" element={<Carrito />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="confirmacion/:pedidoId" element={<Confirmacion />} />
        <Route path="crear-cuenta" element={<CrearCuenta />} />
      </Route>
    </Routes>
  )
}

export default App
