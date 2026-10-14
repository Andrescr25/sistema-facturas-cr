---
id: modulo/reporte-proveedores
tipo: modulo
titulo: Reporte de Proveedores — faltantes y fichas, órdenes independientes
estado: vigente
archivos:
  - docs/informes/proveedores-simplificados-2026-10-13.md
  - backend/migrations/independencia/058_ordenes_proveedor_sin_ciclos.sql
  - backend/src/modules/orders-whatsapp/ordenesProveedor.service.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.controller.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.routes.js
  - backend/tests/proveedoresSimple.test.js
  - frontend/src/hooks/useEdicionFaltantesProveedor.js
  - frontend/src/hooks/useOrdenesProveedor.js
  - frontend/src/hooks/useEnvioOrdenProveedor.js
  - frontend/src/components/reporte-proveedores/ModalOrdenesProveedor.jsx
  - frontend/src/components/reporte-proveedores/EnvioOrdenProveedor.jsx
  - frontend/src/components/reporte-proveedores/ProcedenciaFaltante.jsx
  - docs/informes/ordenes-automaticas-proveedores-2026-10-13.md
  - frontend/src/pages/ReporteProveedores.jsx
  - frontend/src/components/ui/NavegacionSecciones.jsx
  - frontend/src/components/ui/PanelSeccion.jsx
  - frontend/src/components/ui/Boton.jsx
  - frontend/src/components/ui/Insignia.jsx
  - frontend/src/components/pagos/TarjetasResumen.jsx
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/components/reporte-proveedores/ListaFichasProveedor.jsx
  - frontend/src/hooks/useReporteProveedores.js
  - docs/informes/proveedores-redisenados-2026-10-07.md
aristas:
  depende_de: [modulo/faltantes, modulo/ordenes-compra-por-ciclo, modulo/permisos]
  relacionado: [modulo/rutas-clientes, modulo/facturas-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/cierre-ordenes-compra, modulo/archivo-ordenes-compra, decision/orden-enviada-y-archivo-por-recepcion, decision/rotacion-por-cliente-sin-ciclos]
medido: 2026-10-13
---

## Entrada vigente — simplificación del 2026-10-13

El usuario pide únicamente **Faltantes** (por defecto, igual a main) y
**Proveedores** (ficha, información y contacto). Se retiran Compras, Necesidades,
Órdenes como área separada, semanas/Sin ciclo, ruta y los paneles de factura,
recepción y cierre. Se borran los componentes/hooks que quedaron sin uso.
Sus APIs y registros históricos siguen conservados; retirarlos de esta pantalla
no equivale a borrar documentos, recepciones ni inventario.

Faltantes mantiene la consulta global de main, tarjetas → proveedor, búsqueda,
fecha, cantidades, notas, edición, asignación, agregados manuales, Excel y descarga.
Procedencia muestra cliente/factura/cantidad, sin agrupar por semanas.
La descarga de faltantes conserva el reporte; **Revisar y enviar orden** abre
las órdenes persistidas del proveedor. La revisión comercial de cada orden
muestra cantidades propias/proveedor y usa su PDF guardado, no el PDF global.
La tarjeta distingue una orden nueva pendiente aunque haya otra ya enviada.

## Una orden abierta por proveedor

Bodega y asignación preparan automáticamente dentro de su transacción: buscar
borrador/pendiente sin intento de envío del proveedor, sin comparar ciclos.
Los borradores históricos existentes también acumulan: no se reclasifican sus
snapshots. Una orden nueva tiene ciclo/ruta/semana NULL. La SQL 058 quita solo
la igualdad de ciclo al validar procedencia; mantiene identidad y límites de
cantidades/cobertura, con protección de las órdenes enviadas.

Enviada, parcial, recibida, cancelada/cerrada o intento incierto nunca recibe
nuevos productos ni cantidades. A10/B5 enviado → C8/A3 nuevo conserva la
primera orden y crea otra con C8/A3. La cobertura evita pedir dos veces el
mismo faltante. Un aumento en pendiente cambia revisión e invalida la copia
preparada anterior, sin borrar sus bytes; exige revisar nuevamente antes de enviar.

El modal muestra referencia, creación y estado de todas las órdenes del proveedor,
incluidas antiguas archivadas. Revisa cantidades antes de enviar y conserva el
control de número/mensaje/PDF; no ofrece recepciones, adjuntos ni cierres de enviadas.
GET /orden-compra/proveedor/ordenes es READ ONLY/REPEATABLE READ; estados es
solo SELECT. Preparar faltantes pendientes es POST explícito para faltantes
anteriores/liberados. Abrir o refrescar nunca prepara una orden ni manda mensajes.
Las direcciones /por-ciclo continúan como contrato interno de documentos; su
nombre no aparece en la pantalla, PDF nuevo ni mensaje propuesto.

Estructura: página arma las dos áreas; hooks llevan estado/API; componentes
presentan; reglas puras existentes en utils. useReporteProveedores vuelve al
tope de 500 líneas separando la edición manual; disminuye la deuda de estructura.
Diseño conserva Boton, Insignia y Modal con la paleta por rol.

[Verificación y límites](../../informes/proveedores-simplificados-2026-10-13.md):
copia local con ROLLBACK, comparación contra el reporte de main y transporte
simulado. SQL 058 aplicada localmente; producción pendiente antes de subir main,
igual que 057 de Carga/entregas. Las partes ROT-06/07 y el resto de ROT-08 siguen
pendientes; esta entrega solo simplifica proveedores.
