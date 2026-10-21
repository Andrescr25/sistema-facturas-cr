import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

/**
 * Lo que hacen al abrir los dos sitios: el sistema interno (main.jsx) y el
 * portal de clientes (mainPortal.jsx). Vive una sola vez acá para que los
 * dos no se desfasen; cada entrada solo dice qué aplicación dibuja.
 */

let gesturesLocked = false
const initGestureGuards = () => {
  if (gesturesLocked || typeof window === 'undefined') return
  gesturesLocked = true

  const preventGesture = (event) => {
    event.preventDefault()
  }

  window.addEventListener('gesturestart', preventGesture, { passive: false })
  window.addEventListener('gesturechange', preventGesture, { passive: false })
  window.addEventListener('gestureend', preventGesture, { passive: false })

  window.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false }
  )

  window.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1 || (event.scale && event.scale !== 1)) {
        event.preventDefault()
      }
    },
    { passive: false }
  )

  let lastTouchEnd = 0
  window.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        event.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false }
  )

  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && ['+', '-', '=', '0'].includes(event.key)) {
      event.preventDefault()
    }
  })
}

export function arrancar(aplicacion) {
  // Silenciar todos los logs informativos para mantener la consola libre de ruidos
  console.log = () => {};

  initGestureGuards()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {aplicacion}
      </BrowserRouter>
    </React.StrictMode>,
  )

  // Registro del Service Worker para PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((error) => {
          console.error('Error al registrar Service Worker:', error);
        });
    });
  }
}
