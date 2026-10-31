---
id: decision/planilla-del-agente
tipo: decision
titulo: La planilla del agente se calcula al leer — horas marcadas, comisión, incentivos y gasolina, por quincena
estado: vigente
archivos:
  - backend/migrations/independencia/072_empleado_y_jornada.sql
  - backend/src/modules/empleados/liquidacion.js
  - backend/src/modules/empleados/jornada.service.js
  - backend/src/modules/empleados/empleados.service.js
  - backend/src/modules/empleados/empleados.controller.js
  - backend/src/modules/empleados/empleados.routes.js
  - backend/src/modules/ingresos/ingresos.controller.js
  - backend/src/modules/ingresos/ingresos.routes.js
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/usuarios/usuarios.service.js
  - backend/src/modules/usuarios/bitacora.service.js
  - frontend/src/pages/MisIngresos.jsx
  - frontend/src/pages/Empleados.jsx
  - frontend/src/hooks/useJornada.js
  - frontend/src/hooks/useMisIngresos.js
  - frontend/src/hooks/useEmpleados.js
  - frontend/src/hooks/useDetalleEmpleado.js
  - frontend/src/components/ingresos/TarjetaJornada.jsx
  - frontend/src/components/ingresos/HorasDeLaQuincena.jsx
  - frontend/src/components/ingresos/SelectorQuincena.jsx
  - frontend/src/components/empleados/TarjetaEmpleado.jsx
  - frontend/src/components/empleados/DetalleEmpleado.jsx
  - frontend/src/components/empleados/ModalEmpleado.jsx
  - frontend/src/components/empleados/ModalJornada.jsx
  - frontend/src/components/preventa/RecordatorioJornada.jsx
  - frontend/src/utils/ingresosTexto.js
  - frontend/src/utils/fechaCR.js
  - backend/tests/jornadaEmpleado.test.js
  - backend/migrations/independencia/073_cliente_captado_por.sql
  - backend/src/modules/preventa/clienteNuevo.js
  - backend/src/modules/preventa/fichaDesdeVisita.js
  - backend/src/modules/clientes/clientes.service.js
  - backend/src/modules/empleados/clientesNuevos.js
  - frontend/src/components/preventa/ModalClienteNuevo.jsx
  - frontend/src/components/preventa/ElegirPunto.jsx
  - frontend/src/components/preventa/ElegirRotacion.jsx
  - frontend/src/components/ingresos/ClientesNuevos.jsx
  - frontend/src/hooks/useClienteNuevo.js
  - frontend/src/utils/identificacionCliente.js
  - frontend/src/pages/Preventa.jsx
  - backend/tests/clienteNuevo.test.js
  - backend/src/modules/empleados/ventasNetas.js
  - frontend/src/components/ingresos/ComisionDelMes.jsx
  - backend/tests/comisionEmpleado.test.js
  - backend/migrations/independencia/074_pago_empleado.sql
  - backend/src/modules/empleados/pagosEmpleado.service.js
  - backend/src/utils/cajaGeneral.js
  - backend/src/modules/pagos-proveedores/pagosProveedor.service.js
  - frontend/src/components/empleados/ModalPagoEmpleado.jsx
  - frontend/src/components/empleados/PagosEmpleado.jsx
  - frontend/src/components/ingresos/GasolinaDeLaQuincena.jsx
  - frontend/src/components/ingresos/DeudaEmpleado.jsx
  - frontend/src/components/caja-general/MovimientosCaja.jsx
  - frontend/src/components/cuentas-por-cobrar/PanelCierreCaja.jsx
  - backend/tests/pagosEmpleado.test.js
  - backend/src/modules/seguimiento/seguimiento.service.js
  - frontend/src/components/seguimiento/RecorridoAgente.jsx
  - frontend/src/utils/seguimientoAgente.js
  - backend/tests/seguimientoJornada.test.js
  - frontend/src/components/ingresos/TotalQuincena.jsx
  - frontend/src/components/ingresos/TarjetaIngreso.jsx
  - backend/migrations/independencia/075_seguimiento_en_empleados.sql
  - frontend/src/components/empleados/DiaDelEmpleado.jsx
  - frontend/src/hooks/useDiaDelEmpleado.js
  - frontend/src/pages/Empleados.jsx
  - backend/tests/seguimientoAgente.test.js
aristas:
  relacionado: [decision/agente-de-ventas-monitoreado, modulo/permisos]
medido: 2026-10-30
---

## Qué pidió el usuario (2026-10-30)

«Ocupo que en la vista del agente salga un módulo que diga "ingresos": las
horas que trabaja por día, cuánto de comisión ganó por mes (la comisión es el
2 % de ventas netas que este haga) y lo que gana por incentivo por cliente
nuevo (son 2000 colones por cliente nuevo que consiga) … para motivarlo; y
desde mi panel administrador ver qué hizo, cuántas horas, comisión, viáticos,
el total que le debo. Este módulo de mi lado se vería como empleados.»

Lo que decidió al preguntarle:
- Horas: **marca entrada y salida**, y se le paga **por hora trabajada**.
- Comisión: **sin IVA, menos devoluciones** (notas de crédito).
- Cliente nuevo: cuenta **con su primera compra**, no al registrarlo.
- Gasolina: **₡5.000 por cada día trabajado** («ya que es en moto»), y que
  se vea si ya se le pagó o no.
- Se paga **por quincena**; los pagos salen **de caja, como salida**.

Se construye función a función: E1 jornada y ficha · E2 cliente nuevo desde
Preventa · E3 comisión, incentivos y gasolina · E4 pagos y «le debo» · E5
la jornada en Seguimiento.

## La regla de fondo

Nada de lo ganado se guarda en una columna: se calcula al leer, de lo que pasó
(`liquidacion.js`), igual que el saldo de una factura. Lo único que se congela
es lo que ya se pagó (E4).

## E1 (2026-10-30): la ficha y la jornada — migración 072

- **Dos módulos**: `ingresos` («Mis ingresos», Ventas) lee SIEMPRE la sesión,
  nunca un id que mande la pantalla; `empleados` («Empleados», Finanzas) es el
  lado del administrador y se le puede dar a un supervisor.
- **`empleado`**: una ficha por usuario con sus tarifas (pago por hora;
  comisión, incentivo y gasolina con lo decidido por omisión). Cambiar una
  tarifa va a la bitácora. Desactivada, ya no marca jornada; su historia queda.
- **`jornada`**: cada tramo entre «Iniciar» y «Terminar jornada». La hora la
  pone el servidor; el GPS, como en las visitas (`ubicacionLimpia`). Una sola
  abierta (índice único parcial). Varios tramos por día suman; el que pasa la
  medianoche cuenta para el día de entrada.
- **Sin salida**: abierta más de 16 horas, se lee «sin salida» y cuenta 0
  hasta que quien lleva Empleados la corrija. El agente no la puede cerrar
  tarde (serían horas que nadie vio); al terminar o iniciar se guarda así.
- **Corregir, agregar y anular** piden motivo y van a la bitácora. Un tramo no
  puede ser futuro, pasar de 16 horas ni pisar otro del mismo empleado.
  `origen = 'a_mano'` distingue el agregado: no tiene GPS que mostrar.
- **Un usuario con jornadas no se borra**: las tablas no tienen ON DELETE, y
  borrar responde 409 «desactívelo».
- Preventa le recuerda «Iniciar jornada» a quien tiene «Mis ingresos».

## E2 (2026-10-30): «Cliente nuevo» desde Preventa — migración 073

- **`cliente.captado_por` / `captado_en`**: quién lo registró y cuándo. Lo
  pone el servidor (opción de `crearCliente`), nunca la pantalla.
- **Más estricto que el alta de Clientes**, porque de esto sale plata: solo en
  sus rutas y al final del orden; cédula de verdad (no la de mostrador
  100000000 ni un dígito repetido); una cédula que ya tiene ficha se rechaza
  diciendo de quién es. Clientes sigue sin exigir única (ahí se avisa: hay 139
  fichas con la de mostrador). El chequeo va después del candado de rutas, que
  toda alta toma: dos altas con la misma cédula no pasan juntas.
- **La primera compra** (`clientesNuevos.js`) es su factura vigente más vieja
  (emitida y no acreditada entera: `SIN_CREDITO_TOTAL`), la haga quien la haga;
  cuenta en la quincena de esa fecha. Si se acredita entera, manda la
  siguiente. Si ya compraba antes de que lo registrara, no es nuevo nunca.
- Mientras no compra sale «cuenta cuando haga su primera compra»: es la lista
  de a quién volver a visitar.
- Una sola copia: el punto en el mapa (`ElegirPunto`), la rotación
  (`ElegirRotacion`), la cédula (`utils/identificacionCliente.js`) y en el
  servidor `enlaceDeUbicacion`/`rotacionValida` sirven a la ficha y al alta.

## E3 (2026-10-30): comisión, gasolina y el total de la quincena — sin migración

- **Ventas netas** (`ventasNetas.js`): `factura.subtotal` (sin IVA, después de
  descuentos) de lo que facturó él (`creado_por`), emitido, desde su ficha
  (`empleado.desde`: lo de antes no le comisiona). Menos lo que acredita una
  nota vigente sobre esas facturas, sin IVA: monto aplicado × subtotal /
  total de la nota (la nota guarda las dos cosas, como la factura). Resta en
  el mes de la NOTA. Una factura anulada no suma ni resta.
- **Comisión** = netas × porcentaje (2 %), por mes. Si las devoluciones pasan
  las ventas, 0, y no descuenta de otro mes. Se ve en la 1.ª quincena («se
  paga con la 2.ª») y entra al total en la 2.ª.
- **Gasolina**: un monto por día con alguna jornada que no se anuló (también
  la que quedó sin salida: ese día salió a trabajar).
- **Total de la quincena** = horas + clientes nuevos + gasolina + (comisión
  del mes, en la 2.ª). En grande, con cada parte y su cuenta (hoy:
  `TotalQuincena` y una tarjeta por parte, ver más abajo).

## E4 (2026-10-30): pagos, caja y «le debo» — migración 074

- **`pago_empleado`**: cada pago sale de Caja General con su método (y
  referencia si la pide: `metodoDePago`, la misma regla de los pagos a
  proveedores, ahora en `utils/cajaGeneral.js`). Conceptos: `quincena`
  (una vigente por período, índice único), `ajuste` (lo que falta de una
  quincena ya pagada) y `gasolina` (días sueltos).
- **Lo pagado no cambia**: el pago congela el desglose y las TARIFAS. Una
  quincena pagada se sigue contando con las tarifas de su pago; un día de
  gasolina pagado, con lo que se pagó. Cambiar una tarifa vale para lo que
  falta. Si después se corrige una jornada, la diferencia es un ajuste.
- **Pagar la quincena** paga lo que falta (horas, clientes, comisión en la
  2.ª, y la gasolina sin pagar, que queda marcada con ese pago). Desde su
  último día; antes, 409.
- **`gasolina_pagada`**: un día se paga una vez (UNIQUE). Anular el pago borra
  sus días: vuelven a pendiente.
- **`movimiento_caja`** se recreó con las tres ramas de la 027 tal cual y la
  de `pago_empleado` («Planilla:» en Caja General y en el cierre). En efectivo,
  el cierre del día lo resta como cualquier salida.
- **«Le debo»** = lo que falta de cada quincena terminada (o ya pagada) + la
  gasolina sin pagar de la que corre. Una quincena pagada de más resta. El
  agente ve lo mismo como «Pendiente de pagarte», y sus pagos.
- **Anular un pago** es solo de administrador (`ACCIONES_ADMIN`
  `anular-pago-empleado`): es plata que ya salió de caja. Pide motivo y va a
  la bitácora.

## E5 (2026-10-30): la jornada en «Seguimiento de agentes» — sin migración

- El recorrido del día trae «Inició la jornada» y «Terminó la jornada · 2 h»
  con el GPS de cada marca (o «agregada/corregida por…» si la tocó quien lleva
  Empleados; la agregada a mano no tiene GPS). La anulada no sale.
- **El momento va en hora de Costa Rica SIN zona** (`tramosDelDia`), como las
  facturas y visitas del recorrido: si fuera con zona, en un servidor en UTC
  (Render) se ordenaría seis horas corrido. La prueba corre también con TZ=UTC.
- El resumen suma la tarjeta «Jornada» (horas del día, si quedó sin salida).
- (Ese mismo día el seguimiento pasó a estar dentro de Empleados: ver abajo.)

## «Mis ingresos»: tarjetas → detalle (2026-10-30)

El usuario, al verla: «los datos están muy dispersos y toda la información
viene en una sola hoja». De tres propuestas eligió «tarjetas → detalle», la
forma de Cuentas por Cobrar. Arriba lo de cada día: la jornada y lo ganado en
la quincena (`TotalQuincena`: con las flechas de la quincena, «Te pagaron» y
«Por cobrar», y lo que se debe de OTRAS quincenas si hay). Abajo una tarjeta
grande por parte (`TarjetaIngreso`): Horas, Gasolina, Clientes nuevos,
Comisión y Mis pagos; tocarla abre su detalle con «← Mis ingresos». Horas y
gasolina van juntas, día por día. El detalle va en la dirección (`?ver=`):
el «atrás» del teléfono vuelve al inicio. La tarjeta de pagos muestra el
último pago, no una deuda: lo que se le debe ya está en «Por cobrar», y dos
cifras de deuda en la misma pantalla se contradecían a la vista.
## «Empleados»: el mismo orden, y el seguimiento adentro (2026-10-30)

El usuario: «en mi vista de admin veo todo muy desordenado, ajústalo también;
y el seguimiento de agente, pónmelo dentro de empleados».
- La ficha del empleado va como «Mis ingresos»: arriba quién es (trabajando
  o no, su tarifa) y la quincena (`TotalQuincena para="administrador"`, con
  «Pagar quincena» adentro); abajo tarjetas: Su día, Jornadas y gasolina,
  Clientes nuevos, Comisión y Pagos («Le debo»). Cada una abre su detalle.
  Empleado y parte abierta van en la dirección (`?empleado=&ver=`).
- «Jornadas y gasolina»: arriba solo los días de gasolina POR PAGAR (para
  marcarlos y pagarlos); abajo cada día con sus tramos, «Corregir» y si su
  gasolina ya se pagó.
- **«Su día»** es lo que era «Seguimiento de agentes» (`DiaDelEmpleado`): la
  jornada, el recorrido con GPS, el resumen y lo que le falta hoy. Se pide en
  `GET /empleados/:usuarioId/dia`, solo de quien tiene ficha, con el permiso
  `empleados`. El módulo `seguimiento-agentes`, su menú, su página y
  `/api/seguimiento` se quitaron (un prefijo sin dueño quedaría abierto a
  cualquier sesión). La migración 075 borra su permiso, sin repartir
  «Empleados» en su lugar: ese permiso también paga. `/seguimiento` lleva a
  Empleados. Quien no es empleado ya no tiene seguimiento: el agente se da de
  alta en Empleados.
- La tarjeta de la lista: «Le debo» y «Lleva en la quincena» en grande; horas,
  comisión y clientes nuevos en una línea.

## Para publicar

Las migraciones 072, 073, 074 y 075 van ANTES del código en producción, en
ese orden (la 074 recrea `movimiento_caja`: comparar antes su definición en
producción con la de la 027; antes de la 075, ver quién tenía
`seguimiento-agentes`). Después, el usuario crea la ficha de empleado
del agente en «Empleados» y le da el módulo «Mis ingresos».



2026-10-30, 23:56 CR: Codex revisa los siete commits de Claude y aplica
072–075 antes de la publicación conjunta con Cobros. Respaldo privado,
transacción única y lectura posterior nueva: cuatro tablas vacías, columnas
nuevas nulas y huellas de las 13 tablas protegidas y Caja conservadas. Suite
completa: 3.288 correctas/0 fallos y tres omisiones históricas; recorrido local
independiente de estas pantallas: 117 comprobaciones correctas.
[Registro](../../informes/cobros-safari-detalle-2026-10-30.md).
