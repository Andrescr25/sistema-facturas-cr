---
id: modulo/cierre-ordenes-compra
tipo: modulo
titulo: Cierre de enviada — recibido conservado y cobertura pendiente liberada
estado: vigente
archivos:
  - backend/migrations/independencia/052_cierre_orden_compra_ciclo.sql
  - backend/src/modules/orders-whatsapp/ordenesCicloCierre.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloRecepcion.service.js
  - backend/src/modules/reports/necesidades.service.js
  - backend/tests/ordenesCompraCierre.test.js
  - docs/informes/cierre-ordenes-2026-10-06.md
aristas:
  depende_de: [modulo/ordenes-compra-por-ciclo, modulo/recepcion-ordenes-compra, decision/orden-enviada-y-archivo-por-recepcion]
  relacionado: [modulo/validacion-cadena-operativa, modulo/contexto-cadena-operativa, modulo/necesidades-por-ciclo, modulo/facturas-ordenes-compra, modulo/archivo-ordenes-compra, modulo/permisos, modulo/faltantes]
medido: 2026-10-06
---

**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


CONTRATO. Reporte Proveedores → Órdenes por ciclo → orden enviada/parcial →
Cierre de orden enviada. Revisar cobertura por producto/factura, confirmar con
proveedor e indicar motivo. GET/POST /api/orden-compra/por-ciclo/:id/cierre
heredan Reporte Proveedores. GET es READ ONLY/REPEATABLE READ real; ninguna
consulta cambia estado ni asigna proveedores. Actor de la sesión y hora SQL.

CERRAR. Solo envío confirmado. Incierto/enviando exige primero verificación;
borrador mantiene cierre sin enviar anterior. Recibida conserva su final y
archivo 24 horas, no se transforma en cerrada. Ciclo cancelado/proveedor
inactivo no impiden terminar la obligación previa. Sin recepción libera toda
su reserva; parcial 6 de10 conserva6 y libera4 para OTRA orden del MISMO ciclo.
No registrar recepción final ficticia ni acreditar stock al cerrar. No modificar
compras, facturado, costos, CxP o faltantes del cliente. Exceso recibido sin
origen nunca se aplica a próxima semana; conversiones guardadas conservadas.

DURABILIDAD. SQL052 añade evento único/inmutable, solicitud UUID/cuerpo,
snapshot de originales/recepciones/vínculos/cobertura por origen, motivo,
actor activo y fecha. Advisory46005/1 común con envío/recepción/órdenes y
versión/firma de contexto impiden cerrar lo que cambió. Evento, cabecera y
bitácora en una transacción. SQL exige evento revisado coincidente, conserva
enviada_en/recepcion_id y todas las columnas comerciales. Estado cerrado
terminal, PDF/recepciones/líneas/orígenes/vínculos no se borran/reescriben.
La vista de cobertura retiene lo físicamente asignado a sus mismos orígenes.

REINTENTO. Mismo UUID/cuerpo lee resultado incluso tras cierre; otras claves
con revisión vieja rechazan409. La pantalla congela clave/cuerpo si se perdió
respuesta; permite consultar resultado o repetir el mismo cierre. Cambiar
motivo invalida confirmación. Una respuesta vieja no debe cambiar otra orden.

HISTORIA. Cierre pasa inmediatamente a Historial; recibida sigue archivo24h.
Detalle muestra motivo/actor/hora, cantidades liberadas/conservadas y documentos
originales. No permite nuevas recepciones ni cambiar factura vinculada después
del cierre. Necesidades conserva solicitado ORIGINAL y recibido de enviada
cerrada, pendiente0; borrador cerrado no cuenta solicitado. Sugerencia separa
cobertura recibida de apartado sin envío, sin ofrecer otra vez lo ya recibido.

EVIDENCIA. 2191pruebas/362suites fail0/skip0,138focalizadas y22nuevas,
grafo12/build/Chromium1440/390. Reintento de respuesta perdida un cierre,
18huellas físicas/comerciales iguales. Informe de cierre-ordenes-2026-10-06
registra aplicación local y relevo; todo ensayo escrito en clon propio.

LOCAL. Códigoef464c3/052 integrado solo independencia-alegra con backup0600,
36+7huellas iguales, cierres/órdenes/stock0 y compartida solo GET/SQL READ ONLY.
App5174→3002/PID30872 con lanzador permanente seguro; original3000/PID5370
y main/developer intactos. Base/puertos/copia/rama propios retirados al cierre,
reserva liberada y memoria15decisiones literales conservadas. Próximo: final
propagación de filtros/exportaciones/históricos, Maps locales y validación
integral; operativo87/12, independencia133/14 separado.053 libre.

CONTINUIDAD 2026-10-06. [[modulo/contexto-cadena-operativa]] verifica la cadena
con dos semanas, cliente/Maps movidos y promoción: documentos/recepciones/
PDF/cobertura/eventos previos conservados, operaciones continuadas en su origen.
Cifras/relevo vigentes en el informe contexto-cadena-2026-10-06; los anteriores
son históricos. Permisos/concurrencia/unidades y VAL global siguen separados.

2026-10-06: matriz de permisos, reintentos/conexiones reales y unidades de
la cadena completa en [[modulo/validacion-cadena-operativa]]. Stock general
se distingue de demanda/cobertura por semana. Informe validacion-cadena-
2026-10-06 mantiene el cierre y sus límites; etapas anteriores históricas.
