const { query } = require('../config/database');
const notasCreditoService = require('./notasCreditoService');
const pagosProveedor = require('../src/modules/pagos-proveedores/pagosProveedor.service');
const lectura = require('../src/modules/pagos-proveedores/cuentasPorPagar.lectura');

/**
 * Cuentas por pagar: la lista de lo que se le debe a cada proveedor.
 *
 * EL SALDO Y EL ESTADO SE CALCULAN (migración 025, vista
 * `cuenta_por_pagar_saldo`): total − notas de crédito − lo pagado antes del
 * corte − los pagos vigentes. Las columnas `saldo_pendiente` y `estado` de la
 * tabla siguen existiendo porque el cliente de Prisma —compartido con
 * main/developer— las exige, pero en esta rama nadie las lee: se quedaban
 * viejas (13 cuentas figuraban PENDIENTE meses después de vencer, porque el
 * estado solo se corregía al abrir la pantalla).
 *
 * LAS CUENTAS SE LEEN CON `pg`, NO CON PRISMA (2026-10-29): la factura cargada
 * a mano a crédito no tiene factura del buzón (`factura_id` NULL) y Prisma lo
 * declara obligatorio. Ver `cuentasPorPagar.lectura.js`.
 */

class PagosProveedoresService {

  /**
   * Proveedores que tienen al menos una cuenta por pagar registrada (para el
   * dropdown de filtro) — a diferencia de GET /api/proveedores (el maestro
   * completo de proveedores de Alegra), esto no incluye proveedores sin
   * ninguna cuenta por pagar en el sistema. Independiente del filtro de
   * estado/fecha activo, para no perder opciones del dropdown al filtrar.
   */
  listarProveedoresConCuentas() {
    return lectura.proveedoresConCuentas();
  }

  calcularDiasRestantes(fechaVencimiento) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const venc = new Date(fechaVencimiento);
    venc.setHours(0, 0, 0, 0);
    const diffMs = venc.getTime() - hoy.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  aplicarFiltrosDias(cuentas, filtros) {
    let min = filtros.diasMin !== undefined ? Number(filtros.diasMin) : null;
    let max = filtros.diasMax !== undefined ? Number(filtros.diasMax) : null;
    const preset = filtros.dias;

    if (preset && preset !== 'todos') {
      switch (preset) {
        case 'vence7':
          min = 0;
          max = 7;
          break;
        case 'vence15':
          min = 0;
          max = 15;
          break;
        case 'vence30':
          min = 0;
          max = 30;
          break;
        case 'vencidas':
          max = -1;
          break;
        default:
          break;
      }
    }

    return cuentas.filter((cuenta) => {
      const dias = cuenta.diasRestantes;
      if (min !== null && dias < min) return false;
      if (max !== null && dias > max) return false;
      if (filtros.soloVencidas && dias >= 0) return false;
      return true;
    });
  }

  prepararSalida(cuentas) {
    return cuentas.map((cuenta) => ({
      id: cuenta.id,
      facturaId: cuenta.facturaId,
      proveedorNombre: cuenta.proveedorNombre,
      proveedorCedula: cuenta.proveedorCedula,
      numeroConsecutivo: cuenta.numeroConsecutivo,
      condicionVenta: cuenta.condicionVenta,
      plazoCredito: cuenta.plazoCredito,
      fechaEmision: cuenta.fechaEmision,
      fechaVencimiento: cuenta.fechaVencimiento,
      montoTotal: Number(cuenta.montoTotal) || 0,
      saldoPendiente: cuenta.saldo?.saldo ?? 0,
      estado: cuenta.saldo?.estado ?? 'PENDIENTE',
      // De qué se compone el saldo, para poder explicarlo en la pantalla.
      pagado: cuenta.saldo?.pagado ?? 0,
      pagadoSinDetalle: cuenta.saldo?.pagadoSinDetalle ?? 0,
      // De contado (migración 028): nació al registrar la compra y espera que
      // alguien anote cómo se pagó.
      deContado: cuenta.saldo?.deContado ?? false,
      diasRestantes: cuenta.diasRestantes,
      notas: cuenta.notas,
      productos: cuenta.factura?.productos?.map((producto) => ({
        id: producto.id,
        descripcion: producto.descripcion,
        cantidad: producto.cantidad,
        precioUnitario: producto.precioUnitario,
        totalLinea: producto.totalLinea,
        codigoProveedor: producto.codigoProveedor
      })) || [],
      numeroFacturaProveedor: cuenta.factura?.numeroConsecutivo || cuenta.numeroConsecutivo
    }));
  }

  calcularResumen(cuentas) {
    const totalFacturas = cuentas.length;
    const totalProveedores = new Set(cuentas.map((c) => c.proveedorCedula)).size;
    const totalPendiente = cuentas
      .filter((c) => c.estado !== 'PAGADA')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);
    const totalVencidas = cuentas
      .filter((c) => c.estado === 'VENCIDA')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);
    // Las de contado no "vencen pronto": se pagaron al recibirlas y falta anotarlo.
    const proximas = cuentas.filter((c) => c.estado !== 'CONTADO' && c.diasRestantes >= 0 && c.diasRestantes <= 7);
    const contado = cuentas.filter((c) => c.estado === 'CONTADO');
    const proximasMonto = proximas.reduce((sum, c) => sum + c.saldoPendiente, 0);

    // Sumas de colones con decimales: sin redondear salían cosas como
    // 431562.64999999997.
    const redondear = (v) => Math.round(v * 100) / 100;
    return {
      totalFacturas,
      totalProveedores,
      totalPendiente: redondear(totalPendiente),
      totalVencidas: redondear(totalVencidas),
      proximasAVencer: {
        cantidad: proximas.length,
        monto: redondear(proximasMonto)
      },
      // Compras de contado a las que falta anotarles el pago.
      deContado: {
        cantidad: contado.length,
        monto: redondear(contado.reduce((sum, c) => sum + c.saldoPendiente, 0))
      }
    };
  }

  /**
   * El filtro de estado, sobre el estado CALCULADO (la vista), no la columna.
   *
   * "Todos" quiere decir todo lo que queda por pagar, no todo lo que existe.
   * Antes traía también las pagadas y eran la enorme mayoría —244 de 311 al
   * hacer este cambio—, así que lo que de verdad se va a pagar quedaba
   * enterrado entre facturas ya cerradas. Las pagadas siguen siendo
   * alcanzables con su propio filtro.
   */
  filtroEstado(filtros = {}) {
    if (filtros.estado && filtros.estado !== 'todos') {
      return { igual: String(filtros.estado).toUpperCase() };
    }
    return { distinto: 'PAGADA' };
  }

  /** Las cuentas cuyo estado calculado pasa el filtro. */
  async idsPorEstado(filtros = {}) {
    const f = this.filtroEstado(filtros);
    const soloLiberadas = filtros.incluirRevision !== 'true';
    const { rows } = await query(
      `SELECT c.id
         FROM cuentas_por_pagar c
         JOIN cuenta_por_pagar_saldo v ON v.id = c.id
        WHERE ${soloLiberadas ? 'c.liberada = TRUE AND' : ''}
              v.estado ${f.igual ? '=' : '<>'} $1`,
      [f.igual || f.distinto]
    );
    return rows.map((r) => r.id);
  }

  async listarCuentas(filtros = {}) {
    const cuentas = await lectura.leerCuentas({
      ids: await this.idsPorEstado(filtros),
      proveedor: filtros.proveedor,
      search: filtros.search
    });

    const saldos = await pagosProveedor.saldosDeCuentas(cuentas.map((c) => c.id));
    const enriquecidas = cuentas.map((cuenta) => ({
      ...cuenta,
      saldo: saldos.get(cuenta.id),
      diasRestantes: this.calcularDiasRestantes(cuenta.fechaVencimiento)
    }));

    const filtradas = this.aplicarFiltrosDias(enriquecidas, filtros);
    const data = this.prepararSalida(filtradas);

    // El saldo ya tiene restados los créditos y los pagos. Esto es para
    // poder EXPLICAR el número: sin mostrar la nota o el pago, una factura
    // de ₡60.000 que aparece con saldo ₡30.000 se lee como un error.
    const ids = data.map((c) => c.id);
    const [notasPorCuenta, pagosPorCuenta] = await Promise.all([
      notasCreditoService.listarPorCuentas(ids),
      pagosProveedor.pagosDeCuentas(ids)
    ]);
    for (const cuenta of data) {
      const notas = notasPorCuenta.get(cuenta.id) || [];
      cuenta.notasCredito = notas;
      cuenta.creditoAplicado = notas.reduce((suma, n) => suma + n.monto, 0);
      cuenta.pagos = pagosPorCuenta.get(cuenta.id) || [];
    }

    const resumen = this.calcularResumen(data);

    return {
      data,
      resumen,
      filtros: {
        estado: filtros.estado || 'todos',
        proveedor: filtros.proveedor || 'todos',
        dias: filtros.dias || 'todos',
        search: filtros.search || ''
      }
    };
  }

  // Liberar la cuenta de una factura del buzón es de Registrar compra
  // (`compras/liberarCuentaPorPagar.js`). El método que había acá solo lo
  // llamaba el envío viejo a Alegra, y se fue con él.

  /**
   * Lo único que se edita a mano de una cuenta son sus notas. El saldo y el
   * estado ya no: un pago se registra como pago (y se anula como pago), para
   * que quede cuándo, de qué cuenta salió y con qué referencia.
   */
  async actualizarCuenta(id, payload = {}) {
    if (payload.saldoPendiente !== undefined || payload.estado !== undefined) {
      const error = new Error('El saldo ya no se edita a mano: registrá un pago (o anulá uno) desde la factura.');
      error.status = 400;
      throw error;
    }
    const cuenta = await lectura.anotarCuenta(id, payload.notas ?? null);
    return {
      ...cuenta,
      diasRestantes: this.calcularDiasRestantes(cuenta.fechaVencimiento)
    };
  }
}

module.exports = new PagosProveedoresService();

