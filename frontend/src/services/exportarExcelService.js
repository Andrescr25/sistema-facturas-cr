import { descargarArchivo } from './descargarArchivoService'

/** Misma descarga autenticada que los comprobantes, validando el tipo Excel. */
export function descargarExcel(ruta, params = {}) {
  return descargarArchivo(ruta, {
    params, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nombre: 'reporte.xlsx'
  })
}
