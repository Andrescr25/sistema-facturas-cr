import { AlertTriangle, Award, Coins, Receipt, ThumbsUp, TrendingDown } from 'lucide-react'
import { useRentabilidad } from '../hooks/useRentabilidad'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'
import Dato from '../components/rentabilidad/Dato'
import CuandoSeVende from '../components/rentabilidad/CuandoSeVende'
import ListaProductos from '../components/rentabilidad/ListaProductos'
import DetalleProducto from '../components/rentabilidad/DetalleProducto'
import { colonesCorto, porcentaje } from '../utils/rentabilidadFormato'

/**
 * Rentabilidad — una sola pantalla, sin pestañas (rehecha el 2026-09-25).
 *
 * Arriba el negocio entero: lo vendido y lo ganado en los últimos 3 meses,
 * cuántos productos hay en cada clase de rotación, y cuándo se vende (por
 * semana, mes y año; qué días del mes, de la semana y qué meses). Abajo los
 * productos, y al tocar uno, su detalle con sus propias gráficas.
 *
 * Todo en el momento: la rotación y las estadísticas salen de las ventas
 * cada vez que se abre, no de una foto sacada con un script.
 */
export default function Rentabilidad() {
  const r = useRentabilidad()
  const { resumen, filtros, setFiltros } = r

  const filtrar = (cambios) => {
    const yaEsta = Object.entries(cambios).every(([k, v]) => filtros[k] === v)
    setFiltros(yaEsta ? Object.fromEntries(Object.keys(cambios).map((k) => [k, ''])) : cambios)
    document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (r.seleccionado) {
    return (
      <div className="mx-auto max-w-6xl pb-24">
        <DetalleProducto seleccionado={r.seleccionado} detalle={r.detalle} cargando={r.cargandoDetalle}
          error={r.errorDetalle} onVolver={r.cerrar} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <EncabezadoPagina titulo="Rentabilidad"
        descripcion="Margen de cada producto, su rotación real y cuándo se vende — al día, con las ventas de los últimos 3 meses." />

      {r.errorResumen && <p className="rounded-xl bg-peligro-50 px-4 py-3 text-sm text-peligro-800">{r.errorResumen}</p>}

      {!resumen ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><SkeletonContraparte /><SkeletonContraparte /><SkeletonContraparte /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Dato titulo="Ventas · 3 meses" icono={Receipt} valor={colonesCorto(resumen.ventas)}
              pie={`${resumen.facturas} facturas · ${resumen.clientes} clientes · sin IVA`} />
            <Dato titulo="Ganancia · 3 meses" icono={Coins} valor={colonesCorto(resumen.ganancia)}
              pie={`Margen ${porcentaje(resumen.margenPonderado)} sobre el ${porcentaje(resumen.coberturaCosto)} de lo vendido que tiene costo`} />
            <Dato titulo="Lo más vendido" icono={Award} valor={`${resumen.porClase.A} productos`}
              pie="Rotación A: el 80 % de las unidades" onClick={() => filtrar({ clase: 'A' })} activo={filtros.clase === 'A'} />
            <Dato titulo="Se venden bien" icono={ThumbsUp} valor={`${resumen.porClase.B} productos`}
              pie="Rotación B: el siguiente 15 %" onClick={() => filtrar({ clase: 'B' })} activo={filtros.clase === 'B'} />
            <Dato titulo="Bajo el costo" icono={TrendingDown} valor={`${resumen.margenNegativo} productos`} tono={resumen.margenNegativo ? 'peligro' : 'neutro'}
              pie="Se venden por menos de lo que cuestan" onClick={() => filtrar({ costo: 'negativo' })} activo={filtros.costo === 'negativo'} />
            <Dato titulo="Sin costo confiable" icono={AlertTriangle} valor={`${resumen.sinCosto} productos`} tono={resumen.sinCosto ? 'alerta' : 'neutro'}
              pie="Sin costo no hay margen que calcular" onClick={() => filtrar({ costo: 'sin-costo' })} activo={filtros.costo === 'sin-costo'} />
          </div>

          <CuandoSeVende series={resumen.series} medida="ventas" titulo="Cuándo se vende · todo el negocio" />
        </>
      )}

      <ListaProductos filtros={filtros} setFiltros={setFiltros} limpiarFiltros={r.limpiarFiltros}
        lista={r.lista} cargando={r.cargandoLista} error={r.errorLista}
        categorias={resumen?.categorias || []} onAbrir={r.abrir} />
    </div>
  )
}
