import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import ConfirmModal from '../ConfirmModal'
import EnvioOrdenProveedor from './EnvioOrdenProveedor'
import { useOrdenesProveedor } from '../../hooks/useOrdenesProveedor'
import { estadoOrdenCompra } from '../../utils/ordenCompraTexto'
import { fechaHoraEnCostaRica } from '../../utils/fechaCR'

const numero = n => Number(n).toLocaleString('es-CR', { maximumFractionDigits: 6 })

export default function ModalOrdenesProveedor({ proveedor, onCerrar, onEnviada }) {
  const o = useOrdenesProveedor(proveedor, onEnviada)
  const cerrar = () => { if (!o.ocupado) onCerrar() }
  return <>
    <Modal titulo={`Órdenes de ${proveedor.nombre}`} ancho="xl" onCerrar={cerrar}>
      <div className="space-y-5 p-5">
        <p className="text-sm text-neutro-600">Una orden enviada conserva sus productos y cantidades. Los faltantes nuevos van en otra orden.</p>
        {o.error && <div role="alert" className="space-y-2 text-peligro-700"><p>{o.error}</p><Boton variante="secundario" disabled={o.ocupado} onClick={o.reintentar}>Actualizar órdenes</Boton></div>}
        {o.cargando && <p role="status" className="text-neutro-500">Consultando órdenes…</p>}
        {o.orden ? <>
          <Boton variante="fantasma" disabled={o.ocupado} onClick={o.volver}>Volver a las órdenes</Boton>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-neutro-900">{o.orden.referencia}</h3>
            <Insignia tono={o.orden.enviada_en ? 'exito' : 'alerta'}>{estadoOrdenCompra(o.orden)}</Insignia>
          </div>
          <p className="text-sm text-neutro-500">Creada: {fechaHoraEnCostaRica(o.orden.creado_en)}</p>
          <div className="space-y-3">
            {o.orden.lineas.map(l => <div key={l.id} className="rounded-xl border border-neutro-200 p-4 space-y-2">
              <p className="break-words font-semibold text-neutro-900">{l.producto_nombre}</p>
              <p className="text-sm text-neutro-500">{l.codigo_proveedor || l.codigo_interno} · 1 unidad del proveedor = {numero(l.factor_conversion)} unidades propias</p>
              {o.editable ? <label className="block text-sm font-semibold text-neutro-700">Cantidad a pedir
                <input type="number" aria-label={`Cantidad de la orden de ${l.producto_nombre}`} min="1" max="1000000" step="1" disabled={o.ocupado}
                  className="input mt-1 w-full max-w-xs" value={o.cantidades[l.producto_id] ?? ''} onChange={e => o.setCantidades(c => ({ ...c, [l.producto_id]: e.target.value }))} />
              </label> : <p className="font-semibold">{numero(l.cantidad_proveedor)} unidades del proveedor</p>}
            </div>)}
          </div>
          {o.editable && <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" disabled={o.ocupado || !o.cambios || !o.valida} onClick={o.guardar}>Guardar cantidades de esta orden</Boton>
            {o.orden.estado === 'borrador' && <Boton disabled={o.ocupado || o.cambios || !o.valida} onClick={o.confirmar}>Confirmar cantidades para enviar</Boton>}
            <Boton variante="fantasma" disabled={o.ocupado} onClick={o.cancelar}>Cancelar orden</Boton>
          </div>}
          {(o.orden.estado === 'pendiente_enviar' || o.orden.envio_id || o.orden.enviada_en) &&
            <EnvioOrdenProveedor key={o.orden.id} orden={o.orden} ocupado={o.ocupado || o.cambios} onOcupado={o.setOcupado}
              onActualizar={o.actualizar} prompt={o.prompt} />}
        </> : <>
          <Boton disabled={o.ocupado || o.cargando} onClick={o.preparar}>Preparar faltantes pendientes</Boton>
          {!o.cargando && !o.lista.length && <p className="text-neutro-500">Todavía no hay órdenes de este proveedor.</p>}
          <div className="space-y-3">
            {o.lista.map(orden => <button key={orden.id} type="button" disabled={o.ocupado} aria-label={`Abrir orden ${orden.referencia}`}
              onClick={() => o.abrir(orden.id)} className="w-full rounded-xl border border-neutro-200 p-4 text-left hover:border-primario-300 space-y-2">
              <p className="font-bold text-neutro-900">{orden.referencia} · {orden.productos} productos</p>
              <Insignia tono={orden.enviada_en ? 'exito' : orden.envio_id ? 'alerta' : 'neutro'}>{estadoOrdenCompra(orden)}</Insignia>
              <p className="text-sm text-neutro-500">Creada: {fechaHoraEnCostaRica(orden.creado_en)}</p>
              {orden.enviada_en && <p className="text-sm text-neutro-500">Enviada: {fechaHoraEnCostaRica(orden.enviada_en)}</p>}
            </button>)}
          </div>
        </>}
      </div>
    </Modal>
    <ConfirmModal {...o.dialogProps} />
  </>
}
