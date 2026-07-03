import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

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

// Filtro de consola para eliminar logs ruidosos y emojis de debug en desarrollo y producción
const originalLog = console.log;
console.log = (...args) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    const msg = args[0];
    if (
      msg.includes('🔍') ||
      msg.includes('✅') ||
      msg.includes('🔄') ||
      msg.includes('⏳') ||
      msg.includes('👥') ||
      msg.includes('📦') ||
      msg.includes('📱') ||
      msg.includes('👍') ||
      msg.includes('🗑️') ||
      msg.includes('💾') ||
      msg.includes('📋') ||
      msg.includes('✏️') ||
      msg.includes('IndexedDB') ||
      msg.includes('Service Worker') ||
      msg.includes('Sincronización') ||
      msg.includes('Servicio') ||
      msg.includes('Dispositivo detectado') ||
      msg.includes('Cambiado a modo') ||
      msg.includes('inicializada') ||
      msg.includes('precargadas listas') ||
      msg.includes('Servicio inicializado') ||
      msg.includes('Ping inicial') ||
      msg.includes('Backend conectado')
    ) {
      return;
    }
  }
  originalLog(...args);
};

initGestureGuards()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Registro del Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Service worker registrado
      })
      .catch((error) => {
        console.error('Error al registrar Service Worker:', error);
      });
  });
}