/**
 * Controlador de Productos
 * Maneja las peticiones HTTP relacionadas con productos
 */

const ProductService = require('./product.service');
const ResponseHelper = require('../../utils/response.helper');

class ProductController {
  constructor() {
    this.productService = new ProductService();
  }

  getProducts = async (req, res) => {
    try {
      const { page = 1, limit = 30 } = req.query;
      const result = await this.productService.getProducts(parseInt(page), parseInt(limit));

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Productos obtenidos');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  searchProducts = async (req, res) => {
    try {
      const { query } = req.query;

      if (!query) {
        return ResponseHelper.validationError(res, { query: ['Query es requerido'] });
      }

      const result = await this.productService.searchProducts(query);

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Productos encontrados');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  syncProducts = async (req, res) => {
    try {
      const { maxProducts = 50, soloNuevos = false, crearProveedores = true } = req.body;

      const result = await this.productService.syncProducts(
        parseInt(maxProducts),
        Boolean(soloNuevos),
        Boolean(crearProveedores)
      );

      if (result.success) {
        return ResponseHelper.success(res, result.data, result.message, 201);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getProductsWithoutSupplier = async (req, res) => {
    try {
      const result = await this.productService.getProductsWithoutSupplier();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Productos sin proveedor obtenidos');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  assignSupplier = async (req, res) => {
    try {
      const { id } = req.params;
      const { proveedor_id } = req.body;

      if (!proveedor_id) {
        return ResponseHelper.validationError(res, { proveedor_id: ['Proveedor ID es requerido'] });
      }

      const result = await this.productService.assignSupplier(parseInt(id), parseInt(proveedor_id));

      if (result.success) {
        return ResponseHelper.success(res, {}, result.message);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getSyncStatistics = async (req, res) => {
    try {
      const result = await this.productService.getSyncStatistics();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Estadísticas obtenidas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = ProductController;
