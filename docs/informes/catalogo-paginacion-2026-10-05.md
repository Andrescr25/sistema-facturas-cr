# Catálogo con cuatro productos por página — 2026-10-05

Corrección solicitada después de revisar el ejemplo visual. Base de trabajo
`b9c3389`, en copia y PostgreSQL propios; sin otra reserva concurrente.
Solo independencia-alegra local, sin migraciones, instalación ni Prisma.

El PDF completa las páginas con dos columnas y dos filas. Un cambio de
categoría/subcategoría no empieza otra fila ni otra hoja; cada ficha muestra
ambos títulos para identificar correctamente el producto. Se conserva la
secuencia canónica completa. Solo la última página puede quedar parcial.
Fotos arriba, datos debajo, Oferta/Liquidación y precio anterior conservados.
Los textos se miden con las fuentes reales; se adapta el espacio de la ficha
cuando son extensos, sin recortar nombres ni añadir hojas automáticas.

Verificación:

- **29 pruebas focalizadas aprobadas**, cero fallos/omitidas: PDF, fotos y
  cuatro casos nuevos con PDFKit real. Comprueban grupos impares, cuatro
  clasificaciones distintas, nombres/títulos largos completos, continuación,
  secciones vacías, páginas físicas, posiciones y ausencia de solapamientos.
  Las pruebas de negocio usan transacción/ROLLBACK en base desechable; el
  transporte es un doble, sin envío real. Se conservan las pruebas previas de
  selección, taxonomía, precio/IVA, permisos y copia privada/hash inmutable.
- PDF nativo real: **58 productos, 58 fotos y 15 ofertas en 15 páginas**,
  antes 33. Catorce páginas de cuatro y la última de dos; 587.160 bytes.
  La cinta P-556 del caso informado comparte página 3 con otros tres productos.
  Ejemplo nuevo: `/Users/joseandres/Downloads/catalogo-Tachi-LICORERA-RENE-compacto.pdf`.
  Se conserva el archivo visual anterior. Los documentos reales quedan fuera
  de Git; vista previa/ruta/ciclo únicamente en la base propia.
- Catálogo completo real: **1.859 productos, 1.827 fotos y 32 sin foto**,
  465 páginas (464×4 + 3), 16.786.947 bytes, dentro del límite 20 MB.
  PDFKit nativo verifica número y conjunto exacto de productos por página,
  sin omisiones/duplicados; el orden de dibujo/posiciones se verifica también
  con PDFKit real. La extracción textual de dos columnas puede reordenarlas.
  Cabecera/cliente/semana repetidos y bloque de instrucciones retirado ausente;
  inspección visual de fotos, ofertas y clasificaciones mixtas.
- Grafo: **12 pruebas aprobadas**. No se repitió la suite completa de 2.032
  de la etapa anterior ni el build del frontend: esta corrección modifica
  únicamente el renderer PDF y añade su verificación focalizada.

Una copia ya preparada conserva bytes/hash: preparar una NUEVA para obtener
el diseño corregido. No modificar archivos revisados ni sus adjuntos.
Sin cambios a selección, precios, promociones, imágenes originales o mensaje.
No hay liquidaciones activas locales; no reactivar históricos ni fabricar stock.

Checklist operativo **48 listos / 51 pendientes (99 IDs)**; refina PRE-17,
sin marcar otra función comercial. El siguiente paso sigue siendo envío propio
de órdenes por ciclo con PDF revisado/inmutable, resultado confirmado/incierto,
cobertura de solicitado/pendiente de recibir y recepción física sin repetir
stock. Después carga/entrega y retiro de activas a las 24 h con historial.
El retiro de la limpieza semanal POR CÓDIGO sigue abierto; nunca ejecutarla.

Leer el [nodo de preventa](../grafo/modulo/preventa-por-enlace.md) y el
[relevo de compras](ordenes-ciclo-2026-10-05.md) para continuar.
Evidencia privada y copia local en `/private/tmp/codex-catalogo-paginacion-20261005`.
Conservar los archivos fiscales y las bases de ensayo anteriores.

Integración local: **f4cf8bf**, avance sin fusión desde b9c3389; sin push.
Aplicación habitual 5174→3002 reiniciada con el lanzador seguro permanente
`/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs`,
PID **82437** al verificar. Solo GET: salud/frontend 200 y PDF sin sesión 401.
**22 huellas de negocio idénticas** al inicio y después de integrar/reiniciar;
se preservan la ruta y ciclo cancelado existentes y el inventario provisional.
Backend original 3000/PID 5370, developer 5013270 y main e19c3e5 conservados.
No conexión a producción, cambios de negocio compartido, mensajes reales,
IMAP, Hacienda REAL ni limpieza semanal. Base/rama/worktree de ESTA prueba
se retiran al cerrar; evidencia privada y ambos ejemplos en Descargas quedan.
