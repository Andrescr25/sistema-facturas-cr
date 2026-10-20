import { Search } from 'lucide-react'
import ContextoCicloDocumento from '../ContextoCicloDocumento'
import { CELDA } from './estilosFactura'

/**
 * A quién se le facturó. En edición, el nombre se vuelve un buscador EN SU
 * LUGAR: lo que se toca es el documento, no un formulario aparte.
 */
export default function ClienteFactura({ factura: f, editando, edicion }) {
  return (
    <div>
      <ContextoCicloDocumento documento={f} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Señor(es)</p>

      {editando ? (
        <div className="mt-0.5">
          {edicion.textoCliente === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-neutro-900">{edicion.cliente?.nombre}</span>
              <button
                onClick={() => edicion.setTextoCliente('')}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-primario-600 hover:bg-primario-50 md:min-h-0 md:px-0 md:text-xs md:hover:bg-transparent md:hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutro-400" />
                <input
                  autoFocus
                  value={edicion.textoCliente}
                  onChange={(e) => edicion.setTextoCliente(e.target.value)}
                  placeholder="Nombre o cédula…"
                  className={`${CELDA} pl-8 text-lg font-bold`}
                />
              </div>
              {edicion.clientesEncontrados.map(c => (
                <button
                  key={c.id}
                  onClick={() => edicion.elegirCliente(c)}
                  className="min-h-11 rounded-lg border border-neutro-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-primario-300 md:min-h-0"
                >
                  <span className="font-semibold text-neutro-800">{c.name}</span>
                  {c.identification && <span className="ml-2 text-xs text-neutro-400">{c.identification}</span>}
                </button>
              ))}
              <button onClick={() => edicion.setTextoCliente(null)} className="inline-flex min-h-10 items-center self-start text-sm text-neutro-500 hover:underline md:min-h-0 md:text-xs">
                Dejar el que está
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-neutro-400">
            La cédula, el teléfono y la dirección se copian de la ficha del cliente al guardar.
          </p>
        </div>
      ) : (
        <>
          <p className="text-lg font-bold text-neutro-900">{f.cliente.nombre}</p>
          <div className="mt-1 space-y-0.5 text-sm text-neutro-600">
            {f.cliente.identificacion && (
              <p>{f.cliente.tipoIdentificacion === 'CJ' ? 'Cédula jurídica' : 'Cédula física'}: {f.cliente.identificacion}</p>
            )}
            {f.cliente.telefono && <p>Teléfono: {f.cliente.telefono}</p>}
            {f.cliente.direccion && <p>Dirección: {f.cliente.direccion}</p>}
            {f.cliente.correo && <p>Email: {f.cliente.correo}</p>}
          </div>
        </>
      )}
    </div>
  )
}
