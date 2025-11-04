/**
 * Servicio de Negocio de Productos
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getProductService: getAlegraProductService } = require('../../integrations/alegra');
const { query } = require('../../../config/database');

class ProductService {
  constructor() {
    this.alegraProductService = getAlegraProductService();
  }

  /**
   * Obtener productos con paginación
   */
  async getProducts(page = 1, limit = 30) {
    try {
      const result = await this.alegraProductService.getProducts(page, limit);
      return result;
    } catch (error) {
      console.error('❌ Error obteniendo productos:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Buscar productos
   */
  async searchProducts(searchQuery) {
    try {
      const result = await this.alegraProductService.searchProducts(searchQuery);
      return result;
    } catch (error) {
      console.error('❌ Error buscando productos:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincronizar productos desde Alegra
   */
  async syncProducts(maxProducts = 50, soloNuevos = false, crearProveedores = true) {
    try {
      console.log('📦 Iniciando sincronización de productos...');

      const result = await this.alegraProductService.getAllProducts();

      if (!result.success) {
        return result;
      }

      const products = result.data;

      // Guardar en BD local
      let insertados = 0;
      let actualizados = 0;

      for (const product of products) {
        const existeProducto = await query(
          'SELECT id FROM productos WHERE alegra_id = $1',
          [product.id]
        );

        if (existeProducto.rows.length > 0) {
          // Actualizar
          await query(`
            UPDATE productos
            SET nombre = $1, codigo = $2, precio = $3, updated_at = CURRENT_TIMESTAMP
            WHERE alegra_id = $4
          `, [product.name, product.reference, product.price, product.id]);
          actualizados++;
        } else {
          // Insertar
          await query(`
            INSERT INTO productos (alegra_id, nombre, codigo, precio)
            VALUES ($1, $2, $3, $4)
          `, [product.id, product.name, product.reference, product.price]);
          insertados++;
        }
      }

      return {
        success: true,
        message: 'Sincronización completada',
        data: {
          total: products.length,
          insertados,
          actualizados
        }
      };
    } catch (error) {
      console.error('❌ Error sincronizando productos:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener productos sin proveedor
   */
  async getProductsWithoutSupplier() {
    try {
      const result = await query(`
        SELECT * FROM productos
        WHERE proveedor_id IS NULL
        ORDER BY nombre
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error obteniendo productos sin proveedor:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Asignar proveedor a producto
   */
  async assignSupplier(productoId, proveedorId) {
    try {
      await query(`
        UPDATE productos
        SET proveedor_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [proveedorId, productoId]);

      return {
        success: true,
        message: 'Proveedor asignado correctamente'
      };
    } catch (error) {
      console.error('❌ Error asignando proveedor:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener estadísticas de sincronización
   */
  async getSyncStatistics() {
    try {
      const stats = await query(`
        SELECT
          COUNT(*) as total_productos,
          COUNT(CASE WHEN proveedor_id IS NOT NULL THEN 1 END) as con_proveedor,
          COUNT(CASE WHEN proveedor_id IS NULL THEN 1 END) as sin_proveedor
        FROM productos
      `);

      return {
        success: true,
        data: stats.rows[0]
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ProductService;
