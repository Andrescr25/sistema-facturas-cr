---
id: modulo/recorrido-visual-operativo
tipo: modulo
titulo: Recorrido visual — acciones reales del catálogo a recepción y entrega
estado: retirado
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - docs/informes/recorrido-visual-2026-10-07.md
  - backend/tests/proveedorDeFaltantesPropio.test.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/proveedores/proveedores.asignacion.service.js
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - frontend/src/components/reporte-proveedores/ModalAsignarProveedor.jsx
  - frontend/src/hooks/useReporteProveedores.js
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  relacionado: [modulo/faltantes, modulo/contexto-visible-operacion, modulo/validacion-cadena-operativa, modulo/contexto-cadena-operativa, modulo/preventa-por-enlace, modulo/recepcion-ordenes-compra, modulo/carga-entregas-por-ciclo, modulo/archivo-ordenes-compra]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

**Retirado.** El runner `backend/tests/e2e/recorridoOperativo.cjs` se borró:
recorría el flujo por semanas (filtro de semana, recorrido, anticipadas,
órdenes por ciclo, recepción y cierre), que ya no existe, y ni siquiera
cargaba porque su fixture `contextoCadena` ya se había quitado. Lo que sigue
describe ese recorrido como historia.

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


Runner Chromium aparte de la suite nativa: no instalar Playwright ni arrancar
server.js ordinario con NODE_TEST_CONTEXT. Necesita un clon tachi_codex_*,
puertos 3003/5175 propios, bootstrap privado y servidor con documento simulado
y sockets externos rechazados. La rama/base habitual no recibe acciones.

Flujo: ficha/orden maestro sin reescribir recorrido; catálogo PDF y mensaje
CATÁLOGO revisados; portal añade 3 anticipadas; facturar/bodega conservan ciclo;
asignar proveedor en esa semana; nueva orden 3 sin ampliar la enviada 4;
PDF revisado/enviado simulado; factura de proveedor/representación; compra
comercial sin stock; recepción final +3 una vez y parcial original +6;
cierre próximo conserva 1 y libera 3; cerrar/promover semana; cargar/entregar
con Maps original; cuatro Excel; activa/historial tras 24 h con PDF conservado.

Una respuesta antigua de recepción se libera después de escribir cantidades;
no puede borrar 6 ni la confirmación. Leer reportes filtrados tampoco cambia
asignaciones. Seis regresiones PostgreSQL, además del recorrido completo.

El buzón y las 24 horas son fixtures explícitos: factura sintética y evento
final histórico NUEVO, sin editar eventos confirmados ni desactivar triggers.
No acredita factura fiscal oficial, WhatsApp real ni revisión humana. Los
PDF enviados deben tener la misma huella que los descargados/revisados.
Evidencia y cierre de VAL-05 se consignan en el informe de esta entrega.


VAL-05 cerrado:94/5(99 IDs). Dos recorridos completos,54 mutaciones de UI
solo en clon,44 vistas/88 capturas1440/390,12 descargas y4 documentos de UI
simulados idénticos a los revisados.2.263 pruebas/363 suites,fail0/skip0,
grafo12/build. VAL-06/07, Maps LOCAL y revisiones humanas siguen abiertos.
[Informe de validación y relevo](../../informes/recorrido-visual-2026-10-07.md).

Aplicado localmente2519389, sin SQL nueva. Backend seguro74960/Vite98892,
36+9 huellas iguales/stock0; original5370 y developer/main intactos. Clon y
puertos propios retirados; memoria/reserva se cierran tras retirar copia/rama.
