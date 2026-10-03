import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { descargarExcel } from '../../services/exportarExcelService'

export default function BotonExportarExcel({ ruta, params, disabled = false, title }) {
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState('')
  const exportar = async () => {
    if (descargando) return
    setDescargando(true)
    setError('')
    try { await descargarExcel(ruta, params) }
    catch (e) { setError(e.message) }
    finally { setDescargando(false) }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className="btn btn-outline whitespace-nowrap" onClick={exportar}
        disabled={disabled || descargando} title={title} aria-busy={descargando}>
        {descargando ? <Loader2 size={17} className="mr-2 animate-spin" /> : <Download size={17} className="mr-2" />}
        {descargando ? 'Descargando…' : 'Exportar Excel'}
      </button>
      {error && <p role="alert" className="max-w-sm text-sm text-peligro-700">{error}</p>}
    </div>
  )
}
