---
id: modulo/recepcion-ordenes-compra
tipo: modulo
titulo: Recepción física por ciclo — parcial/final, motivos, auditoría y kardex idempotente
estado: vigente
archivos:
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
  - backend/src/modules/orders-whatsapp/ordenesCicloRecepcion.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/src/modules/compras/compras.service.js
  - backend/src/modules/inventario/inventario.service.js
  - frontend/src/components/reporte-proveedores/RecepcionOrdenCiclo.jsx
  - frontend/src/components/reporte-proveedores/OrdenesCompraCiclo.jsx
  - backend/tests/ordenesCompraRecepcion.test.js
aristas:
  depende_de: [modulo/facturas-ordenes-compra, modulo/ordenes-compra-por-ciclo, tabla/compra, tabla/compra-linea, tabla/movimiento-inventario]
  relacionado: [modulo/necesidades-por-ciclo, modulo/archivo-ordenes-compra, modulo/compras, modulo/inventario, modulo/permisos, decision/orden-enviada-y-archivo-por-recepcion, decision/ciclo-de-ruta-como-contexto]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-06
---

ALCANCE. Reporte Proveedores → Órdenes por ciclo → enviada/parcialmente recibida
→ Recepción física. GET/POST /api/orden-compra/por-ciclo/:id/recepciones heredan
su permiso; sin sesión 401, otro módulo 403. Cuenta de Proveedores no necesita
Clientes. No enviar mensajes ni registrar una compra al confirmar recepción.

ACEPTACIÓN PREVIA. Vincular factura/PDF y después revisar/registrar compra por
el flujo comercial existente. Comparar producto/cantidad propia/factor y número
de línea del snapshot contra compra aceptada. Pasar buzón a compra sin cambios
materiales no impide recibir; cambios de cantidad/producto/factor exigen revisar
el vínculo. Compra anulada, conversión desconocida o revisión incompleta bloquean.
Sin factura/compra puede finalizar con cero entregado y motivos explícitos;
mercadería positiva requiere compra revisada, incluida cantidad facturada extra.
Facturado se rotula «en compras»; facturas sin aceptar se muestran pendientes.

CANTIDAD FÍSICA. Por línea de compra, registrar SOLO lo nuevo de esta entrega,
en unidades propias con cuatro decimales. Mostrar unidad del proveedor/factor,
recibido anterior y pendiente de la línea. No superar cantidad propia facturada.
Acepta varias facturas, partidas, regalías y productos extra revisados. Parcial
necesita cantidad positiva, mantiene pendiente y admite otro evento. Final puede
registrar cero adicional, fija estado recibida/fecha TIMESTAMPTZ del servidor y
requiere motivo para todo solicitado o facturado sin recibir. «Recibida» significa
entrega final, no que se completó cada producto. No recibido y extra conservados.
No adivinar agotamiento: selección «Agotado confirmado por proveedor» y detalle
explícitos. Otros: pendiente del proveedor, rechazado, otro. Revisión física
obligatoria; cambios en formulario la invalidan. Observaciones y actor guardados.

DURABILIDAD. 049 añade eventos/líneas inmutables, una final por orden, UUID y
solicitud/resumen con snapshots. Versión/firma de contexto + advisory 46005/1
común con vínculo/registro comercial y bloqueo de orden. Mismo UUID+cuerpo retorna
sin cambios incluso tras finalizar; distinta clave con revisión vieja rechaza 409.
Evento, cantidades, estado, bitácora y kardex en UNA transacción. Fecha de final
se copia dentro de SQL para conservar microsegundos. SQL impide alterar evento,
línea comercial recibida o retirar su vínculo; PDF permanece consultable. No
reabrir ni corregir recepciones físicas en esta entrega: futuro ajuste explícito
con auditoría, jamás borrar ni editar historia.

INVENTARIO UNA VEZ. Compra.inventario_por_recepcion queda fijado al INSERT: true
solo en compras NUEVAS con vínculo vigente. Registro comercial conserva compra,
precios/costos/CxP y no acredita stock aún. Kardex usa MISMO origen compra/id y
reconcilia acumulado físico; cada entrega añade solo delta y costo de sus partidas.
Costo incremental desde las líneas del evento físico actual, evitando revalorar
lo anterior con un promedio acumulado o restar valores ya redondeados. Regalía
posterior conserva costo cero aun con conversión fraccionaria. Productos no
inventariables no crean movimientos. Compras anteriores false conservan entrada
comercial: recibir no reconcilia ni acredita otra vez, aunque físico difiera.
Histórico false sin entrada propia completa rechaza cantidad positiva: no
importar stock viejo como nueva mercadería. No migrar ni anular ese stock aquí.

COBERTURA. Vista orden_compra_ciclo_cobertura reparte cantidades propias recibidas
por orígenes guardados (parada/faltante). Antes de final, original sigue reservado;
solicitado, recibido y pendiente distinguidos. Final conserva solo lo físicamente
recibido asignado a cada necesidad. Ejemplo 6 de 10: cobertura 6 y libre 4 para OTRA
orden, jamás modificar cantidad enviada 10. Excedente sin origen no cubre otra
semana. No resolver faltantes de clientes automáticamente; bodega prepara/despacha
por su flujo. FAL-03/04/08 y cierre de enviada aún requieren trabajo específico.

HISTORIA. PDF, comparación y evento final quedan dentro de orden. En la
parte 049 recibida seguía activa; SQL050 añade [[modulo/archivo-ordenes-compra]]
por consulta tras 24 h y retira cron/botón/API semanal, sin tocar eventos ni
cobertura. Carga/entregas y cierre de enviada pendientes. Producción,
main/developer, stock histórico y mensajes reales fuera.

EVIDENCIA. 22 pruebas PostgreSQL propias incluyen parcial/final, conversión,
fracciones, costo de partidas distintas, final 0, diferencias/motivos, histórico
sin entrada, compras anteriores, varias facturas, rollback, SQL e idempotencia.
Dos conexiones comprueban misma clave una entrada y claves distintas revisión
obsoleta 409. Chromium 1440/390 px: stock 0 tras aceptación, parcial/final, extras
rechazados, fecha/historial, PDF posterior, ACL 401/403, sin desborde/errores JS.
Nueve huellas comerciales iguales durante recepción, envío/orígenes inmutables
y próximo ciclo separado. Informe: docs/informes/recepcion-ordenes-2026-10-06.md.

Validación final previa a integrar: 2.103 pruebas/364 suites, cero fallos/omitidas;
grafo 12, build aprobado. Aplicación local y retiro de pruebas en el informe.

APLICACIÓN LOCAL. Código 5396049, 049 en tachi 5434 con respaldo protegido;
32 huellas operativas iguales y compras anteriores modalidad false. Recepción/
órdenes vacías, inventario/movimientos/conteos 0. App 5174→3002/PID 4165 con lanzador
permanente seguro; compartida verificada solo GET/SQL READ ONLY. Evidencia propia
conservada, copia/base/puertos 3003/5175 retirados; relevo en memoria/informe.
Sin producción, developer/main/push ni ejecución de limpieza semanal.

Vista operativa de stock/demanda/faltantes/compras: [[modulo/necesidades-por-ciclo]],
consulta por semana y producto con procedencia. No reservar/descontar stock
otra vez ni considerar borrador/incierto como solicitado confirmado. Consulta
nueva no asigna proveedores; no llamar reporte legado de fondo. Evidencia y
estado vigente en informe necesidades-cobertura-2026-10-06.
