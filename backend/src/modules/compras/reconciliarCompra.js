/**
 * Recalcula si una compra cuadra, ahora que su XML puede estar recuperado.
 *
 * "CUADRA" es: total ≈ suma de líneas + otros cargos − descuentos − IVA
 * devuelto, con ₡1 de margen — el mismo redondeo ya documentado para las
 * facturas de venta (Alegra redondea a colones enteros, las líneas guardan
 * céntimos).
 *
 * De las 862 originales, 18 no cuadraban por ₡65 a ₡16.941,92, algunas
 * NEGATIVAS. `otros_cargos`/`total_descuentos`/`total_iva_devuelto` son
 * justamente lo que faltaba para explicar esas 18 — ver migración 022.
 *
 * SI TODAVÍA NO CUADRA CON ESTO, SE DICE Y SE ANOTA. No se inventa un motivo:
 * si el correo original ya no está en el buzón, esa factura no se puede
 * reconstruir del todo, y decirlo en `compra.observaciones` es mejor que un
 * descuadre mudo.
 */

function calcularEsperado({ sumaLineas, otrosCargos = 0, descuentos = 0, ivaDevuelto = 0 }) {
  return Number(sumaLineas) + Number(otrosCargos) - Number(descuentos) - Number(ivaDevuelto);
}

function diferenciaDe({ total, sumaLineas, otrosCargos, descuentos, ivaDevuelto }) {
  const esperado = calcularEsperado({ sumaLineas, otrosCargos, descuentos, ivaDevuelto });
  return Math.round((Number(total) - esperado) * 100) / 100;
}

function cuadra(diferencia) {
  return Math.abs(diferencia) <= 1;
}

/**
 * Re-parsea el XML de UNA compra y devuelve sus totales recalculados.
 * No escribe nada: eso lo hace `reconciliarCompras`, que sabe cómo guardar.
 */
async function reconciliarUna(fila, { leerArchivo, xmlParser }) {
  if (!fila.xml_ruta) return { id: fila.id, estado: 'sin_xml' };

  const buffer = await leerArchivo(fila.xml_ruta);
  if (!buffer) return { id: fila.id, estado: 'archivo_no_encontrado' };

  let facturaData;
  try {
    facturaData = await xmlParser.parseFacturaXML(buffer);
  } catch (error) {
    return { id: fila.id, estado: 'xml_invalido', motivo: error.message };
  }

  const totales = facturaData.resumen?.totales || {};
  const diferencia = diferenciaDe({
    total: fila.total,
    sumaLineas: fila.suma_lineas,
    otrosCargos: totales.otrosCargos,
    descuentos: totales.descuentos,
    ivaDevuelto: totales.ivaDevuelto
  });

  return {
    id: fila.id,
    estado: cuadra(diferencia) ? 'cuadra' : 'no_cuadra',
    diferencia,
    totalOtrosCargos: totales.otrosCargos || 0,
    totalDescuentos: totales.descuentos || 0,
    totalIvaDevuelto: totales.ivaDevuelto || 0,
    otrosCargos: facturaData.otrosCargos || []
  };
}

/**
 * Recorre las compras con XML ya recuperado y actualiza sus totales. Se
 * puede correr las veces que haga falta: solo toca lo que tiene `xml_ruta`,
 * y una compra que ya cuadraba se puede volver a comprobar sin costo.
 */
async function reconciliarCompras({ pool, almacenamiento, xmlParser, avisar = () => {} }) {
  const { rows } = await pool.query(`
    SELECT c.id, c.total, c.xml_ruta,
           COALESCE((SELECT SUM(total_linea) FROM compra_linea WHERE compra_id = c.id), 0) AS suma_lineas
      FROM compra c
     WHERE c.xml_ruta IS NOT NULL
     ORDER BY c.fecha_emision ASC
  `);

  const conteo = { total: rows.length, cuadra: 0, no_cuadra: 0, sin_xml: 0, archivo_no_encontrado: 0, xml_invalido: 0 };
  const noCuadran = [];
  let hechas = 0;

  for (const fila of rows) {
    const r = await reconciliarUna(fila, { leerArchivo: almacenamiento.leerArchivoPrivado, xmlParser });
    conteo[r.estado] = (conteo[r.estado] || 0) + 1;

    if (r.estado === 'cuadra' || r.estado === 'no_cuadra') {
      const observacion = r.estado === 'no_cuadra'
        ? `Reconciliado con el XML: diferencia de ₡${r.diferencia.toFixed(2)} entre el total y ` +
          `líneas + otros cargos − descuentos − IVA devuelto. No se pudo explicar del todo.`
        : null;

      await pool.query(
        `UPDATE compra
            SET total_otros_cargos = $1, total_descuentos = $2, total_iva_devuelto = $3,
                otros_cargos = $4::jsonb,
                observaciones = CASE WHEN $5::text IS NULL THEN observaciones ELSE $5::text END
          WHERE id = $6`,
        [r.totalOtrosCargos, r.totalDescuentos, r.totalIvaDevuelto, JSON.stringify(r.otrosCargos), observacion, r.id]
      );

      if (r.estado === 'no_cuadra') noCuadran.push({ id: r.id, diferencia: r.diferencia });
    }

    if (++hechas % 100 === 0) avisar(`  ${hechas}/${rows.length}…`);
  }

  return { ...conteo, noCuadran };
}

/**
 * Copia `xml_ruta` del buzón a la compra que nació de esa factura.
 *
 * `compra.xml_ruta` existe desde la migración 021, pero las 860 compras
 * históricas (migración 020) nacieron ANTES de que el XML se empezara a
 * guardar, así que la tienen en NULL. Cuando el recuperador
 * (`recuperar-xml-del-buzon.js`) le pone `xml_ruta` a una factura del buzón,
 * este paso es lo que la hace visible desde `compra` — que es lo que
 * consultan Reportes y Cuentas por Pagar, no el buzón directamente.
 *
 * Solo copia lo que falta (`c.xml_ruta IS NULL`): se puede correr después de
 * cada recuperación sin volver a tocar lo que ya se copió.
 */
async function copiarXmlDeBuzonACompra(pool) {
  const { rowCount } = await pool.query(`
    UPDATE compra c
       SET xml_ruta = f.xml_ruta
      FROM facturas_proveedores f
     WHERE c.factura_proveedor_id = f.id
       AND c.xml_ruta IS NULL
       AND f.xml_ruta IS NOT NULL
  `);
  return rowCount;
}

module.exports = {
  calcularEsperado, diferenciaDe, cuadra, reconciliarUna, reconciliarCompras, copiarXmlDeBuzonACompra
};
