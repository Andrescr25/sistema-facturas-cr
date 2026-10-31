# Cobros: fecha en Safari y productos de la factura — 2026-10-30

El usuario reporta que Fecha del pago se sale de la tarjeta en Safari del
iPhone, y que al abrir los productos de la factura se ven vacíos o en cero.

## Causas y cambio

El servicio entregaba nombre/referencia/precio y la tabla compartida leía
descripcion/codigo/precioUnitario, sin un ID de línea. El total se volvía a
calcular sin IVA. Ahora el adaptador puro entrega la forma de la tabla y
conserva el total del documento, incluidos IVA, descuentos y redondeos.

La petición anterior era a Facturación, que puede rechazar a quien solo
tiene Cobros o no creó la factura. Una lectura específica bajo Cobros usa
la misma selección y DTO de líneas de Facturación, sin ampliar su acceso.
Solo una consulta; no busca precio/costo actual ni otros datos de la factura.

Un fallo al consultar ya no se convierte en una lista vacía: se muestra y
permite reintentar. El estado de esas consultas queda en un hook que descarta
respuestas tardías. Los métodos reutilizan el hook existente de pagos; el
componente deja de importar servicios.

La regla móvil de los campos de fecha conserva `type=date` y limita la caja
mediante appearance:none y display:block. El estilo previo ya tenía
border-box y min/max-width; se evita que la apariencia nativa de iOS imponga
otro ancho. Se conserva el día elegido, el alto táctil y el selector nativo.

## Verificación

Seis regresiones: DTO de la tabla con total histórico de IVA/redondeo,
producto repetido y regalía cero, HTTP con solo Cobros y factura ajena,
401/403 sin permiso, documento sin relación actual de producto, factura
vacía/inexistente e ID inválido. PostgreSQL local con BEGIN/ROLLBACK.
179 pruebas dirigidas correctas de consulta, permisos, cobros y pagos.
Build correcto. ESLint del cambio correcto; el global conserva los mismos
9 errores y 25 avisos de HEAD, comprobados en una extracción limpia.

87 comprobaciones de navegador correctas: WebKit a 320/390/430/820 px y
Chromium a 390/1280 px. Campo lleno/vacío, día elegido y ausencia de desborde;
productos con descuento e IVA, total guardado, regalía cero, producto repetido,
error/reintento y factura sin líneas. El cobro simulado conserva fecha, método
y saldarTotal. También fecha al cobrar varias; en escritorio todas las
columnas se ven sin desplazamiento lateral. Sin errores JS. El modal de
escritorio usa el ancho compartido 2xl para que la tabla sea legible.
23 pruebas de grafo/estructura correctas; evidencia y capturas privadas en
`~/.local/share/sistema-facturas-cr/codex-cobros-safari-20261030/`.

El WebKit de
Playwright prueba el motor con vista móvil; no equivale a operar el selector
de UIKit de un iPhone físico. No se desarrolla ni prueba contra producción,
ni se registran cobros reales o se envían mensajes.
