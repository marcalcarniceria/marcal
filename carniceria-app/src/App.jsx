import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { ReportesPage } from './pages/ReportesPage'
import { GestionUsuarios } from './pages/GestionUsuarios'
import { Productos } from './pages/Productos'
import { AdminCombos } from './pages/AdminCombos'
import { Cajero } from './pages/Cajero'
import { CierreCaja } from './pages/CierreCaja'
import { CompraProveedor } from './pages/CompraProveedor'
import { Proveedores } from './pages/Proveedores'
import { ZonasEnvio } from './pages/ZonasEnvio'
import { PlantillasDespiece } from './pages/PlantillasDespiece'
import { MovimientosStock } from './pages/MovimientosStock'
import { Gastos } from './pages/Gastos'
import { MovimientosDinero } from './pages/MovimientosDinero'
import { Fiados } from './pages/Fiados'
import { PedidosOnline } from './pages/PedidosOnline'
import { TiendaLayout } from './pages/tienda/TiendaLayout'
import {
  CatalogoSwitch,
  CarritoSwitch,
  CheckoutSwitch,
  ConfirmacionSwitch,
  CrearCuentaSwitch,
  SoloMobile,
} from './mobile/TiendaMobileRoutes'
import { ProductoDetalleMobile } from './mobile/ProductoDetalleMobile'
import { LoginMobile } from './mobile/LoginMobile'
import { MisPedidosMobile } from './mobile/MisPedidosMobile'

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
        <Route path="/reportes" element={<ReportesPage />} />
        <Route path="/" element={<Productos />} />
        <Route path="/combos" element={<AdminCombos />} />
        <Route path="/cajero" element={<Cajero />} />
        <Route path="/cierre-caja" element={<CierreCaja />} />
        <Route path="/compras" element={<CompraProveedor />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/zonas-envio" element={<ZonasEnvio />} />
        <Route path="/plantillas-despiece" element={<PlantillasDespiece />} />
        <Route path="/movimientos-stock" element={<MovimientosStock />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/movimientos-dinero" element={<MovimientosDinero />} />
        <Route path="/fiados" element={<Fiados />} />
        <Route path="/pedidos-online" element={<PedidosOnline />} />
      </Route>

      {/* /usuarios aparte del resto: exige rolRequerido="dueño" a nivel
          de ruta (no solo escondido del sidebar) porque esta pantalla
          puede crear cuentas y ver datos de clientes -- ver nota en
          ProtectedRoute.jsx. */}
      <Route
        element={
          <ProtectedRoute rolRequerido="dueño">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/usuarios" element={<GestionUsuarios />} />
      </Route>

      {/* Tienda online: rutas públicas, sin login. Las primeras 5 ya
          existían para compu y ahora eligen compu/mobile según el ancho
          de pantalla (ver TiendaMobileRoutes.jsx) sin cambiar nada para
          quien entra desde una pantalla ancha. Las últimas 3 son nuevas,
          solo existen en la versión mobile -- en pantalla ancha
          redirigen a /tienda (SoloMobile), nunca rompen nada de compu. */}
      <Route path="/tienda" element={<TiendaLayout />}>
        <Route index element={<CatalogoSwitch />} />
        <Route path="carrito" element={<CarritoSwitch />} />
        <Route path="checkout" element={<CheckoutSwitch />} />
        <Route path="confirmacion/:pedidoId" element={<ConfirmacionSwitch />} />
        <Route path="crear-cuenta" element={<CrearCuentaSwitch />} />

        <Route
          path="producto/:productoId"
          element={
            <SoloMobile>
              <ProductoDetalleMobile />
            </SoloMobile>
          }
        />
        <Route
          path="login"
          element={
            <SoloMobile>
              <LoginMobile />
            </SoloMobile>
          }
        />
        <Route
          path="mis-pedidos"
          element={
            <SoloMobile>
              <MisPedidosMobile />
            </SoloMobile>
          }
        />
      </Route>
    </Routes>
  )
}

export default App
