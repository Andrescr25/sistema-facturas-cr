---
id: modulo/cotizaciones
tipo: modulo
titulo: Cotizaciones — en la base propia, y facturarlas crea una factura propia
estado: vigente
archivos:
  - backend/migrations/independencia/029_cotizacion.sql
  - backend/src/modules/cotizaciones/cotizaciones.service.js
  - backend/src/modules/cotizaciones/enlacePublico.js
  - backend/scripts/independencia/cargar-cotizaciones.js
  - frontend/src/pages/Cotizaciones.jsx
  - frontend/src/components/cotizaciones/ModalCotizacion.jsx
aristas:
  depende_de: [modulo/facturacion]
  relacionado: [leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-09-24
---

Sección 10 del checklist, cerrada el 2026-09-24. Hasta ahí vivían en Alegra
(`/estimates`) y facturarlas creaba la factura en Alegra: era el último camino
de venta que salía de la casa.

**Lo que no se ve leyendo una sola función:**

- **El estado no se guarda.** `SELECT_CABECERA` lo calcula —facturada si
  tiene una factura no anulada, vencida si pasó `vence` con el día de Costa
  Rica, vigente si no—. Anular la factura devuelve la cotización a vigente
  sola, y se puede facturar otra vez (pisa `factura_id`).
- **Facturar es una sola transacción.** `crearFacturaEnTransaccion` (de
  `facturaPropia.service.js`) crea la factura sobre la misma conexión que
  marca la cotización, tomada `FOR UPDATE`. Un doble clic espera al primero y
  devuelve la misma factura. No usa `factura_intento`: sus claves
  `cotizacion-<id>` son de ids de Alegra y chocarían con los propios.
- **El precio que se factura es el cotizado**; la tarifa, la del maestro de
  hoy. Las líneas se arman con el mismo `armarLineas` de facturación para
  que cotización y factura redondeen igual.
- **El número viene de `serie_consecutivo` (tipo `cotizacion`, sin
  prefijo)** y no se reusa al borrar. Continúa el de Alegra (la 2 → la 3).
  `tomarConsecutivo` de facturación no sirve porque exige prefijo.
- **Los enlaces públicos viejos siguen abriendo.** Ver la lección enlazada:
  las propias se firman en otro espacio y un token de Alegra se busca por
  `alegra_id`.
- **Se borra de verdad** (no es documento fiscal), salvo si alguna vez se
  facturó —aunque su factura se haya anulado—: la factura dice "Cotización N".

Antes del corte hay que volver a correr `cargar-cotizaciones.js`: en `main`
se siguen haciendo en Alegra, y el script sube la serie si encuentra alguna
mayor.
