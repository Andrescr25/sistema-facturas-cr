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
