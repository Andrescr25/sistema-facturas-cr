/**
 * Controlador de Órdenes de Compra y WhatsApp
 * Maneja las peticiones HTTP correspondientes
 */

const OrdersWhatsappService = require('./orders-whatsapp.service');
const ResponseHelper = require('../../utils/response.helper');

class OrdersWhatsappController {
  constructor() {
    this.ordersService = new OrdersWhatsappService();
  }

  getCantidades = async (req, res) => {
    try {
      const result = await this.ordersService.getCantidadesModificadas();
      return ResponseHelper.success(res, result, 'Cantidades modificadas obtenidas');
    } catch (error) {
      console.error('❌ Error obteniendo cantidades:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  guardarCantidades = async (req, res) => {
    try {
      const { cantidades } = req.body;

      if (!cantidades || !Array.isArray(cantidades)) {
        return ResponseHelper.validationError(res, { cantidades: ['Se requiere un array de cantidades'] });
      }

      const guardadas = await this.ordersService.guardarCantidades(cantidades, req.usuario?.id);
      return ResponseHelper.success(res, { cantidades_guardadas: guardadas }, 'Cantidades guardadas correctamente', 201);
    } catch (error) {
      console.error('❌ Error guardando cantidades:', error);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  limpiarCantidades = async (req, res) => {
    try {
      const eliminados = await this.ordersService.limpiarCantidades();
      return ResponseHelper.success(res, { registros_eliminados: eliminados }, 'Cantidades modificadas eliminadas correctamente');
    } catch (error) {
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  registrarProductoEliminado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal, producto_id, revisionReporte, fechaInicio } = req.body;

      if (!proveedorNombre || !productoCodigo) {
        return ResponseHelper.validationError(res, {
          proveedorNombre: !proveedorNombre ? ['proveedorNombre es requerido'] : [],
          productoCodigo: !productoCodigo ? ['productoCodigo es requerido'] : []
        });
      }

      await this.ordersService.registrarProductoEliminado(
        proveedorNombre,
        productoCodigo,
        productoNombre,
        cantidadOriginal,
        { productoId: producto_id, usuarioId: req.usuario?.id, revisionReporte, fechaInicio }
      );

      return ResponseHelper.success(res, {}, 'Producto eliminado registrado correctamente');
    } catch (error) {
      console.error('❌ Error registrando producto eliminado:', error);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  registrarProductoAgregado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo, productoNombre, cantidad, producto_id, revisionReporte, fechaInicio } = req.body;

      if (!proveedorNombre || !productoCodigo || !productoNombre || !cantidad) {
        return ResponseHelper.validationError(res, {
          proveedorNombre: !proveedorNombre ? ['proveedorNombre es requerido'] : [],
          productoCodigo: !productoCodigo ? ['productoCodigo es requerido'] : [],
          productoNombre: !productoNombre ? ['productoNombre es requerido'] : [],
          cantidad: !cantidad ? ['cantidad es requerida'] : []
        });
      }

      await this.ordersService.registrarProductoAgregado(
        proveedorNombre,
        productoCodigo,
        productoNombre,
        cantidad,
        { productoId: producto_id, usuarioId: req.usuario?.id, revisionReporte, fechaInicio }
      );

      return ResponseHelper.success(res, {}, 'Producto agregado registrado correctamente');
    } catch (error) {
      console.error('❌ Error registrando producto agregado:', error);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  /** Deshacer: el producto vuelve a la orden de compra. */
  quitarProductoEliminado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo } = req.body;
      if (!proveedorNombre || !productoCodigo) {
        return ResponseHelper.validationError(res, {
          proveedorNombre: !proveedorNombre ? ['proveedorNombre es requerido'] : [],
          productoCodigo: !productoCodigo ? ['productoCodigo es requerido'] : []
        });
      }
      const borrados = await this.ordersService.eliminarRegistroTemporal(proveedorNombre, productoCodigo, 'eliminado', req.body);
      return ResponseHelper.success(res, { borrados }, 'Producto restaurado a la orden');
    } catch (error) {
      console.error('❌ Error restaurando producto:', error);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  /** Quitar un producto que se había agregado a mano. */
  quitarProductoAgregado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo } = req.body;
      if (!proveedorNombre || !productoCodigo) {
        return ResponseHelper.validationError(res, {
          proveedorNombre: !proveedorNombre ? ['proveedorNombre es requerido'] : [],
          productoCodigo: !productoCodigo ? ['productoCodigo es requerido'] : []
        });
      }
      const borrados = await this.ordersService.eliminarRegistroTemporal(proveedorNombre, productoCodigo, 'agregado', req.body);
      return ResponseHelper.success(res, { borrados }, 'Producto agregado quitado');
    } catch (error) {
      console.error('❌ Error quitando producto agregado:', error);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  /**
   * GET /orden-compra/proveedor-contacto?cedula=…&nombre=…
   * El WhatsApp de la ficha de ese proveedor (ver el servicio).
   */
  getProveedorContacto = async (req, res) => {
    try {
      const { cedula, nombre } = req.query;
      const data = await this.ordersService.getProveedorContacto({ cedula, nombre });
      return ResponseHelper.success(res, data, 'Teléfono del proveedor obtenido');
    } catch (error) {
      console.error('❌ Error obteniendo teléfono proveedor:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /** PUT /orden-compra/proveedor-contacto { cedula, nombre, telefono } */
  guardarProveedorContacto = async (req, res) => {
    try {
      const { cedula, nombre, telefono } = req.body || {};

      if (!nombre || !telefono) {
        return ResponseHelper.validationError(res, {
          nombre: !nombre ? ['nombre es requerido'] : [],
          telefono: !telefono ? ['telefono es requerido'] : []
        });
      }

      const data = await this.ordersService.guardarProveedorContacto(
        { cedula, nombre, telefono }, req.usuario?.id ?? null);

      return ResponseHelper.success(res, data, 'Teléfono guardado en la ficha del proveedor');
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error('❌ Error guardando teléfono proveedor:', error);
      return ResponseHelper.error(res, error.message, status);
    }
  };
}

module.exports = OrdersWhatsappController;
