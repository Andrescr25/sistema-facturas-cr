/**
 * Cascarón visual compartido por las pantallas de acceso: login del sistema
 * (Ingresar), login del portal de clientes (PortalIngresar) y creación de
 * cuenta (PortalActivar). Antes cada una repetía el mismo logo chiquito
 * arriba de una tarjeta blanca sobre gris — no se veía distinto de
 * cualquier formulario interno. Esto reemplaza ese encabezado por un panel
 * de marca (visible desde `lg`) con los colores del logo: naranja
 * (`#e9501c`, el wordmark) y azul oscuro (el tono que reemplaza al gris del
 * camión — mismo rol de "color serio", con más contraste sobre fondo
 * oscuro). En pantallas angostas el panel se reemplaza por un encabezado
 * compacto con el mismo logo y la misma etiqueta.
 */
export default function AccesoLayout({ eyebrow, titulo, descripcion, children }) {
  return (
    <div className="min-h-screen bg-neutro-50 lg:flex">
      <div className="hidden lg:flex lg:w-[44%] xl:w-2/5 relative flex-col justify-between overflow-hidden bg-gradient-to-br from-azul-900 via-azul-800 to-azul-950 px-12 py-14 text-white">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-naranja-500/20 blur-3xl" />
        <div className="absolute -left-20 bottom-10 h-64 w-64 rounded-full bg-naranja-500/10 blur-3xl" />

        <div className="relative inline-block self-start rounded-2xl bg-white px-6 py-4 shadow-xl">
          <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="h-10 w-auto" />
        </div>

        <div className="relative space-y-3">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-naranja-300">{eyebrow}</p>
          )}
          {titulo && <h1 className="text-2xl font-extrabold leading-snug">{titulo}</h1>}
          {descripcion && (
            <p className="max-w-xs text-[13px] leading-relaxed text-azul-100/75">{descripcion}</p>
          )}
        </div>

        <p className="relative text-[11px] font-medium text-azul-100/40">Palmares, Costa Rica</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center lg:hidden">
            <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="mx-auto h-10 w-auto" />
            {eyebrow && (
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] text-azul-600">{eyebrow}</p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
