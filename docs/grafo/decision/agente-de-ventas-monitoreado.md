---
id: decision/agente-de-ventas-monitoreado
tipo: decision
titulo: El agente de ventas factura a precio de lista, no cobra y no ve costos; se construye función a función
estado: vigente
archivos:
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/usuarios/permisos.middleware.js
  - backend/src/modules/facturacion/precioFijo.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - backend/src/modules/facturacion/descuentoCliente.service.js
  - backend/src/modules/configuracion/configuracion.service.js
  - backend/migrations/independencia/068_permisos_accion_facturacion.sql
  - frontend/src/utils/modulos.js
  - frontend/src/utils/descuentoCliente.js
  - frontend/src/hooks/useDescuentoClienteFacturacion.js
  - frontend/src/components/usuarios/TableroPermisos.jsx
  - frontend/src/components/facturacion/LineaFactura.jsx
  - frontend/src/components/facturacion/LineasFactura.jsx
  - frontend/src/pages/Facturacion.jsx
  - frontend/src/components/Layout.jsx
  - backend/tests/precioFijoFactura.test.js
  - backend/src/modules/facturacion/soloSusFacturas.js
  - backend/src/modules/facturacion/facturacion.routes.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/integrations/hacienda/rutas.js
  - frontend/src/components/facturacion/PanelFacturasEmitidas.jsx
  - frontend/src/components/RequierePermiso.jsx
  - backend/tests/soloSusFacturas.test.js
  - backend/migrations/independencia/069_rutas_del_agente.sql
  - backend/src/modules/usuarios/rutasAsignadas.js
  - backend/src/modules/usuarios/usuarios.service.js
  - backend/src/modules/preventa/preventa.controller.js
  - backend/src/modules/preventa/preventa.service.js
  - backend/src/modules/rutas/rutaActual.service.js
  - frontend/src/components/usuarios/RutasDelUsuario.jsx
  - frontend/src/components/usuarios/Casilla.jsx
  - frontend/src/hooks/useRutasParaAsignar.js
  - frontend/src/components/preventa/FiltrosAgenda.jsx
  - frontend/src/hooks/useAgendaPreventa.js
  - backend/tests/rutasDelAgente.test.js
  - frontend/src/components/preventa/DetalleVisita.jsx
  - frontend/src/utils/visitaPreventa.js
  - frontend/src/hooks/useClienteDesdePreventa.js
  - frontend/src/components/facturacion/VolverAPreventa.jsx
  - backend/tests/visitaPreventa.test.js
  - backend/migrations/independencia/070_visitas_del_agente.sql
  - backend/src/modules/preventa/visitas.js
  - backend/src/modules/preventa/preventa.routes.js
  - frontend/src/components/preventa/ModalProximaVisita.jsx
  - frontend/src/hooks/useProximaVisita.js
  - frontend/src/services/ubicacionService.js
  - frontend/src/utils/fechaCR.js
  - backend/tests/visitasDelAgente.test.js
  - backend/src/modules/seguimiento/seguimiento.service.js
  - backend/src/modules/seguimiento/seguimiento.routes.js
  - frontend/src/pages/SeguimientoAgentes.jsx
  - frontend/src/hooks/useSeguimientoAgente.js
  - frontend/src/utils/seguimientoAgente.js
  - frontend/src/components/seguimiento/RecorridoAgente.jsx
  - frontend/src/components/seguimiento/PendientesAgente.jsx
  - backend/tests/seguimientoAgente.test.js
aristas:
  relacionado: [modulo/permisos, modulo/facturacion, modulo/preventa-agenda, decision/rotacion-por-cliente-sin-ciclos]
medido: 2026-10-29
---

## Qué pidió el usuario (2026-10-29)

«Voy a contratar un agente de ventas, este se hará cargo de las rutas poco a
poco, pero quiero tenerlo completamente monitoreado.» Le da Facturación,
Catálogo del agente y Preventa; en Preventa, la cola de clientes que tiene
que visitar, facturarle desde ahí o marcar «próxima visita», y la ubicación
del cliente. «Vamos poco a poco, función a función para ir probando.»

Decisiones, textuales:
1. «El precio y descuento no lo puede tocar.»
2. «De momento este no podrá cobrar, porque lo voy a poner a prueba (pero
   igual esto desarróllalo para futuro): cuánto dinero recogió por usuario y
   todo más acomodado a cierre de caja.» Su usuario va sin Cuentas por Cobrar.
3. Próxima visita: hoy + la rotación del cliente, por defecto; «que el agente
   planifique bien cómo va a visitar y esto sea más personalizable».
4. GPS en cada acción: sí.

## F1 (2026-10-29): su usuario y los candados

**Permisos de acción** (`PERMISOS_DE_ACCION`): se otorgan aparte aunque se
tenga el módulo, se guardan en `usuario_modulo` y en el tablero salen debajo
de su módulo; quitar el módulo los quita. Un administrador los tiene por rol.
- `precio-factura` «Cambiar precio y descuento». Sin él, el servidor exige el
  precio de lista (al editar, también el que ya tenía la línea) y solo la
  oferta vigente o el descuento del cliente (`precioFijo.js`, 409
  `PRECIO_FIJO`, sin corregir en silencio). La pantalla no muestra los campos;
  el precio se sigue viendo junto al subtotal.
- `cobro-factura` «Cobrar al facturar». Sin él, la pantalla no ofrece métodos
  de pago (la factura queda pendiente, que ya era lo elegido por defecto) y el
  servidor rechaza un cobro (403 `SIN_COBRO`).
- La migración 068 se los dio a todos los que ya tenían Facturación: a nadie
  le cambia nada. Impresión y Bodega editan facturas por su cuenta y no pasan
  por la regla.

**Lo que se cerró al auditar qué lee un usuario con solo esos tres módulos**
(las 184 rutas GET, con un usuario ZZ en la copia local):
- El descuento del cliente mandaba el COSTO de cada producto (de ahí sale el
  margen). Sin `precio-factura` ahora llega `aplica`: en qué productos aplica,
  ya resuelto por el servidor con la misma regla de guardar.
- `/catalogos/configuracion` (compartida con cualquier sesión) mandaba las
  cuentas de dinero enteras, con número y saldo inicial: ahora solo id, nombre
  y tipo, que es lo único que usaba la pantalla.
- `/reportes/historial` (tabla `procesamientos`) no la usaba ninguna pantalla
  y la leía cualquiera: se borró.
- «Catálogo del agente» no estaba en el menú de nadie (se llegaba por el
  Dashboard o el ingreso): ahora sale para quien tenga el módulo.

**Solo sus facturas** (el usuario: «el agente ve solo sus facturas»):
`facturas-todas` «Ver las facturas de todos», tercer permiso de acción, también
dado por la 068 a quien ya facturaba. Sin él, la lista se filtra por
`factura.creado_por` y una factura o nota ajena pedida por su número «no
existe» (404 `NO_EXISTE`) al verla, imprimirla, mandarla, editarla, emitirla o
bajar su comprobante de Hacienda (`soloSusFacturas.js`; las rutas lo llevan
una por una, porque `/notas-credito/motivos` no es una nota). Su copia sin
señal baja solo las suyas. La pestaña lo dice.

**Al entrar** quien no tiene Dashboard caía en «No tiene acceso» con un
«Volver al inicio» que lo devolvía ahí: ahora entra a su primer módulo
(`inicioDe` en utils/modulos.js).

## F2 (2026-10-29): las rutas que atiende

Tabla `usuario_ruta` (migración 069). En la ficha de Usuarios, a quien ve
Preventa sin «Ver todas las rutas» (`rutas-todas`, cuarto permiso de acción)
se le marcan sus rutas; la lista de Usuarios dice cuáles atiende cada uno.
Cada cambio queda en la bitácora (entidad `usuario`, acción editar, rutas de
antes y después). Preventa le muestra solo esas —sin «Clientes sin ruta»— y,
con una sola, entra directo; sin ninguna, se lo dice. El servidor responde 403
a la agenda de otra ruta. La 069 da `rutas-todas` a quien ya tenía Preventa.

**Ojo al desplegar:** las migraciones dan los permisos de «ver todo» a todo
usuario que ya tenga Facturación o Preventa. El agente se crea DESPUÉS de
aplicarlas, o se le desmarcan esos permisos en su ficha (en la copia local le
pasó a `zz-agente`, creado antes).

## F3 (2026-10-29): la visita, con ubicación y «Facturar»

En la visita: «Facturar» (solo con Facturación) abre
`/facturacion?cliente=ID&desde=preventa&ruta=R`; Facturación elige ese cliente
de la copia del dispositivo —sirve sin señal— y muestra «Volver a la agenda»
(`useClienteDesdePreventa`, aparte del hook grande). Preventa guarda la ruta en
la dirección, así vuelve donde estaba. «Cómo llegar»: dirección, otras señas,
«Abrir en Maps» con el enlace de la ficha y «Ir con Waze» solo si el enlace
trae las coordenadas escritas (los cortos `maps.app.goo.gl` no las traen).
«Contacto»: cada teléfono distinto con «Llamar» y «WhatsApp», leyendo el
número de textos como «89350207 JEISON» y poniéndole el 506.

## F4 (2026-10-29): «Próxima visita» y la visita con venta, con GPS

Tabla `visita` (migración 070): una fila por visita, `venta` (con su factura)
o `proxima_visita` (motivo obligatorio —no necesitaba, cerrado, sin encargado,
sin dinero, otro—, nota opcional y la nueva fecha, de mañana a 180 días), con
el GPS del momento o por qué no lo hay (`negada` / `no_disponible`; la base
exige coordenadas si dice `tomada`). Sale de la visita: «Próxima visita» abre
un modal con la fecha que propone el servidor ya elegida —hoy + su rotación,
o en 7 días— y otras para planificar (mañana, 7, 15 días u otra fecha).

La próxima visita marcada manda en la agenda (pasa a Próximos/Hoy/Atrasados
según esa fecha, y dice «Reprogramada por X · motivo») HASTA QUE VUELVA A
COMPRAR: una factura de un día igual o posterior la deja sin efecto, porque la
factura manda (se compara por día de Costa Rica). La rotación y la ficha no se
tocan (`conReprogramacion` en `preventa/visitas.js`; solo Preventa la usa:
Clientes y Reporte Clientes siguen con la regla de la factura).

Facturar desde la visita anota la visita de venta en la MISMA transacción que
la factura (`datos.visita`); si la factura falla, no queda. El GPS se toma al
llegar a Facturación desde Preventa y viaja con la factura, también con la que
se arma sin señal. Una página web no puede seguir al agente todo el día: solo
pregunta dónde está en cada acción.

## F5 (2026-10-29): Seguimiento de agentes

Módulo propio `seguimiento-agentes` (`/seguimiento`, menú Ventas; el
administrador lo ve por su rol y se le puede dar a un supervisor). Sin SQL:
sale de las facturas que creó (`creado_por`) y de sus visitas. Se elige el
agente —quien atiende rutas o anotó visitas en 90 días— y el día (hasta hoy):
resumen (clientes atendidos, facturas y monto sin las anuladas, cuántos no
compraron, acciones sin ubicación y facturas hechas fuera de Preventa), el
recorrido en orden de hora con el motivo y la distancia al cliente según el
GPS (contra las coordenadas de su ficha; más de 300 m sale en alerta) y, si
es hoy, «Le falta hoy»: los de sus rutas atrasados o de hoy que no visitó (la
misma agenda de Preventa). Las horas, en Costa Rica: `factura.creado_en` ya es
hora local por la zona de la conexión; `visita.creado_en` lleva zona.

## Lo que sigue

Cobros y cierre de caja por usuario (pedido «para futuro») · después, si hace
falta: Preventa sin señal y guardar la ubicación del cliente con GPS.
