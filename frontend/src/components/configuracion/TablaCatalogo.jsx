import { Plus, Pencil, Power } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import Vacio from '../ui/Vacio'

/**
 * Lista de un catálogo (impuestos, métodos de pago, plazos o cuentas).
 *
 * Un solo marcado: en pantalla grande se acomoda como tabla con encabezado y
 * en el teléfono cada fila se apila con su etiqueta. Sin ramas de isMobile.
 *
 * El último activo no se puede desactivar desde acá: el botón se apaga y
 * dice por qué, igual que el servidor, que igual lo rechazaría.
 */

// Clases escritas completas: Tailwind solo genera las que ve literalmente.
//
// Estado y acciones van con ANCHO FIJO, no `auto`. Cada fila es su propia
// cuadrícula: con `auto` cada una medía esas columnas por su contenido
// ("Activar" es más corto que "Desactivar"), así que las filas inactivas
// quedaban corridas y el encabezado no caía encima de sus valores.
const COLUMNAS_MD = {
  2: 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_13rem]',
  3: 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_13rem]'
}

export default function TablaCatalogo({ definicion, filas, trabajando, onAgregar, onEditar, onCambiarActivo }) {
  const { columnas, texto, singular, uno, descripcion, icono } = definicion
  const plantilla = COLUMNAS_MD[columnas.length]
  const activos = filas.filter(f => f.activo).length

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutro-900">{texto}</h2>
          <p className="text-sm text-neutro-500">{descripcion}</p>
        </div>
        <Boton onClick={onAgregar} disabled={trabajando}>
          <Plus size={16} /> Agregar {singular}
        </Boton>
      </div>

      {filas.length === 0 ? (
        <Vacio icono={icono} titulo={`Todavía no hay ${texto.toLowerCase()}`} descripcion={`Agregue ${uno} para empezar.`} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutro-200 bg-white">
          <div className={`hidden gap-4 border-b border-neutro-200 bg-neutro-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-neutro-500 md:grid ${plantilla}`}>
            {columnas.map(c => <span key={c.campo}>{c.titulo}</span>)}
            <span>Estado</span>
            <span aria-hidden="true" />
          </div>
          <ul className="divide-y divide-neutro-100">
            {filas.map(fila => {
              const esUltimoActivo = fila.activo && activos === 1
              return (
                <li
                  key={fila.id}
                  data-fila={fila.nombre}
                  className={`grid gap-2 px-4 py-3 md:items-center md:gap-4 ${plantilla} ${fila.activo ? '' : 'bg-neutro-50'}`}
                >
                  {columnas.map(c => {
                    const valor = c.formato ? c.formato(fila[c.campo]) : fila[c.campo]
                    return c.principal ? (
                      <p key={c.campo} className={`font-semibold ${fila.activo ? 'text-neutro-900' : 'text-neutro-500'}`}>{valor}</p>
                    ) : (
                      <p key={c.campo} className={`text-sm ${fila.activo ? 'text-neutro-700' : 'text-neutro-400'}`}>
                        <span className="mr-1 text-neutro-400 md:hidden">{c.titulo}:</span>{valor}
                      </p>
                    )
                  })}
                  <div>
                    <Insignia tono={fila.activo ? 'exito' : 'neutro'}>{fila.activo ? 'Activo' : 'Inactivo'}</Insignia>
                  </div>
                  <div className="flex gap-1.5 md:justify-end">
                    <Boton variante="fantasma" tamano="sm" onClick={() => onEditar(fila)} disabled={trabajando}>
                      <Pencil size={14} /> Editar
                    </Boton>
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => onCambiarActivo(fila)}
                      disabled={trabajando || esUltimoActivo}
                      title={esUltimoActivo ? `Tiene que quedar al menos ${uno} activo` : undefined}
                    >
                      <Power size={14} /> {fila.activo ? 'Desactivar' : 'Activar'}
                    </Boton>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-neutro-400">
        {activos} de {filas.length} activos. Lo inactivo no se borra: deja de aparecer en las listas, pero las facturas viejas lo siguen mostrando.
      </p>
    </section>
  )
}
