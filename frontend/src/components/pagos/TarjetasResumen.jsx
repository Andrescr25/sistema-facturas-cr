/**
 * Las cuatro tarjetas de arriba, para los dos módulos de pagos.
 *
 * Eran dos archivos casi calcados —el de Cuentas por Cobrar dice en su
 * encabezado que salió de copiar el de Pagos a Proveedores— y ya habían
 * empezado a separarse: en cobrar, hacerle click a "Vencido" de nuevo
 * quitaba el filtro; en pagar, no había forma de soltarlo sin ir a los
 * filtros de abajo. Ese detalle es el que hace que el resumen sirva como
 * navegación, así que gana el que alterna.
 *
 * Cada tarjeta se describe con datos, no con JSX: `filtro` la vuelve un
 * botón que alterna ese filtro; sin `filtro` es solo un número.
 *
 * @param {Array<{clave, titulo, icono, valor, pie?, tono?, filtro?}>} tarjetas
 * @param {boolean} [compacta]  en el teléfono, todas en una fila y sin el
 *        "Click para filtrar" (Facturas en Bodega: se usa de pie, con una mano)
 */
export default function TarjetasResumen({ tarjetas, filtros, setFiltros, compacta = false }) {
  if (!tarjetas?.length) return null

  const rejilla = compacta
    ? `grid ${tarjetas.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 sm:gap-4`
    // Cinco tarjetas (Pagos a Proveedores en la rama de la migración) van en
    // una sola fila en escritorio.
    : `grid grid-cols-1 md:grid-cols-2 ${tarjetas.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4`
  const relleno = compacta ? 'p-3 sm:p-5' : 'p-5'

  return (
    <div className={rejilla}>
      {tarjetas.map((t) => {
        const Icono = t.icono
        const tono = TONOS[t.tono] || TONOS.neutro
        const activa = t.filtro ? esActivo(filtros, t.filtro) : false

        const cuerpo = (
          <>
            <p className="text-sm text-neutro-500 flex items-center gap-1.5">
              <Icono size={14} className={tono.icono} />
              {t.titulo}
            </p>
            <p className={`${compacta ? 'text-xl sm:text-2xl' : 'text-2xl'} font-semibold mt-1 ${tono.valor}`}>{t.valor}</p>
            {t.pie && <span className="text-xs text-neutro-500">{t.pie}</span>}
          </>
        )

        // `.card` solo trae margen interno en móvil (index.css, .mobile-device
        // .card): en escritorio el texto quedaba pegado al borde.
        if (!t.filtro) {
          return <div key={t.clave} className={`card ${relleno}`}>{cuerpo}</div>
        }

        return (
          <button
            key={t.clave}
            type="button"
            onClick={() => setFiltros((prev) => alternar(prev, t.filtro))}
            className={`card ${relleno} text-left transition hover:shadow-md ${tono.hover} ${activa ? tono.activa : ''}`}
          >
            {cuerpo}
            {!compacta && (
              <span className="text-xs text-neutro-500">
                {activa ? 'Click para quitar el filtro' : 'Click para filtrar'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const TONOS = {
  neutro: { icono: 'text-primario-500', valor: 'text-neutro-900', hover: 'hover:border-primario-300', activa: 'ring-2 ring-primario-400 border-primario-300' },
  peligro: { icono: 'text-peligro-500', valor: 'text-peligro-600', hover: 'hover:border-peligro-300', activa: 'ring-2 ring-peligro-400 border-peligro-300' },
  alerta: { icono: 'text-alerta-500', valor: 'text-alerta-600', hover: 'hover:border-alerta-300', activa: 'ring-2 ring-alerta-400 border-alerta-300' },
  exito: { icono: 'text-exito-500', valor: 'text-neutro-900', hover: 'hover:border-exito-300', activa: 'ring-2 ring-exito-400 border-exito-300' }
}

/** `filtro` es {campo: valor}; está activo si TODOS sus campos coinciden. */
function esActivo(filtros, filtro) {
  return Object.entries(filtro).every(([campo, valor]) => filtros?.[campo] === valor)
}

/**
 * Alterna el filtro de la tarjeta. Al soltarlo cada campo vuelve a 'todos',
 * que es el valor neutro en los dos módulos; al ponerlo, los demás campos
 * del filtro se dejan en 'todos' para que dos tarjetas no se peleen (pedir
 * "vencidas" Y "vence en 7 días" a la vez no devuelve nada).
 */
function alternar(filtros, filtro) {
  const quitando = esActivo(filtros, filtro)
  const campos = Object.keys(filtro)
  const nuevo = { ...filtros }
  for (const campo of ['estado', 'dias']) {
    if (campos.includes(campo)) nuevo[campo] = quitando ? 'todos' : filtro[campo]
    else nuevo[campo] = 'todos'
  }
  return nuevo
}
