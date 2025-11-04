/**
 * Helper para operaciones de base de datos
 * Centraliza queries comunes y manejo de conexiones
 */

const { query } = require('../../config/database');

class DatabaseHelper {
  /**
   * Ejecutar query con manejo de errores
   */
  static async executeQuery(sql, params = []) {
    try {
      const result = await query(sql, params);
      return { success: true, data: result };
    } catch (error) {
      console.error('❌ Database Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener un registro por ID
   */
  static async getById(table, id, idColumn = 'id') {
    const sql = `SELECT * FROM ${table} WHERE ${idColumn} = $1`;
    const result = await this.executeQuery(sql, [id]);

    if (result.success && result.data.rows.length > 0) {
      return { success: true, data: result.data.rows[0] };
    }

    return { success: false, error: 'Registro no encontrado' };
  }

  /**
   * Insertar registro
   */
  static async insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const sql = `
      INSERT INTO ${table} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    return await this.executeQuery(sql, values);
  }

  /**
   * Actualizar registro
   */
  static async update(table, id, data, idColumn = 'id') {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const sql = `
      UPDATE ${table}
      SET ${setClause}
      WHERE ${idColumn} = $${keys.length + 1}
      RETURNING *
    `;

    return await this.executeQuery(sql, [...values, id]);
  }

  /**
   * Eliminar registro
   */
  static async delete(table, id, idColumn = 'id') {
    const sql = `DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING *`;
    return await this.executeQuery(sql, [id]);
  }

  /**
   * Obtener todos los registros con filtros opcionales
   */
  static async getAll(table, filters = {}, limit = null, offset = 0) {
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    let paramIndex = 1;

    // Agregar filtros WHERE
    if (Object.keys(filters).length > 0) {
      const whereClause = Object.keys(filters)
        .map(key => {
          params.push(filters[key]);
          return `${key} = $${paramIndex++}`;
        })
        .join(' AND ');

      sql += ` WHERE ${whereClause}`;
    }

    // Agregar paginación
    if (limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(limit);

      if (offset > 0) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(offset);
      }
    }

    return await this.executeQuery(sql, params);
  }

  /**
   * Contar registros
   */
  static async count(table, filters = {}) {
    let sql = `SELECT COUNT(*) as total FROM ${table}`;
    const params = [];
    let paramIndex = 1;

    if (Object.keys(filters).length > 0) {
      const whereClause = Object.keys(filters)
        .map(key => {
          params.push(filters[key]);
          return `${key} = $${paramIndex++}`;
        })
        .join(' AND ');

      sql += ` WHERE ${whereClause}`;
    }

    const result = await this.executeQuery(sql, params);

    if (result.success) {
      return { success: true, count: parseInt(result.data.rows[0].total) };
    }

    return result;
  }
}

module.exports = DatabaseHelper;
