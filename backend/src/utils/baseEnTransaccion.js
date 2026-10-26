/**
 * Adapta los BEGIN/COMMIT de servicios existentes a SAVEPOINT en una conexión
 * ya abierta. Permite componerlos sin que uno confirme el trabajo de otro.
 * No abre conexiones ni decide el entorno: eso le corresponde al llamador.
 */
function baseEnTransaccion(conexion, prefijo = 'sp') {
  let nivel = 0;
  const ejecutar = (sql, params) => conexion.query(sql, params);
  return {
    query: ejecutar,
    pool: {
      query: ejecutar,
      connect: async () => ({
        query: async (sql, params) => {
          if (sql === 'BEGIN') return conexion.query(`SAVEPOINT ${prefijo}_${++nivel}`);
          if (sql === 'COMMIT') return conexion.query(`RELEASE SAVEPOINT ${prefijo}_${nivel--}`);
          if (sql === 'ROLLBACK') return conexion.query(`ROLLBACK TO SAVEPOINT ${prefijo}_${nivel--}`);
          return ejecutar(sql, params);
        },
        release() {}
      })
    }
  };
}

module.exports = { baseEnTransaccion };
