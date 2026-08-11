import { useState } from 'react'
import { ClipboardList, ShieldCheck, PlusCircle } from 'lucide-react'
import SincronizarCompetencia from './SincronizarCompetencia'
import ImportarManualCompetencia from './ImportarManualCompetencia'
import PendientesCompetencia from './PendientesCompetencia'
import ConfirmadosCompetencia from './ConfirmadosCompetencia'

/**
 * Pestaña Competencia del Tablero de Rentabilidad — Fase 3 de la estrategia
 * de precios, deliberadamente dentro del mismo módulo que la calidad de
 * costo (misma pregunta: "¿están bien mis precios?", solo que mirando hacia
 * afuera).
 *
 * Dividida en tres secciones en vez de apilarlo todo: revisar es lo que se
 * hace seguido y necesita la pantalla entera; sincronizar/importar es algo
 * puntual que no tiene por qué estar estorbando arriba cada vez.
 *
 * Puramente presentacional: el estado vive en useCompetencia, llamado una
 * sola vez desde Rentabilidad.jsx.
 */
export default function TabCompetencia({
  categorias,
  pendientes, loadingPendientes,
  confirmados, loadingConfirmados,
  enCurso, error,
  confirmar, rechazar,
  importar, importando, resultadoImport,
  sincronizar, sincronizando, resultadoSync
}) {
  const [seccion, setSeccion] = useState('revisar')

  const secciones = [
    { key: 'revisar', label: 'Revisar', icon: ClipboardList, count: pendientes.length },
    { key: 'confirmados', label: 'Confirmados', icon: ShieldCheck, count: confirmados.length },
    { key: 'datos', label: 'Agregar datos', icon: PlusCircle }
  ]

  return (
    <div className="space-y-5">
      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700 p-4">
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {secciones.map((s) => {
          const Icon = s.icon
          const activa = seccion === s.key
          return (
            <button
              key={s.key}
              onClick={() => setSeccion(s.key)}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition ${
                activa
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              {s.label}
              {s.count > 0 && (
                <span className={`text-xxs px-1.5 py-0.5 rounded-full ${activa ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {seccion === 'revisar' && (
        <PendientesCompetencia
          pendientes={pendientes}
          loading={loadingPendientes}
          enCurso={enCurso}
          onConfirmar={confirmar}
          onRechazar={rechazar}
        />
      )}

      {seccion === 'confirmados' && (
        <ConfirmadosCompetencia confirmados={confirmados} loading={loadingConfirmados} />
      )}

      {seccion === 'datos' && (
        <div className="space-y-4">
          <SincronizarCompetencia
            categorias={categorias}
            onSincronizar={sincronizar}
            sincronizando={sincronizando}
            resultado={resultadoSync}
          />
          <ImportarManualCompetencia
            onImportar={importar}
            importando={importando}
            resultado={resultadoImport}
          />
        </div>
      )}
    </div>
  )
}
