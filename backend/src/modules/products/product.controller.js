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
      if (req.baseUrl.includes('/alegra')) {
        const { page = 1, limit = 30 } = req.query;
        const result = await this.productService.getProducts(parseInt(page), parseInt(limit));

        if (result.success) {
          return ResponseHelper.success(res, result.data, 'Productos obtenidos');
        }

        return ResponseHelper.error(res, result.error, 400);
      } else {
        return this.getProductsLocal(req, res);
      }
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  searchProducts = async (req, res) => {
    try {
      const { query, soloActivos } = req.query;

      if (!query) {
        return ResponseHelper.validationError(res, { query: ['Query es requerido'] });
      }

      const result = await this.productService.searchProducts(query, {
        soloActivos: soloActivos === '1' || soloActivos === 'true'
      });

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

  /**
   * Obtener productos locales con paginación y filtros
   */
  getProductsLocal = async (req, res) => {
    try {
      const result = await this.productService.getProductsLocal(req.query);
      if (result.success) {
        return res.json({
          success: true,
          data: result.data,
          pagination: result.pagination
        });
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en getProductsLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener un producto local específico
   */
  getProductLocal = async (req, res) => {
    try {
      const { id } = req.params;
      const result = await this.productService.getProductLocal(id);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Producto obtenido');
      }
      return ResponseHelper.error(res, result.message || result.error, result.statusCode || 500);
    } catch (error) {
      console.error('❌ Error en getProductLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Crear nuevo producto local
   */
  createProductLocal = async (req, res) => {
    try {
      const result = await this.productService.createProductLocal(req.body);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Producto creado exitosamente', 201);
      }
      if (result.code === '23505') {
        return ResponseHelper.error(res, 'Ya existe un producto con ese código', 409);
      }
      return ResponseHelper.error(res, result.message || result.error, result.statusCode || 500);
    } catch (error) {
      console.error('❌ Error en createProductLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Buscar productos locales
   */
  searchProductsLocal = async (req, res) => {
    try {
      const { termino } = req.params;
      const result = await this.productService.searchProductsLocal(termino);
      if (result.success) {
        return res.json({
          success: true,
          data: result.data,
          searchTerm: termino,
          total: result.data.length
        });
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en searchProductsLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener productos locales por proveedor
   */
  getProductsBySupplierLocal = async (req, res) => {
    try {
      const { proveedor_id } = req.params;
      const result = await this.productService.getProductsBySupplierLocal(proveedor_id);
      if (result.success) {
        return res.json({
          success: true,
          data: result.data,
          proveedor_id: parseInt(proveedor_id),
          total: result.data.length
        });
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en getProductsBySupplierLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = ProductController;
