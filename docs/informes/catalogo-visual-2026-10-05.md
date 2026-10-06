# Catálogo visual por categorías — 2026-10-05

Solicitud adicional implementada solo local en independencia-alegra, desde
c33e119. Copia y PostgreSQL propios; revisados commits/worktrees y ausencia
de otra reserva activa. No nueva migración ni instalación/Prisma.

En Clientes → Rutas → ciclo en preventa → Preparar catálogo:

- Categorías con su nombre visible y orden de Gestión. Subcategorías con
  orden manual y empate natural; Otros al final. Una clasificación inactiva
  o ajena no oculta el producto. No modificar taxonomía para publicar.
- Rebajas y liquidaciones vigentes mezcladas dentro de cada grupo. Etiquetas
  Oferta y Liquidación; pueden coexistir en una ficha. Precio anterior
  tachado y precio final con IVA. No aplicar una rebaja dos veces ni duplicar
  productos; selección incluye TODAS las promociones válidas, sin tope 40/100.
  La ruta pública conserva sus límites. Completo incluye todos los visibles,
  sin filtro de stock para los productos normales del intermediario.
- Dos tarjetas por fila, foto grande encima y datos debajo. Miniaturas JPEG
  480×360/calidad 72 y caché versionada, sin alterar originales. Nombres
  largos completos, cabecera junto a la primera fila y clasificación repetida
  al cambiar de página. Ausencias siguen indicando Sin imagen.
- Caption predeterminado: «Te enviamos nuestro CATÁLOGO DE PRODUCTOS en PDF…».
  Las instrucciones para responder siguen en WhatsApp; el bloque que el
  usuario pidió retirar del PDF permanece ausente.

Documento privado, hash/copia revisada inmutables, descarga con sesión y
permiso Clientes, cliente/ciclo correctos, cuenta opcional para WhatsApp y
sin alta automática de pedido: contratos anteriores conservados. Registrar
la respuesta manual con su ciclo en Facturación. No se comprobó recepción
REAL ni se enviaron mensajes. Transporte aislado 423 registrado como fallo.

Verificación:

- **1.999 pruebas aprobadas**, cero fallos/omitidas; concurrencia 1 sobre
  PostgreSQL propio. Ocho casos nuevos: taxonomía/orden canónico, combinación
  Oferta+Liquidación y precio único, históricos/stock cero, baja superada,
  regalías/100%, 107 promociones superando el límite público, subcategoría
  inactiva/ajena y renderer con nombres largos/paginación. Fixtures por
  inventario.service, SAVEPOINT/ROLLBACK; inventario_saldo es una vista.
- 37 pruebas focalizadas de PDF/fotos/ofertas aprobadas. Grafo 12 y build
  aprobados; permanece aviso previo sobre tamaño del paquete del frontend.
- Chromium 1440/390: caption explícito, PDF completo con fotos grandes,
  blob privado/descarga, revisión/copia exacta y bloqueo 423 registrado,
  cuenta ajena 404, cambio de alcance, invitación opcional, cierre 409.
  Sin errores JavaScript/desborde. Navegador ejecutado después de la suite.
- Ejemplo nuevo solicitado, guardado en Descargas: **58 productos reales,
  58 fotos y 15 ofertas**, 33 páginas, 606.198 bytes. Datos de COPIA LOCAL;
  ruta/ciclo de vista previa solo en la base desechable. El archivo anterior
  del usuario se conserva. Documentos/nombres reales fuera de Git.
- Origen local: cero liquidaciones activas después del reinicio autorizado
  del inventario. No reactivar descuentos/empaques históricos ni fabricar
  existencias. Etiqueta y precio verificados con fixtures privados; ambos
  rótulos presentes en PDF nativo de prueba, sin datos demo compartidos.
- Completo real: **1.859 productos, 1.827 fotos, 32 sin foto**, 533 páginas,
  16.773.686 bytes, dentro del límite 20 MB. La taxonomía y fotos grandes
  aumentan páginas/tamaño respecto al diseño anterior. PDFKit de macOS
  confirmó textos, ₡, códigos, referencia y ausencia del bloque retirado;
  revisión visual de tarjetas, fotos grandes, etiquetas y precios tachados.

Checklist operativo vigente: **38 listos / 61 pendientes (99 IDs)**;
PRE-15/16/17/18 cerrados. Independencia conserva 133/14. Siguiente: filtros y
contexto de ruta/ciclo en bodega, preparación, faltantes y reportes; después
cobertura/compras inmutables, factura/recepción, carga/entrega y archivo 24 h
con historial. Maps históricos aún requieren fuente LOCAL. Las revisiones
manuales/conteo físico son del usuario; Hacienda REAL/corte pendientes.
Limpieza semanal todavía pendiente retirar POR CÓDIGO: nunca ejecutarla.

Contrato: [grafo](../grafo/modulo/preventa-por-enlace.md). Evidencia privada,
dump local, guiones, huellas y documentos en
/private/tmp/codex-catalogo-visual-20261005. No reutilizar como lanzadores los
guiones que dependan del worktree retirado. Sin push/despliegue/mensajes
reales/IMAP/Hacienda REAL ni cambios de developer/main/DB de producción.
Conservar archivo fiscal permanente y bases de ensayo anteriores.
