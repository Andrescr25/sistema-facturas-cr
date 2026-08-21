/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // Del logo de Distribuidora Tachi (frontend/public/tachi-logo.png):
        // naranja #e9501c muestreado del wordmark, gris #616161 del camión.
        // `azul` es el tono nuevo que reemplaza al gris en las pantallas de
        // acceso — mismo rol de "color serio de marca", con más contraste.
        naranja: {
          50: '#fdf1ea',
          100: '#fbdfcc',
          300: '#f2a878',
          500: '#e9501c',
          600: '#c43f13',
          700: '#9c3310',
        },
        azul: {
          50: '#eef2f7',
          100: '#dce3ed',
          300: '#5b7a9e',
          600: '#1e3a5f',
          800: '#12263f',
          900: '#0b1b30',
          950: '#060f1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'indeterminate-bar': {
          '0%': { left: '-40%' },
          '60%': { left: '100%' },
          '100%': { left: '100%' },
        },
      },
      animation: {
        'indeterminate-bar': 'indeterminate-bar 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}