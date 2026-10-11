---
id: modulo/validacion-cadena-operativa
tipo: modulo
titulo: Permisos, concurrencia y unidades en toda la cadena operativa
estado: vigente
archivos:
  - backend/tests/validacionPermisosCadena.test.js
  - backend/tests/validacionConcurrenciaCadena.test.js
  - backend/tests/validacionUnidadesCadena.test.js
  - backend/tests/fixtures/contextoCadena.js
  - backend/tests/fixtures/transaccionCadena.js
  - backend/src/modules/usuarios/permisos.middleware.js
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/orders-whatsapp/ordenesCicloRecepcion.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloCierre.service.js
  - backend/src/modules/entregas/registroFisico.service.js
  - backend/src/modules/inventario/inventario.service.js
aristas:
  depende_de: [modulo/contexto-cadena-operativa, modulo/permisos, tabla/compra-linea]
  relacionado: [modulo/ordenes-compra-por-ciclo, modulo/recepcion-ordenes-compra, modulo/cierre-ordenes-compra, modulo/registro-carga-entrega, modulo/necesidades-por-ciclo, decision/permisos-por-prefijo-mas-especifico, decision/ciclo-de-ruta-como-contexto]
medido: 2026-10-06
---

MATRIZ HTTP. Clientes, Facturación, Bodega, Reporte Clientes, Reporte
Proveedores, Revisión de Precios, Entregas y Configuración conservan sus
fronteras. Los ocho permisos se prueban individualmente, junto a admin y
sin módulos: documentos, Maps, selectores, PDF/Excel y escrituras con sus
middleware y routers reales. Variante de mayúsculas/barra final conserva
ACL; un parámetro de negocio tipado conserva su formato. Token vencido,
cuenta inactiva o token del cliente no habilitan operaciones internas.
Revocar módulo bloquea también un UUID ya confirmado; el actor viene del JWT.
Corrección física requiere admin y no se cuela por /eventos.

PORTAL. Token del personal no abre el portal; token de cliente solo consulta
sus pedidos y recibe 404 en los de otro cliente. Conservar las concesiones
públicas ya decididas para el catálogo del agente; esta matriz no revoca
permisos existentes, no vuelve pública una ruta ni amplía módulos del usuario.
No ejecutar contratos de limpieza semanal, tampoco para verificar permisos.

CONCURRENCIA. Fixtures de la cadena completa en el clon, con COMMIT y
conexiones PostgreSQL reales, verifican recepción/recepción, recepción/cierre,
cierre/cierre, carga/carga y envío/envío. Mismo UUID/cuerpo confirma una vez;
dos UUID de igual revisión dejan un ganador y el otro 409. Stock/recibidos/
cobertura pertenecen al ganador y al origen. Intento de envío durable visible
antes del transporte simulado; otra consulta no lo retransmite. Respuesta
perdida tras mover maestro reconoce el evento original; otro cuerpo rechaza.

UNIDADES. Pedido, bodega, origen y físico usan unidades propias. Orden/factura
guardan también unidades del proveedor y su factor: 2 cajas × 6 = 12 propias
para cubrir 10, con 2 excedentes sin cobertura de la siguiente semana;
500 × 0,02 = 10, costo propio 500 cuando la unidad del proveedor cuesta 10.
Recepción acredita solo el delta propio, sin multiplicar de nuevo. Cambio de
mapping/precio/nombre no revaloriza ni convierte lo guardado. Fracciones
0,1 + 0,2 conservan precisión; booleanos, exceso, quinta decimal y línea de
otra orden se rechazan sin efectos. Cierre conserva recibido/libera pendiente.

STOCK GENERAL. Recibir aumenta el saldo general visible en ambas semanas.
Eso es distinto de cambiar demanda/cobertura/recibidos/compromiso del otro
ciclo. Las pruebas comparan esos campos y verifican el delta general por
separado; no asignar una entrada o excedente automáticamente a otra ruta.

EVIDENCIA. [Informe](../../informes/validacion-cadena-2026-10-06.md) y checklist
vigente guardan cifras, matriz del servidor completo, aplicación local y
límites. Los casos de permisos/unidades en ROLLBACK sustituyen solo la
envoltura transaccional por SAVEPOINT; concurrencia y aislamiento usan SQL y
transacciones reales. Salidas externas son dobles, nunca mensajes reales.
VAL-05–08 y fuente LOCAL Maps mantienen sus verificaciones independientes.

2026-10-06: VAL-04 cerrado. 2.257 pruebas/362 suites, 20 casos nuevos,
grafo 12/build; servidor completo 569 HTTP (364 matriz de lectura y 190
escrituras denegadas), Chromium 1440/390 con cinco vistas/diez capturas.
18 huellas de negocio conservadas. Estado vigente 93 listos / 6 pendientes
(99 IDs); independencia 133/14 separado. Sin cambio de servicios o SQL.
