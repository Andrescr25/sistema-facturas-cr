/**
 * "Acá no hay nada", con su motivo y, si aplica, la salida.
 *
 * Estaba repetido en media docena de pantallas, cada una con su propio
 * tamaño de icono y su propio espaciado. Un estado vacío mal hecho se lee
 * como una pantalla rota; conviene que se vean todos igual y que digan por
 * qué está vacío, no solo que lo está.
 */
export default function Vacio({ icono: Icono, titulo, descripcion, accion }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutro-300 px-6 py-14 text-center">
      {Icono && <Icono size={40} className="text-neutro-300" />}
      <div>
        <h3 className="font-bold text-neutro-800">{titulo}</h3>
        {descripcion && <p className="mt-1 text-sm text-neutro-500">{descripcion}</p>}
      </div>
      {accion}
    </div>
  )
}
