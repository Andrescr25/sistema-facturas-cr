# Catálogo PDF con fotos y enlace — 2026-10-05

Ampliación solicitada por el usuario, solo local en independencia-alegra.
Trabajo desde d4a4ca9 en copia y base propias; commits/worktrees revisados,
sin otro trabajo de Claude activo ni ediciones a developer/main. Primera,
segunda y tercera partes conservadas. No necesita migración nueva.

Clientes → Rutas → Ver recorrido de un ciclo en preventa → Preparar catálogo:

- Elegir catálogo completo o selección de habituales, sugerencias y ofertas.
  El completo incluye todos los visibles, sin límite de página ni filtro de
  stock; la selección vacía cae al completo, con aviso.
- Preparar, ver y descargar PDF personal con marca Tachi, fotos, nombres,
  códigos P-id, referencia, precios con IVA y cliente/ruta/semana por hoja.
  Avisar productos sin imagen disponible, sin omitirlos ni inventar fotos.
- Revisar teléfono/texto y enviar la misma copia junto al enlace, en un solo
  documento de WhatsApp con caption. Cambiar alcance obliga a preparar otra;
  cambiar precios no altera los bytes que se revisaron. Actualizar es explícito.
- El cliente puede pedir por WhatsApp sin cuenta. La invitación al portal
  queda opcional. El personal confirma/registra ese pedido con su ciclo en
  Facturación; no se importan automáticamente conversaciones como pedidos.

Almacenamiento privado, sesión/permiso Clientes, cliente/ciclo correctos y
hash comprobados antes de descargar/enviar. Miniaturas comprimidas sin
modificar originales; no publicar PDF en /archivos, registrar URLs firmadas,
leer otros archivos o acceder a Alegra para renovar fotos. Aislamiento sigue
bloqueando fotos remotas y mensajes reales. Sharp 0.35.5 ya estaba disponible;
se declaró la dependencia, sin instalar ni modificar node_modules/Prisma.
No hay limpieza automática de PDF/miniaturas: conservar el directorio privado
al cambiar almacenamiento. Archivo de órdenes recibidas 24 h sigue aparte.

Verificación:

- **1.991 pruebas aprobadas**, cero fallos/omitidas; grafo 12 y build aprobados.
  PostgreSQL propio, ROLLBACK y suite con concurrencia 1. Los 17 casos nuevos
  comprueban IVA por línea, selección propia, visibilidad, fallback, permisos
  de documento, integridad/inmutabilidad, ausencia de cuenta/alta automática,
  revocación/cierre, formatos de foto, original intacto y rutas seguras.
- Chromium 1440/390, después de la suite: preparar PDF completo, vista blob,
  descarga, archivo/productos visibles en revisión, envío con pdfId y bloqueo
  real 423 registrado, cliente sin cuenta/pedido nuevo, otra ficha 404, alcance
  cambiado, invitación opcional, cierre 409. Sin errores JS/desborde.
- Ejemplo con datos reales de la COPIA LOCAL: 60 productos y 60 fotos,
  208.516 bytes, nueve páginas. Guardado en Descargas a petición del usuario;
  nombres/datos/documentos fuera de Git. Ruta identificada «Vista previa del
  catálogo», creada solo en la base desechable, sin envío a ese cliente.
- Render completo: 1.859 productos, 1.827 fotos, 32 sin foto disponible,
  4.979 KB; debajo del límite 20 MB. No descarga fotos externas en aislamiento.
  PDFKit de macOS confirmó el ejemplo, textos, ₡ y paginación; revisión visual
  de fotos, columnas y cabeceras. El usuario pidió retirar el bloque
  «Para pedir por WhatsApp, respondé al mensaje…»: retirado y ejemplo
  actualizado; 17 pruebas PDF/fotos repetidas y texto final comprobado.
  Las indicaciones quedan en WhatsApp. No es un corte ni recepción real.
- Permanece el aviso previo del build sobre tamaño del paquete.

Checklist operativo: **34 listos / 61 pendientes**; PRE-11/12/13/14 cerrados.
Independencia conserva 133/14. Manuales del usuario, aceptación REAL de
Hacienda y corte siguen pendientes. Próximo: contexto/filtros de bodega,
preparación, faltantes y reportes; luego cobertura/compras inmutables,
factura/recepción, carga/entrega y archivo 24 h con historial.
La limpieza semanal todavía debe retirarse POR CÓDIGO. Arrancar solo con
lanzador seguro existente que la sustituye; nunca ejecutarla para probar.

Detalle técnico: [grafo](../grafo/modulo/preventa-por-enlace.md).
Evidencia/dump/guiones y documentos privados en
/private/tmp/codex-preventa-pdf-20261005; los lanzadores de pruebas dependerán
del worktree retirado y no deben reutilizarse. Aplicación habitual 5174→3002
se verificará solo GET después de integrar; huellas de negocio guardadas
antes para comprobar ausencia de escrituras.
