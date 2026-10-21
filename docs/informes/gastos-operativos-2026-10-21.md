# Gastos operativos — 2026-10-21

## Qué se reutiliza

Proveedores, XML/buzón, compra sin producto de los servicios recurrentes,
almacenamiento privado, CxP, pagos/Caja General, bitácora y mensajes receptores.
La nueva tabla agrega clasificación y revisión a una sola factura/compra;
no agrega catálogo, stock ni caja. Vista lista → ficha; empleado/placa opcionales.
Comercial conserva su flujo, Mixto elige por factura. La preferencia futura
no transforma documentos pasados. Reclasificar categorías exige motivo;
una compra comercial registrada no se revierte desde este flujo.

## Investigación tributaria

- Renta exige vinculación y respaldo: combustible/viáticos no son deducibles
  por la sola categoría del proveedor. Se consulta el art. 8 y condiciones
  de la Ley 7092; el enlace disponible es histórico y no se usa para codificar
  topes o conceder deducciones automáticamente.
  [Texto de referencia de Ley 7092 en SCIJ](https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_texto_completo.aspx?nValor1=1&nValor2=10969&nValor3=11762).
- La guía oficial de Hacienda expone condiciones de vinculación/documentación
  y restricciones para alimentos/viajes. IVA y renta se revisan por separado,
  con justificación; no se concede crédito por recibir un XML.
  [Créditos fiscales, Hacienda](https://www.hacienda.go.cr/docs/CreditosFiscales.pdf).
- DGT distingue impuesto único de combustibles de IVA, y tarifa 11 sin derecho
  a crédito para los combustibles consultados. Se conserva el desglose y se
  limita el crédito al IVA identificado, sin extender la categoría a todos
  los consumos de una gasolinera. Es una respuesta a consulta, no otra ley.
  [Oficio MH-DGT-DISC-SAC-DA1-OF-0030-2026, copia del documento de DGT](https://siemprealdia.co/costa-rica/wp-content/uploads/sites/6/2026/02/Documento-MH-DGT-DISC-SAC-DA1-OF-0030-2026-codigos-de-tarifas-de-iva-costa-rica.pdf).
- El mensaje receptor tiene respuesta, condición de impuesto e importes
  separados; parcial/rechazo deben justificarse. Se reutiliza el generador
  fiscal existente y se envía sólo tras confirmación de la revisión guardada.
  [Anexos DGT 4.4, mensajes y nota 18](https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/S/2020-2029/2020-2024/2024/1936C/1701B7.HTML).

La validación local controla estructura e identidad; no afirma confianza
criptográfica ni aceptación del proveedor por Hacienda. El Reporte Contador
no infiere crédito desde los impuestos originales de gastos; los importes y
la decisión documentada están en su ficha. No se presentan declaraciones.
Recepción, clasificación, confirmación fiscal, deducibilidad, crédito y pago
son seis conceptos separados. Recibir no paga ni acepta automáticamente.

## Migración y verificación

SQL 061 aditiva: proveedores comerciales predeterminados, tratamiento/PDF
del buzón, metadatos del gasto, guardas e idempotencia de pagos. Sin regenerar
Prisma ni tocar producción. Aplicada en un clon desechable local.
**061 debe aplicarse antes de publicar el código a producción.**

- Suite completa: 235 archivos, 2939 pruebas; **2936 correctas, 0 fallos y 3
  omitidas**. Las tres son ensayos históricos que exigen inventario en cero;
  el clon operativo conserva stock. Se repitieron seis archivos: las pruebas
  fiscales necesitaban limpiar la configuración cifrada de la copia (sin
  leer ni reutilizar credenciales), y la prueba de teléfonos superó su plazo.
  Las 72 comprobaciones de esa repetición terminaron correctas.
- PostgreSQL: comercial, mixto y gastos; duplicados/concurrencia; completar
  XML; reclasificación auditada/versionada; stock y costos intactos; pago
  parcial e idempotencia; respuesta fiscal con XSD/firma reales y transporte
  simulado. No hubo envíos reales ni limpieza semanal.
- Navegador Chromium: **32 comprobaciones, sin errores JavaScript**; anchos
  390, 700 y 1440; lista/ficha, edición, revisión tributaria sin enviar,
  pago parcial, conversión desde Revisión, tratamiento en ficha proveedor y
  permisos HTTP. Inspección de capturas móvil/escritorio sin desbordamiento.
- Build frontend correcto. ESLint de los 23 archivos frontend nuevos o
  modificados: cero errores; dos avisos de dependencias de hooks que ya
  existían en Layout y ModalFichaProveedor. `git diff --check` correcto.

Vista local: `http://localhost:5173/gastos-operativos`, backend en 3000.
Usa otro clon limpio, `tachi_codex_gastos_preview_20261021`, sin registros
ZZ de las verificaciones. Configuración y archivos de esa vista viven fuera
de Git en `~/.local/share/sistema-facturas-cr/gastos-operativos-preview-20261021/`.
Buzón, WhatsApp, correo y trabajador fiscal apagados; red externa bloqueada.
La base desechable de pruebas se retira al cerrar. **No se publicó a main.**


## Publicación posterior autorizada

Tras revisar el funcionamiento, el usuario pide «ok subelo a main».
Codex aplica SQL061 a producción el 21/10 a las 17:20:18 CR con respaldo y
144 tablas conservadas. Publicación de c321c09 y 87a8d35, ambos de Codex,
más el registro de despliegue. [Evidencia](despliegue-gastos-contador-2026-10-21.md).
