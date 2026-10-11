---
id: modulo/registro-carga-entrega
tipo: modulo
titulo: Registro físico de carga y entrega — eventos inmutables por factura y ciclo
estado: vigente
archivos:
  - backend/migrations/independencia/051_eventos_carga_entrega.sql
  - backend/src/modules/entregas/registroFisico.service.js
  - backend/src/modules/entregas/entregas.service.js
  - backend/src/modules/entregas/entregas.routes.js
  - backend/src/modules/usuarios/modulos.js
  - backend/tests/registroEntrega.test.js
  - frontend/src/components/entregas/RegistroFisico.jsx
  - frontend/src/components/entregas/ParadaDetalle.jsx
  - frontend/src/hooks/useEntregas.js
  - frontend/src/pages/Entregas.jsx
  - docs/informes/registro-entregas-2026-10-06.md
aristas:
  depende_de: [modulo/carga-entregas-por-ciclo, modulo/facturas-bodega, modulo/pedidos-por-ciclo]
  relacionado: [modulo/validacion-cadena-operativa, modulo/contexto-cadena-operativa, modulo/necesidades-por-ciclo, decision/ciclo-de-ruta-como-contexto, modulo/permisos, modulo/inventario, modulo/faltantes]
medido: 2026-10-06
---

ALCANCE. Carga y Entregas muestra avance físico por factura del recorrido
fijo. Eventos carga/entrega/descarga/incidencia y revisión explícita. No
vender/facturar/cobrar ni descontar stock otra vez: la venta ya tiene kardex.
051 agrega solo entrega_evento, funciones y protecciones; no poblar históricos.
No cerrar ni promover automáticamente ciclos. Sin ciclo conserva consulta
histórica, sin fabricar carga/contexto.

API. GET /entregas/facturas/:id/registro usa READ ONLY + REPEATABLE READ.
POST /entregas/facturas/:id/eventos requiere acción, UUID, versión/firma
observadas, confirmar=true, cantidades NUEVAS por numeroLinea y motivo.
Carga/entrega exigen emitida y bodega procesada, contexto vigente y ciclo
abierto. Carga anticipada admite preventa/preparacion; entrega al cliente
exige promoción explícita del ciclo a entrega. Descarga/incidencia siguen
permitidas sobre la fotografía cargada aunque se anule/cambie la factura
o cierre el ciclo, con motivo obligatorio. Incidencia no cambia cantidades.

CANTIDADES. Cuatro decimales, positivas por evento; entregada+descargada no
supera cargada, cargada-descargada no supera facturado. Parcial conserva lo
pendiente, descarga no entrega y permite recargar después sin sobrepasar el
pedido. PostgreSQL NUMERIC valida; lecturas JS redondean restas a4dec para
no inventar carga pendiente por residuos binarios. Hora siempre del servidor.
Actor de sesión activo, nunca del cuerpo. Evento y bitácora en la misma TX.

CONCURRENCIA. Factura FOR UPDATE, ciclo/actor FOR SHARE; versión secuencial
única por factura. UUID/cuerpo iguales consultan lo confirmado sin duplicar;
otro cuerpo con misma clave409, revisión obsoleta409. Una respuesta perdida
conserva UUID/cuerpo y bloquea un registro nuevo hasta reintentar el mismo.
No enviar dos cargas nuevas para comprobar si la anterior quedó guardada.

REVISIÓN. Snapshot operativo guarda factura/cliente/recorrido, líneas con
identidad/nombre/referencia/cantidad y revisión/faltantes de bodega. No
precios/costos/deuda. Cambios operativos tras carga requieren revisión,
incluida reimpresión que borra/reemplaza líneas. Historia no depende de sus
ids efímeros. Cambiar precios no altera físico. POST /.../revision exige
admin, todas las líneas ACTUALES con acumulados verificados y motivo. No
reinterpretar cantidades viejas automáticamente: formulario comienza en0
si cambió la factura. Conserva fotos/eventos anteriores y sus productos.
No reasignar carga a factura anulada; descargar su fotografía anterior.

PERMISOS. Todo pertenece a entregas; corregir-entrega es acción admin por
método/ruta y espejo de frontend. /eventos no acepta revision, incluso para
admin. Servicio y SQL repiten condición de administrador/actor y motivo.
Permisos de usuarios actuales no se amplían. Chofer no necesita Clientes.

PLAN. Resumen nativo por factura: por_cargar, cargada, parcialmente_entregada,
entregada o requiere_revision. Completa solo si todas sus líneas fueron
entregadas, no por revisión de bodega. Completa sale de carga sugerida,
continúa en orden de entrega/historia. Actual/próxima mantienen avances
independientes. Pedido anticipado facturado aparece una vez y mantiene
origen, semana y Maps fijos. Cambiar maestro no traslada sus eventos.

VERIFICACIÓN/CIERRE. Evidencia y estado de integración en el informe citado.
Fixtures ZZ solo en clon propio; pruebas de cantidades, reimpresión, SQL
inmutable, rollback de bitácora, permisos y dos conexiones reales. Navegador
prueba parcial/descarga/incidencia/revisión y respuesta perdida. SQL051 local
solo tras pruebas y respaldo; mantener stock provisional0 y datos del usuario.

CIERRE LOCAL. Código5c9e90a, SQL051 aplicada solo local con dump0600; eventos
vacíos, sin backfill.36huellas +7 completas adicionales iguales, stock/conteos/
movimientos0 y datos del usuario conservados.2.148pruebas/362suites, fail0/skip0,
grafo12/build/Chromium1440/390 aprobados; dos conexiones reales y GET real
READ ONLY/REPEATABLE READ. App5174→3002 segura PID18962/Vite98892, producción
3000/PID5370/main/developer intactos. Base/puertos propios retirados; evidencia
privada y15decisiones preservadas.82/17 operativo; independencia133/14 aparte.
Siguiente vista stock/requerido/comprometido/cobertura, luego cierre de enviada
y propagación final. Próxima052 solo si hace falta esquema, no reservarla
para una consulta que no lo necesita.

Vista operativa de stock/demanda/faltantes/compras: [[modulo/necesidades-por-ciclo]],
consulta por semana y producto con procedencia. No reservar/descontar stock
otra vez ni considerar borrador/incierto como solicitado confirmado. Consulta
nueva no asigna proveedores; no llamar reporte legado de fondo. Evidencia y
estado vigente en informe necesidades-cobertura-2026-10-06.

CONTINUIDAD 2026-10-06. [[modulo/contexto-cadena-operativa]] verifica la cadena
con dos semanas, cliente/Maps movidos y promoción: documentos/recepciones/
PDF/cobertura/eventos previos conservados, operaciones continuadas en su origen.
Cifras/relevo vigentes en el informe contexto-cadena-2026-10-06; los anteriores
son históricos. Permisos/concurrencia/unidades y VAL global siguen separados.

2026-10-06: matriz de permisos, reintentos/conexiones reales y unidades de
la cadena completa en [[modulo/validacion-cadena-operativa]]. Stock general
se distingue de demanda/cobertura por semana. Informe validacion-cadena-
2026-10-06 mantiene el cierre y sus límites; etapas anteriores históricas.
