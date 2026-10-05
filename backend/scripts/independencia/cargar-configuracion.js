/**
 * Carga la configuración de Alegra en la base propia (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local: la guarda de
 * config/aislado.js impide que la base sea la de producción. Se puede correr
 * las veces que haga falta: actualiza por `alegra_id` en vez de duplicar.
 *
 * Uso:  node scripts/independencia/cargar-configuracion.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');
const {
  empresaDesdeAlegra, impuestoDesdeAlegra, plazoDesdeAlegra, cuentaDesdeAlegra
} = require('../../src/modules/configuracion/desdeAlegra');

const alegra = getClient();

async function leer(ruta) {
  const r = await alegra.get(ruta);
  if (r?.success === false) throw new Error(`Alegra ${ruta}: ${r.status} ${r.data?.message || r.error}`);
  return r?.data ?? r;
}

async function main() {
  const [company, taxes, terms, cuentas] = await Promise.all([
    leer('/company'), leer('/taxes'), leer('/terms'), leer('/bank-accounts')
  ]);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const e = empresaDesdeAlegra(company);
    const columnas = Object.keys(e);
    // AL REPETIR LA CARGA SOLO SE RELLENA LO QUE ESTÁ VACÍO.
    //
    // La primera vez la fila no existe y entra entera. Después, lo que una
    // persona ya corrigió no se pisa: Alegra devuelve la actividad económica
    // 523402 y la que la empresa imprime en sus facturas es la 4752.1
    // (confirmada con el negocio). Con `SET col = EXCLUDED.col`, volver a
    // correr este script revertía esa corrección sin decir nada.
    await cliente.query(
      `INSERT INTO empresa (id, ${columnas.join(', ')}) VALUES (1, ${columnas.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${columnas.map(c => `${c} = COALESCE(empresa.${c}, EXCLUDED.${c})`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP`,
      columnas.map(c => e[c])
    );

    let impuestos = 0;
    for (const t of taxes) {
      const i = impuestoDesdeAlegra(t);
      await cliente.query(
        `INSERT INTO impuesto (nombre, tarifa, tipo, activo, alegra_id) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (alegra_id) DO UPDATE SET nombre = EXCLUDED.nombre, tarifa = EXCLUDED.tarifa, tipo = EXCLUDED.tipo,
           activo = EXCLUDED.activo, actualizado_en = CURRENT_TIMESTAMP`,
        [i.nombre, i.tarifa, i.tipo, i.activo, i.alegra_id]
      );
      impuestos++;
    }

    let plazos = 0;
    for (const t of terms) {
      const p = plazoDesdeAlegra(t);
      await cliente.query(
        `INSERT INTO plazo_credito (nombre, dias, activo, alegra_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (alegra_id) DO UPDATE SET nombre = EXCLUDED.nombre, dias = EXCLUDED.dias, activo = EXCLUDED.activo`,
        [p.nombre, p.dias, p.activo, p.alegra_id]
      );
      plazos++;
    }

    let cuentasCargadas = 0;
    for (const b of cuentas) {
      const c = cuentaDesdeAlegra(b);
      await cliente.query(
        `INSERT INTO cuenta_dinero (nombre, tipo, numero, descripcion, saldo_inicial, activo, alegra_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (alegra_id) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, numero = EXCLUDED.numero,
           descripcion = EXCLUDED.descripcion, saldo_inicial = EXCLUDED.saldo_inicial, activo = EXCLUDED.activo`,
        [c.nombre, c.tipo, c.numero, c.descripcion, c.saldo_inicial, c.activo, c.alegra_id]
      );
      cuentasCargadas++;
    }

    await cliente.query('COMMIT');
    console.log(`✓ Configuración cargada: empresa "${e.nombre}", ${impuestos} impuestos, ${plazos} plazos, ${cuentasCargadas} cuentas.`);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargó la configuración:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
