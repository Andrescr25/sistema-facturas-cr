import { Landmark, Download, Mail, RefreshCw } from 'lucide-react'
import { useReporteContador } from '../hooks/useReporteContador'
import { periodoActual } from '../utils/reporteContadorUtils'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Boton from '../components/ui/Boton'
import SelectorMes from '../components/reporte-contador/SelectorMes'
import ResumenMes from '../components/reporte-contador/ResumenMes'
import MovimientosMes from '../components/reporte-contador/MovimientosMes'
import DetalleMovimiento from '../components/reporte-contador/DetalleMovimiento'
import ModalEnviarContador from '../components/reporte-contador/ModalEnviarContador'
import ConfirmModal from '../components/ConfirmModal'
export default function ReporteContador() {
  const e = useReporteContador()
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      <EncabezadoPagina
        titulo="Reporte Contador"
        descripcion="Ventas, compras y gastos del mes, directamente del sistema."
        icono={Landmark}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorMes periodo={e.periodo} onCambiar={e.setPeriodo} />
        <div className="flex gap-2">
          <Boton variante="fantasma" onClick={() => e.setPeriodo(periodoActual())}>
            Mes actual
          </Boton>
          <Boton variante="secundario" disabled={e.cargando} onClick={e.cargar}>
            <RefreshCw size={16} /> Actualizar
          </Boton>
        </div>
      </div>
      {e.error && (
        <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">
          {e.error}
        </p>
      )}
      {e.aviso && (
        <p role="status" className="rounded-xl bg-exito-50 p-3 text-sm text-exito-700">
          {e.aviso}
        </p>
      )}
      {e.cargando ? (
        <p className="py-12 text-center text-neutro-500">Consultando el mes…</p>
      ) : (
        e.datos && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutro-500">
                {e.datos.finalizado ? 'Mes finalizado' : 'Mes en curso · cifras provisionales'} ·
                del {e.datos.desde} al {e.datos.hasta}
              </p>
              <div className="flex flex-wrap gap-2">
                <Boton
                  variante="secundario"
                  disabled={Boolean(e.ocupado)}
                  onClick={() => e.descargar('excel')}
                >
                  <Download size={16} /> Excel del mes
                </Boton>
                {e.datos.gastos.length > 0 && (
                  <Boton
                    variante="secundario"
                    disabled={Boolean(e.ocupado)}
                    onClick={() => e.descargar('comprobantes')}
                  >
                    Comprobantes de gastos
                  </Boton>
                )}
                <Boton
                  disabled={
                    Boolean(e.ocupado) || (!e.datos.documentos.length && !e.datos.gastos.length)
                  }
                  onClick={() => e.setModal(true)}
                >
                  <Mail size={16} /> Enviar al contador
                </Boton>
              </div>
            </div>
            <ResumenMes datos={e.datos} />
            <MovimientosMes estado={e} />
            {e.archivos.length > 0 && (
              <details className="rounded-2xl border border-neutro-200 bg-white p-5">
                <summary className="cursor-pointer font-bold text-neutro-800">
                  Reportes guardados anteriormente
                </summary>
                <p className="mt-2 text-sm text-neutro-500">
                  Conservan las correcciones y exclusiones de su preparación original. No se
                  reemplazan al consultar el mes actual.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.archivos.map((a) => (
                    <Boton
                      key={a.id}
                      variante="secundario"
                      disabled={Boolean(e.ocupado)}
                      onClick={() => e.descargarHistorico(a.id)}
                    >
                      Descargar {a.tipo}
                    </Boton>
                  ))}
                </div>
              </details>
            )}
            <DetalleMovimiento
              documento={e.seleccionado}
              onCerrar={() => e.setSeleccionado(null)}
            />
            <ModalEnviarContador estado={e} />
          </>
        )
      )}
      <ConfirmModal {...e.dialogProps} />
    </div>
  )
}
