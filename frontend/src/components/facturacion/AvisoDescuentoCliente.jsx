import Boton from '../ui/Boton'

export default function AvisoDescuentoCliente({ condiciones, facturaExistente }) {
  if (facturaExistente) return null
  const { cargando, error, porcentaje } = condiciones
  if (!cargando && !error && !porcentaje) return null
  return <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-peligro-200 bg-peligro-50 text-peligro-800' : 'border-nota-200 bg-nota-50 text-nota-800'}`}>
    <p>{error || (cargando ? 'Consultando descuento del cliente…' : `Descuento del cliente: ${porcentaje} % en productos con margen mayor al 21 %. Se usa el mayor descuento, sin sumarlos.`)}</p>
    {!cargando && <Boton type="button" variante="secundario" onClick={condiciones.refrescar} className="mt-2">Actualizar descuento</Boton>}
  </div>
}
