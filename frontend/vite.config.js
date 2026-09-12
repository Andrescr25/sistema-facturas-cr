import { existsSync, realpathSync } from 'node:fs'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

// En la máquina de desarrollo, node_modules de esta carpeta puede ser un
// enlace al de la carpeta de developer: el Escritorio está en iCloud y copiar
// 22.000 archivos no termina. Por eso la caché de vite va aparte (dos
// servidores escribiendo la misma se pisan) y vite puede leer la carpeta real
// de node_modules aunque quede fuera de esta. Si node_modules es una carpeta
// normal, las dos cosas no cambian nada.
const nodeModulesReal = existsSync('node_modules') ? realpathSync('node_modules') : null

// El puerto y la API salen del entorno para que dos ramas corran a la vez sin
// pisarse: developer en 5173 → 3000 (base de producción) e
// independencia-alegra en 5174 → 3001 (copia local). Los de esta rama están
// en .env.development; lo que se ponga en la terminal gana sobre el archivo.
//
// strictPort: si el puerto está ocupado, se detiene en vez de saltar al
// siguiente. Saltar dejaría esta rama en un puerto que nadie espera, y es
// fácil terminar trabajando en la pestaña equivocada.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // El build de producción sigue leyendo solo la variable de Render, como
  // siempre: si tomara los archivos, un .env.local con localhost:3000 quedaría
  // metido en un build hecho en esta máquina.
  const apiUrl = mode === 'production' ? process.env.VITE_API_URL : env.VITE_API_URL
  const apiOrigen = (apiUrl || 'http://localhost:3000').replace(/\/api\/?$/, '')

  return {
    plugins: [react()],
    cacheDir: 'node_modules/.vite-independencia',
    server: {
      port: Number(env.PUERTO_FRONTEND) || 5173,
      strictPort: true,
      host: true,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd()), ...(nodeModulesReal ? [nodeModulesReal] : [])]
      },
      proxy: {
        '/api': {
          target: apiOrigen,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true
    },
    define: {
      // Antes se leía solo process.env: un VITE_API_URL escrito en un archivo
      // .env quedaba tapado por undefined y la app caía al respaldo del
      // localhost:3000, que en esta rama es el backend de developer.
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl)
    }
  }
})
