# Reporte mensual del contador — 2026-10-21

El usuario confirma que los gastos deben llegar al contador al cierre del mes
y pide adaptar el módulo al sistema propio. Se retira el flujo de archivos
importados de Alegra. Consulta documentos actuales y abre el último mes
completo de Costa Rica, con Mes actual para revisar el avance. La entrega
sigue siendo explícita: elegir contador y enviar.

## Reutilización y alcance

- Contactos y correo existentes; Excel tipado común y almacenamiento privado.
- Ventas/notas emitidas, compras vigentes incluidas exentas, notas de proveedor
  vigentes y gastos por emisión. Cinco consultas en una foto de lectura.
- Gastos aparte, nunca dos veces en compras. Pendientes visibles sin importes
  fiscales aprobados; anulados identificados y fuera de totales.
- Saldo/pago/métodos reales; monedas separadas y total del comprobante sin
  redondear al colón ni reconstruirlo de líneas. No cambia Caja ni inventario.
- Excel mensual conjunto y ZIP de originales de gastos con lista de faltantes.
  Límites de tamaño explícitos. Huella exige actualizar si cambió el mes antes
  de enviarlo. No se presentan declaraciones ni se envía correo automáticamente.
- Períodos preparados conservan correcciones/exclusiones y descarga; se retiran
  las escrituras que los reemplazaban. Servicio de 964 líneas dividido y
  excepción de tamaño eliminada. Pantalla lista → detalle, paginada en móvil.

Sin SQL adicional: depende de 061, sólo aplicada localmente. No se accede a
producción para desarrollar/probar ni se publica a main con SQL pendiente.

## Verificación

- Suite completa de 235 archivos: **2915 correctas, 0 fallos pendientes y 3
  omitidas** de 2918. Las omisiones son ensayos históricos que exigen stock
  cero; el clon conserva inventario operativo. Se repitió un archivo de
  confirmación de proveedores que falló en el clon: sus 12 pruebas pasaron
  al repetir sin cambiar ese código.
- Nueve pruebas del reporte con PostgreSQL/ROLLBACK y correo simulado: mes
  completo incluyendo último segundo, compras exentas, notas de proveedor,
  pendientes, anulados, moneda, pago parcial real, historial conservado,
  Excel/ZIP y huella que rechaza envío obsoleto. Tras el último ajuste,
  15 pruebas dirigidas del reporte y las reglas de Gastos volvieron a pasar.
- Chromium: 21 comprobaciones correctas, cero errores JavaScript, anchos
  390/700/1440, búsqueda, ficha, descarga de Excel/ZIP, alta de contacto y
  correo simulado, permisos y rutas privadas fuera de JSON. Capturas móvil
  y escritorio inspeccionadas, sin desbordamiento horizontal.
- Vista real 5173/3000 contra el clon limpio: tres anchos correctos, consulta
  de septiembre con 101 documentos en 126 ms en este equipo. No es una
  medición de producción. Dos reportes históricos descargados correctamente.
- Build y ESLint de todos los archivos frontend modificados correctos.
  Estructura/grafo: 23 pruebas correctas. `git diff --check` correcto.

Vista local: `http://localhost:5173/reporte-contador`, clon limpio
`tachi_codex_gastos_preview_20261021`, con SQL061. Arrancadores/configuración
fuera de Git en `~/.local/share/sistema-facturas-cr/gastos-operativos-preview-20261021/`.
La base desechable de pruebas `tachi_codex_contador_20261021` se retira al cerrar.
Sin correos reales, limpieza semanal, Prisma regenerado ni conexiones de prueba
a producción. Entrega sólo en developer; main sigue esperando SQL061.


## Publicación posterior autorizada

Tras revisar el funcionamiento, el usuario pide «ok subelo a main».
Codex aplica SQL061 a producción el 21/10 a las 17:20:18 CR con respaldo y
144 tablas conservadas. Publicación de c321c09 y 87a8d35, ambos de Codex,
más el registro de despliegue. [Evidencia](despliegue-gastos-contador-2026-10-21.md).
