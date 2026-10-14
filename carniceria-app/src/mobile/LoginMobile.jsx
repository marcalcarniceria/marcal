import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoginForm } from '../pages/tienda/useLoginForm'
import { FormCrearCuenta } from '../pages/tienda/CrearCuenta'
import { MobileScreenHeader } from './MobileScreenHeader'
import './mobile.css'

function VistaLogin({ onRegistrarse }) {
  const navigate = useNavigate()
  const { email, setEmail, password, setPassword, enviando, error, iniciarSesion } = useLoginForm(() =>
    navigate('/tienda'),
  )
  const [verPass, setVerPass] = useState(false)
  const [avisoOlvido, setAvisoOlvido] = useState(false)

  return (
    <>
      <div className="mob-login-intro">
        <img src="/images/logo-marcal.png" alt="" className="mob-login-logo" />
        <div className="mob-titulo">Iniciar sesión</div>
        <p>Entrá para ver tus pedidos y comprar más rápido.</p>
      </div>

      <form className="mob-login-form" onSubmit={iniciarSesion}>
        <label className="mob-campo">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tuemail@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="mob-campo">
          <span>Contraseña</span>
          <div className="mob-campo-pass">
            <input
              type={verPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setVerPass((v) => !v)}>
              {verPass ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>

        <button
          type="button"
          className="mob-login-olvido"
          onClick={() => setAvisoOlvido(true)}
        >
          ¿Olvidaste tu contraseña?
        </button>
        {avisoOlvido && (
          <p className="mob-login-olvido-aviso">Escribinos por WhatsApp para recuperar tu acceso.</p>
        )}

        {error && <p className="mob-login-error">{error}</p>}

        <button type="submit" className="mob-action-btn" disabled={enviando}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <div className="mob-login-registro">
        <span>¿No tenés cuenta?</span>
        <button type="button" onClick={onRegistrarse}>
          Registrate
        </button>
      </div>
    </>
  )
}

function VistaRegistro({ onVolverALogin }) {
  const navigate = useNavigate()
  return (
    <div className="mob-login-registro-form">
      <div className="mob-titulo">Crear cuenta</div>
      <p className="mob-login-registro-sub">Solo para clientes. Si comprás como invitado no hace falta crear cuenta.</p>
      <FormCrearCuenta onExito={() => navigate('/tienda')} />
      <button type="button" className="mob-login-olvido" onClick={onVolverALogin}>
        ← Ya tengo cuenta, iniciar sesión
      </button>
    </div>
  )
}

export function LoginMobile() {
  const navigate = useNavigate()
  const [modo, setModo] = useState('login')

  return (
    <div className="mob-app">
      <MobileScreenHeader onBack={() => navigate('/tienda')} />
      <div className="mob-login-body">
        {modo === 'login' ? (
          <VistaLogin onRegistrarse={() => setModo('registro')} />
        ) : (
          <VistaRegistro onVolverALogin={() => setModo('login')} />
        )}
      </div>
    </div>
  )
}
