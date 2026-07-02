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

  /**
   * Obtener productos locales con paginación y filtros
   */
  async getProductsLocal(filters = {}) {
    try {
      const { proveedor_id, search, page = 1, limit = 50 } = filters;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      let sql = `
        SELECT p.id, p.nombre, p.codigo, p.descripcion, p.precio_unitario, p.created_at,
               pr.nombre as proveedor_nombre
        FROM productos p
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      `;
      
      let countSql = 'SELECT COUNT(*) FROM productos p';
      
      const params = [];
      const countParams = [];
      const conditions = [];
      
      if (proveedor_id) {
        conditions.push('p.proveedor_id = $' + (params.length + 1));
        params.push(proveedor_id);
        countParams.push(proveedor_id);
      }
      
      if (search) {
        conditions.push('(p.nombre ILIKE $' + (params.length + 1) + ' OR p.codigo ILIKE $' + (params.length + 1) + ')');
        params.push(`%${search}%`);
        countParams.push(`%${search}%`);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
        countSql += ' WHERE ' + conditions.join(' AND ');
      }
      
      sql += ' ORDER BY p.nombre';
      sql += ' LIMIT $' + (params.length + 1);
      sql += ' OFFSET $' + (params.length + 2);
      
      params.push(parseInt(limit));
      params.push(offset);
      
      const result = await query(sql, params);
      const countResult = await query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count);
      
      return {
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo productos locales:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener un producto local específico por ID
   */
  async getProductLocal(id) {
    try {
      const result = await query(`
        SELECT p.*, pr.nombre as proveedor_nombre, pr.contacto as proveedor_contacto
        FROM productos p
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE p.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Producto no encontrado'
        };
      }
      
      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('❌ Error obteniendo producto local:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Crear nuevo producto local
   */
  async createProductLocal(productData) {
    try {
      const { nombre, codigo, descripcion, proveedor_id, precio_unitario } = productData;
      
      // Verificar que el proveedor existe
      const proveedorCheck = await query('SELECT id FROM proveedores WHERE id = $1', [proveedor_id]);
      if (proveedorCheck.rows.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Proveedor no encontrado'
        };
      }
      
      const result = await query(`
        INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [nombre, codigo, descripcion, proveedor_id, precio_unitario]);
      
      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('❌ Error creando producto local:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Buscar productos locales por término
   */
  async searchProductsLocal(termino) {
    try {
      const result = await query(`
        SELECT p.*, pr.nombre as proveedor_nombre
        FROM productos p
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE p.nombre ILIKE $1 
           OR p.codigo ILIKE $1
           OR p.descripcion ILIKE $1
        ORDER BY p.nombre
        LIMIT 50
      `, [`%${termino}%`]);
      
      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error buscando productos locales:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener productos locales por proveedor
   */
  async getProductsBySupplierLocal(proveedor_id) {
    try {
      const result = await query(`
        SELECT p.*, pr.nombre as proveedor_nombre
        FROM productos p
        JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE p.proveedor_id = $1
        ORDER BY p.nombre
      `, [proveedor_id]);
      
      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error obteniendo productos por proveedor:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ProductService;
