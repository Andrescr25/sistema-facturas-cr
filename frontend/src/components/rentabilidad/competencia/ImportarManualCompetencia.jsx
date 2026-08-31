import { useMemo, useState } from 'react'
import { Upload, Loader2, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react'
import ImagenProducto from './ImagenProducto'
import { parsearListaManual } from '../../../utils/competenciaUtils'
import { formatCurrency } from '../../../utils/rentabilidadUtils'

const EJEMPLO = `Cloro en galón 4%, 2150
Detergente en polvo 1kg; 1890
Jabón de manos 500ml\t1250`

const FUENTES_SUGERIDAS = ['pequeno_mundo', 'mayorista_central', 'coopesa']

/**
 * Import manual de listas de precio — cubre Pequeño Mundo (bloqueado por
 * Cloudflare, no se evade) y mayoristas (no publican precios).
 *
 * Muestra SIEMPRE el preview de lo que se va a guardar antes de guardarlo,
 * y las líneas que no se pudieron leer con el motivo: pegar 40 filas, que
 * se importen 37 y no saber cuáles se perdieron es peor que no importar.
 */
export default function ImportarManualCompetencia({ onImportar, importando, resultado }) {
  const [fuente, setFuente] = useState('')
  const [texto, setTexto] = useState('')
  const [excluidas, setExcluidas] = useState(() => new Set())

  const { filas, errores } = useMemo(() => parsearListaManual(texto), [texto])
  const aImportar = filas.filter(f => !excluidas.has(f.linea))

  const excluir = (linea) => setExcluidas(prev => new Set(prev).add(linea))

  const handleSubmit = async () => {
    if (!fuente.trim() || aImportar.length === 0) return
    const data = await onImportar(fuente.trim(), aImportar)
    if (data) {
      setTexto('')
      setExcluidas(new Set())
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutro-900">Importar lista manual</h3>
        <p className="text-xs text-neutro-500 mt-0.5">
          Para fuentes que no se pueden consultar automáticamente (Pequeño Mundo, mayoristas).
          Una línea por producto — separá con <strong>coma</strong>, <strong>punto y coma</strong> o <strong>TAB</strong> (pegado directo de Excel).
          Podés agregar la URL de una foto como tercera columna.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutro-600 mb-1">Fuente</label>
          <input
            type="text"
            list="fuentes-sugeridas"
            className="input w-full !py-2"
            placeholder="ej. pequeno_mundo"
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
          />
          <datalist id="fuentes-sugeridas">
            {FUENTES_SUGERIDAS.map(f => <option key={f} value={f} />)}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-neutro-600 mb-1">Lista de precios</label>
          <textarea
            className="input w-full font-mono text-xs"
            rows={5}
            placeholder={EJEMPLO}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setExcluidas(new Set()) }}
          />
        </div>
      </div>

      {errores.length > 0 && (
        <div className="rounded-xl border border-alerta-200 bg-alerta-50 p-3">
          <p className="text-xs font-semibold text-alerta-800 flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={14} /> {errores.length} línea{errores.length === 1 ? '' : 's'} no se pudo leer
          </p>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {errores.map(e => (
              <li key={e.linea} className="text-[11px] text-alerta-700">
                <span className="font-mono bg-alerta-100 px-1 rounded">línea {e.linea}</span>{' '}
                <span className="text-alerta-900">{e.texto.slice(0, 60)}</span> — {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aImportar.length > 0 && (
        <div className="rounded-xl border border-neutro-200 overflow-hidden">
          <div className="px-3 py-2 bg-neutro-50 border-b border-neutro-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutro-700 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-exito-500" />
              Se van a importar {aImportar.length} producto{aImportar.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-neutro-50">
            {aImportar.map(f => (
              <div key={f.linea} className="px-3 py-2 flex items-center gap-3">
                <ImagenProducto src={f.imagenUrl} alt={f.nombre} tamano="h-9 w-9" />
                <span className="text-xs text-neutro-800 flex-1 truncate" title={f.nombre}>{f.nombre}</span>
                <span className="text-xs font-semibold text-neutro-900 whitespace-nowrap">{formatCurrency(f.precio)}</span>
                <button
                  onClick={() => excluir(f.linea)}
                  title="Quitar de la importación"
                  className="text-neutro-300 hover:text-peligro-500 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutro-400">
          {texto.trim() === '' ? 'Pegá la lista para ver el preview' : `${aImportar.length} listas · ${errores.length} con problema`}
        </span>
        <button
          onClick={handleSubmit}
          disabled={importando || !fuente.trim() || aImportar.length === 0}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Importar {aImportar.length > 0 && `(${aImportar.length})`}
        </button>
      </div>

      {resultado && (
        <div className="text-sm bg-exito-50 border border-exito-100 rounded-xl p-3 text-exito-800">
          <strong>{resultado.guardadas}</strong> de {resultado.total} filas guardadas ·{' '}
          <strong>{resultado.sugerenciasGeneradas}</strong> sugerencias para revisar
        </div>
      )}
    </div>
  )
}
