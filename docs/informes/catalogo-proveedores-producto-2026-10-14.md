# Proveedores en la ficha del producto — 2026-10-14

Pedido: recuperar la pestaña **Proveedores** al editar un producto en Gestión
de Catálogo. Lista proveedores asociados, nombre/código del producto según cada
proveedor y último costo facturado por unidad propia, con IVA/descuento, moneda
y fecha. Cuando difiere la unidad, muestra también costo del proveedor y factor.
Sin factura con costo válido muestra «Sin costo registrado», sin inventar cero.

## Implementación

- `ModalProducto` reutiliza Pestanas. El formulario conserva cambios al alternar;
  productos nuevos no muestran proveedores. Sección independiente y gancho
  dedicado: consulta solo al abrir, conserva resultado, cancela pendientes al
  cerrar y ofrece reintento. No se escribe ni se cambia ninguna relación.
- `GET /maestro/productos/:id/proveedores`, solo con Gestión de Catálogo. No se
  expone por `/catalogos`, al cliente ni al catálogo público.
- `productos/proveedoresProducto.service.js` comparte la consulta con Gestionar
  Relaciones conservando su contrato. Dos consultas sin N+1 ni Prisma.
- Relaciones de supplier_product_mapping por producto propio. Proveedor por
  cédula y descripción/código de factura. Costo solo si línea RELACIONADA coincide
  en producto/cédula/código. Reasignar un código no presta el costo de otro producto.
- Fotografía de compra registrada cuando existe: preserva factor/importes aunque
  el mapeo cambie. Compra anulada o fotografía de otro producto no aporta costo.
  Factura relacionada todavía sin compra aporta su costo con factor vigente.
- Regalías no sustituyen al costo pagado anterior; se elimina el límite de cinco
  líneas que podía ocultarlo. IVA real de la línea, factor positivo fraccionario
  o entero; misma función canónica de costos. Monedas distintas se muestran como
  tales, sin inventar conversión ni comparar un importe USD con otro CRC.
- Servicio de productos-revisión baja de 831 a 700 líneas y sale de la deuda
  de estructura. Sin dependencias nuevas ni SQL de migración.

## Verificación local

Base desechable obtenida de la vista local aislada, nunca de una conexión a
producción para esta tarea. Pruebas con BEGIN/ROLLBACK y salidas bloqueadas.

- 12 pruebas PostgreSQL: id propio sin Alegra, vacío y errores 400/404, descripción
  sin costo, IVA 8/4/0/13 %, descuento, factor 6/0,5, más de cinco regalías,
  cambio de producto, ignoradas/pendientes, cédulas/códigos distintos, fotografía
  histórica, compra anulada y moneda USD.
- Formato monetario: moneda explícita, cero, importes desconocidos/no finitos y
  código inválido sin caída de interfaz.
- Chromium con rutas/autenticación/permisos y SQL reales en transacción: 401/403,
  sin ruta de costos compartida, carga diferida, error 503/reintento, caché al
  cambiar pestaña, texto editado conservado, tres proveedores con costo CRC/USD
  y desconocido, producto sin relaciones y alta sin pestaña. 390/700/1440 px,
  sin desbordamiento ni errores JavaScript; ninguna mutación desde la pestaña.
- Build Vite correcto. Conserva advertencia previa del tamaño del paquete.

La primera corrida completa detectó una prueba previa que crea fechas con
CURRENT_DATE UTC y compara días en Costa Rica tras medianoche UTC. Se verificó
que pasa fijando PGOPTIONS a America/Costa_Rica, igual que el pool de producción;
no se modifica la lógica de sugerencias ajena a esta función.


Corrida completa con zona de Costa Rica: **244 archivos, 2.935 casos;
2.529 aprobados, 406 omitidos, cero fallos**. Grafo/estructura después de
actualizar documentación: 23 aprobadas. En la copia local, 20 lecturas del
producto con más relaciones (68) usaron dos consultas cada una: mediana 3,65 ms,
máxima 29,14 ms; esta medición local no predice la latencia de producción.

Entrega en `developer` para revisión, con vista previa 5173/3000. Esta petición
no incorpora una publicación nueva a `main` ni una migración a producción.
