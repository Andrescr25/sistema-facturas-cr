const { PrismaClient, EstadoCuentaPorPagar } = require('@prisma/client');

class PagosProveedoresService {
  constructor() {
    if (global.prismaInstance) {
      this.prisma = global.prismaInstance;
    } else {
      this.prisma = new PrismaClient();
      global.prismaInstance = this.prisma;
    }
  }

  async marcarVencidas() {
    await this.prisma.cuentaPorPagar.updateMany({
      where: {
        liberada: true,
        estado: {
          in: [EstadoCuentaPorPagar.PENDIENTE, EstadoCuentaPorPagar.PARCIAL]
        },
        fechaVencimiento: {
          lt: new Date()
        }
      },
      data: {
        estado: EstadoCuentaPorPagar.VENCIDA
      }
    });
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
      saldoPendiente: Number(cuenta.saldoPendiente) || 0,
      estado: cuenta.estado,
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
    const proximas = cuentas.filter((c) => c.diasRestantes >= 0 && c.diasRestantes <= 7);
    const proximasMonto = proximas.reduce((sum, c) => sum + c.saldoPendiente, 0);

    return {
      totalFacturas,
      totalProveedores,
      totalPendiente,
      totalVencidas,
      proximasAVencer: {
        cantidad: proximas.length,
        monto: proximasMonto
      }
    };
  }

  buildWhereFilters(filtros = {}) {
    const andFilters = [];
    if (filtros.estado && filtros.estado !== 'todos') {
      andFilters.push({ estado: filtros.estado.toUpperCase() });
    }

    if (filtros.proveedor && filtros.proveedor !== 'todos') {
      andFilters.push({
        OR: [
          { proveedorCedula: filtros.proveedor },
          { proveedorNombre: { contains: filtros.proveedor, mode: 'insensitive' } }
        ]
      });
    }

    if (filtros.search) {
      andFilters.push({
        OR: [
          { numeroConsecutivo: { contains: filtros.search, mode: 'insensitive' } },
          { proveedorNombre: { contains: filtros.search, mode: 'insensitive' } },
          { proveedorCedula: { contains: filtros.search, mode: 'insensitive' } }
        ]
      });
    }

    return andFilters.length > 0 ? { AND: andFilters } : undefined;
  }

  async listarCuentas(filtros = {}) {
    await this.marcarVencidas();

    const dynamicFilters = this.buildWhereFilters(filtros);
    const where = {
      ...(dynamicFilters || {})
    };

    if (filtros.incluirRevision === 'true') {
      // no filter
    } else {
      where.liberada = true;
    }
    const cuentas = await this.prisma.cuentaPorPagar.findMany({
      where,
      include: {
        factura: {
          select: {
            numeroConsecutivo: true,
            productos: {
              select: {
                id: true,
                descripcion: true,
                cantidad: true,
                totalLinea: true,
                precioUnitario: true,
                codigoProveedor: true
              },
              orderBy: {
                numeroLinea: 'asc'
              },
              take: 50
            }
          }
        }
      },
      orderBy: {
        fechaVencimiento: 'asc'
      }
    });

    const enriquecidas = cuentas.map((cuenta) => ({
      ...cuenta,
      diasRestantes: this.calcularDiasRestantes(cuenta.fechaVencimiento)
    }));

    const filtradas = this.aplicarFiltrosDias(enriquecidas, filtros);
    const data = this.prepararSalida(filtradas);
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

  async liberarCuentaPorFactura(facturaId) {
    if (!facturaId) return null;

    const cuenta = await this.prisma.cuentaPorPagar.findUnique({
      where: { facturaId }
    });

    if (!cuenta) {
      return null;
    }

    const estado = cuenta.fechaVencimiento < new Date()
      ? EstadoCuentaPorPagar.VENCIDA
      : EstadoCuentaPorPagar.PENDIENTE;

    return this.prisma.cuentaPorPagar.update({
      where: { facturaId },
      data: {
        liberada: true,
        estado,
        saldoPendiente: cuenta.montoTotal
      }
    });
  }

  async actualizarCuenta(id, payload) {
    const data = {};
    if (payload.estado) {
      data.estado = payload.estado.toUpperCase();
    }
    if (payload.saldoPendiente !== undefined) {
      const saldo = Number(payload.saldoPendiente);
      data.saldoPendiente = saldo >= 0 ? saldo : 0;
      if (data.saldoPendiente === 0 && (!data.estado || data.estado !== 'PAGADA')) {
        data.estado = 'PAGADA';
      }
    }
    if (payload.notas !== undefined) {
      data.notas = payload.notas;
    }

    const cuenta = await this.prisma.cuentaPorPagar.update({
      where: { id },
      data
    });

    return {
      ...cuenta,
      diasRestantes: this.calcularDiasRestantes(cuenta.fechaVencimiento)
    };
  }
}

module.exports = new PagosProveedoresService();

