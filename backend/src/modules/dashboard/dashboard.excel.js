const servicio = require('./dashboard.service');
const { generarExcel } = require('../../utils/exportarExcel');

async function exportar() {
  const r = await servicio.resumen();
  return generarExcel({
    titulo: 'Pendientes de Inicio', prefijo: 'inicio',
    informacion: [['Bodega', `Facturas pendientes de los últimos ${r.diasBodega} días.`],
      ['Pagos del mes', 'Períodos guardados del mes de Costa Rica, incluidas ambas quincenas.']],
    hojas: [{ nombre: 'Pendientes', columnas: [
      { clave: 'indicador', titulo: 'Indicador', ancho: 35 }, { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
      { clave: 'monto', titulo: 'Monto (CRC)', tipo: 'moneda', ancho: 23 }
    ], filas: [
      { indicador: 'Por cobrar', cantidad: r.cuentasPorCobrar.facturas, monto: r.cuentasPorCobrar.total },
      { indicador: 'Vencido', cantidad: r.cuentasPorCobrar.vencidas, monto: r.cuentasPorCobrar.vencido },
      { indicador: 'Pedidos de clientes', cantidad: r.pedidosPortal }, { indicador: 'Por alistar en bodega', cantidad: r.bodega },
      { indicador: 'Revisión de precios', cantidad: r.revisionPrecios }, { indicador: 'Pagos del mes', cantidad: r.pagosRecurrentes },
      { indicador: 'Excesos abiertos', cantidad: r.excesos }, { indicador: 'Duplicados por revisar', cantidad: r.duplicados }
    ] }]
  });
}

module.exports = { exportar };
