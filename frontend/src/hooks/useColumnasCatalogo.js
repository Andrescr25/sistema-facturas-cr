import { useSyncExternalStore } from 'react'

// Dos consultas compartidas por todas las categorías. Nunca se escucha scroll.
const grande = typeof window === 'undefined' ? null : window.matchMedia('(min-width: 1024px)')
const amplia = typeof window === 'undefined' ? null : window.matchMedia('(min-width: 1280px)')
const suscriptores = new Set()
const avisar = () => suscriptores.forEach(f => f())
function suscribir(f) {
  if (!suscriptores.size) {
    grande?.addEventListener('change', avisar)
    amplia?.addEventListener('change', avisar)
  }
  suscriptores.add(f)
  return () => {
    suscriptores.delete(f)
    if (!suscriptores.size) {
      grande?.removeEventListener('change', avisar)
      amplia?.removeEventListener('change', avisar)
    }
  }
}
const columnas = () => amplia?.matches ? 4 : grande?.matches ? 3 : 2
export function useColumnasCatalogo() {
  return useSyncExternalStore(suscribir, columnas, () => 2)
}
