# Cierre de órdenes enviadas — 2026-10-06

Implementado y verificado en copia propia desde9afebe3, sin commits de Claude
ni otra reserva al iniciar. Rama tmp/codex-cierre-ordenes-20261006 y base
propia tachi_codex_cierre_ordenes_20261006, clon del dump LOCAL051.
Integración solo local; aplicación/respaldo y relevo se registran al cierre.

## Resultado

Reporte Proveedores → Órdenes por ciclo → enviada/parcial → Cierre de orden
enviada. Revisión por producto/factura, confirmación con proveedor y motivo.
6 recibidas de10 conservan cobertura6 y liberan4 para OTRA orden del MISMO
ciclo. Sin recepción libera su cobertura completa. No se marca recibida al
cerrar, no cambia compra/CxP/stock ni se generan recepciones ficticias.
Documento enviado, cantidades originales, conversiones, PDF, vínculos y
recepciones permanecen inmutables. Estado cerrado terminal, historial
inmediato con motivo/actor/hora; recibida sigue archivo a24h por recepción final.

Envío incierto/enviando debe verificarse primero. Ciclo cancelado/proveedor
inactivo permiten cerrar una obligación previa, sin reclasificar documentos.
Sugerencia descuenta cobertura físicamente conservada y separa reservas de
solicitado; Necesidades conserva10 originales/6 recibidas/pendiente0 y libre4.
Un recibido extra sin origen no cubre próxima semana. Totales fraccionarios
por origen se suman con seis decimales exactos, sin acumulación binaria.

SQL052 añade evento único/inmutable de cierre con solicitud UUID/cuerpo,
snapshot de recepción/cobertura/vínculos, motivo/actor activo y fecha SQL.
Evento/cabecera/bitácora en una transacción, advisory46005/1 y versión/firma
comunes con recepciones/órdenes. Cierre requiere evento revisado en SQL y
conserva enviada_en/recepcion_id. API hereda Reporte Proveedores y actor de
sesión; GET READ ONLY/REPEATABLE READ real. Mismo UUID/cuerpo retorna resultado
sin otro evento; versión vieja/datos distintos409. La pantalla bloquea edición
si se perdió respuesta y reintenta exactamente misma solicitud. Facturas/
recepciones ya cerradas son consultables, sin edición comercial del vínculo.

## Verificación

**2191 pruebas/362 suites**, cero fallos/omitidas; **138 focalizadas**,
22 casos nuevos (21PostgreSQL + permiso). Grafo12, build y Chromium1440/390.
Pruebas propias de sin recepción/parcial/final,6+4 por factura, nueva orden,
incertidumbre verificada, ciclo cancelado/inactivo, precisión/conversión,
recibido excedente, idempotencia, revisión vieja, actor inválido y protecciones
SQL/rollback. Cuatro casos nativos prueban conexiones concurrentes/READ ONLY:
mismo UUID un evento, distintos UUID una revisión, cierre vs recepción un
ganador y stock acorde a su evento. No mocks del SQL de negocio; fixtures
SAVEPOINT/ROLLBACK y COMMIT nativo solo en clon propio. WhatsApp simulado.

Chromium: propuesta6/4 por factura, cambio de motivo invalida confirmación,
respuesta perdida DESPUÉS de guardar + reintento mismo UUID/cuerpo un evento,
historial/actor/hora, PDF original10, próximo ciclo4 separado sin recepción.
Controles de recepción/vínculo deshabilitados tras cierre. **18 huellas
íntegras** de compra/CxP/stock/facturas/recepciones/documento enviado, sólo
cabecera/evento/bitácora cambian al cerrar. Necesidades muestra solicitado10,
recibido6/cobertura6/pendiente0/libre4. Permisos401/403/400, variantes Express,
sin desborde/errores JS. Navegador acepta sólo GET y POST del cierre de su
fixture local3003/5175. Ninguna escritura de pruebas en la compartida.

Primer focal detectó errores de configuración de fixtures/formato numérico;
corregidos. Segundo detectó acumulación binaria al sumar dos orígenes;
corregida en servicio con micros, 138 focalizadas posteriores aprobadas.
El primer navegador detectó un mapeo duplicado en el fixture de próxima
semana; corregido para reutilizar su relación. Clon propio restaurado y
navegador repetido aprobado; ajuste de mensaje para una orden finalizada
verificado también en navegador/build. Registros de intentos privados conservados. La suite completa corre tras
restaurar SOLO clon propio; nunca restaurar la base habitual para pruebas.

FAL-08/OC-03 cerrados: **87 listos/12 pendientes (99 IDs)**. Independencia
133/14 (147 IDs) por separado. Falta propagación/revisión integral de
filtros/exportaciones/históricos (FIL-09/10/11, RUT-08), fuente local Maps
anteriores (RUT-03), VAL-01/04–07 y revisiones CLI-10/VAL-08 del usuario.
No marcar verificaciones integrales por comprobar solo esta parte.

## Siguiente

Propagación final de contexto ruta/semana a pantallas/exportaciones/históricos;
conservar documentos al mover clientes, validar filtros y fuente local de Maps.
Luego prueba integral. Aceptación REAL de Hacienda/corte y datos manuales
siguen en checklist de independencia; no son parte cumplida por este cierre.
