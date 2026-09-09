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

  generarPDF = async (req, res) => {
    try {
      const { proveedor, productos, preferirDatosProveedor = true } = req.body;

      if (!proveedor || !productos || !Array.isArray(productos)) {
        return ResponseHelper.validationError(res, {
          proveedor: !proveedor ? ['Proveedor es requerido'] : [],
          productos: !productos ? ['Productos es requerido'] : []
        });
      }

      const { pdfBuffer } = await this.ordersService.generarOrdenCompraPDFBuffer(
        proveedor,
        productos,
        preferirDatosProveedor
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=orden-${proveedor.replace(/\s+/g, '-')}.pdf`);
      return res.send(pdfBuffer);
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  enviarWhatsApp = async (req, res) => {
    try {
      const { proveedor, telefono, productos, preferirDatosProveedor = true, mensaje = '' } = req.body;

      if (!proveedor || !telefono || !productos || !Array.isArray(productos)) {
        return ResponseHelper.validationError(res, {
          proveedor: !proveedor ? ['Proveedor es requerido'] : [],
          telefono: !telefono ? ['Teléfono es requerido'] : [],
          productos: !productos ? ['Productos es requerido'] : []
        });
      }

      const result = await this.ordersService.enviarOrdenCompraWhatsApp(
        proveedor,
        telefono,
        productos,
        preferirDatosProveedor,
        mensaje,
        req.usuario?.id || null
      );

      return ResponseHelper.success(res, result, 'Orden de compra enviada por WhatsApp');
    } catch (error) {
      console.error('❌ Error enviando por WhatsApp:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * GET /orden-compra/enviados?desde=YYYY-MM-DD
   * A qué proveedores ya se les mandó el pedido en el período del reporte.
   */
  getOrdenesEnviadas = async (req, res) => {
    try {
      const { desde } = req.query;
      const result = await this.ordersService.getOrdenesEnviadas(desde);
      return ResponseHelper.success(res, result, 'Órdenes enviadas obtenidas');
    } catch (error) {
      console.error('❌ Error obteniendo órdenes enviadas:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

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

      const guardadas = await this.ordersService.guardarCantidades(cantidades);
      return ResponseHelper.success(res, { cantidades_guardadas: guardadas }, 'Cantidades guardadas correctamente', 201);
    } catch (error) {
      console.error('❌ Error guardando cantidades:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  limpiarCantidades = async (req, res) => {
    try {
      const eliminados = await this.ordersService.limpiarCantidades();
      return ResponseHelper.success(res, { registros_eliminados: eliminados }, 'Cantidades modificadas eliminadas correctamente');
    } catch (error) {
      console.error('❌ Error eliminando cantidades:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  registrarProductoEliminado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal } = req.body;

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
        cantidadOriginal
      );

      return ResponseHelper.success(res, {}, 'Producto eliminado registrado correctamente');
    } catch (error) {
      console.error('❌ Error registrando producto eliminado:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  registrarProductoAgregado = async (req, res) => {
    try {
      const { proveedorNombre, productoCodigo, productoNombre, cantidad } = req.body;

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
        cantidad
      );

      return ResponseHelper.success(res, {}, 'Producto agregado registrado correctamente');
    } catch (error) {
      console.error('❌ Error registrando producto agregado:', error);
      return ResponseHelper.error(res, error.message, 500);
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
      const borrados = await this.ordersService.eliminarRegistroTemporal(proveedorNombre, productoCodigo, 'eliminado');
      return ResponseHelper.success(res, { borrados }, 'Producto restaurado a la orden');
    } catch (error) {
      console.error('❌ Error restaurando producto:', error);
      return ResponseHelper.error(res, error.message, 500);
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
      const borrados = await this.ordersService.eliminarRegistroTemporal(proveedorNombre, productoCodigo, 'agregado');
      return ResponseHelper.success(res, { borrados }, 'Producto agregado quitado');
    } catch (error) {
      console.error('❌ Error quitando producto agregado:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getProveedorContacto = async (req, res) => {
    try {
      const { nombreProveedor } = req.params;
      const telefono = await this.ordersService.getProveedorContacto(nombreProveedor);
      return ResponseHelper.success(res, { telefono }, 'Teléfono del proveedor obtenido');
    } catch (error) {
      console.error('❌ Error obteniendo teléfono proveedor:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  guardarProveedorContacto = async (req, res) => {
    try {
      const { nombreProveedor, cedulaProveedor, telefono } = req.body;

      if (!nombreProveedor || !telefono) {
        return ResponseHelper.validationError(res, {
          nombreProveedor: !nombreProveedor ? ['nombreProveedor es requerido'] : [],
          telefono: !telefono ? ['telefono es requerido'] : []
        });
      }

      const data = await this.ordersService.guardarProveedorContacto(
        nombreProveedor,
        cedulaProveedor,
        telefono
      );

      return ResponseHelper.success(res, data, 'Teléfono guardado correctamente');
    } catch (error) {
      console.error('❌ Error guardando teléfono proveedor:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = OrdersWhatsappController;
