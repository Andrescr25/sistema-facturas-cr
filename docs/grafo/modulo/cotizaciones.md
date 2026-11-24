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
  - backend/src/modules/cotizaciones/descuentoCotizacion.js
  - frontend/src/components/cotizaciones/CampoDescuento.jsx
  - frontend/src/utils/descuentoCotizacion.js
  - backend/tests/cotizacion.test.js
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

## Descuento de la cotización — 2026-11-24

El usuario: «agrégale el campo descuento % a cotizaciones porque la edité y
perdió el 5 %». Antes la pantalla no cotizaba con descuento, y editar volvía a
armar las líneas en cero: así se perdió el 5 % de la cotización 6 (TOSCANA),
que se había creado con un guion.

- **Uno solo para toda la cotización**, guardado en CADA línea
  (`descuento_porcentaje`), como el descuento de un producto en la factura.
  No hay columna nueva: `descuentoDeLineas` lo lee de las líneas (`null` si
  difieren, solo en una copiada de Alegra). El PDF y el enlace muestran el
  precio rebajado, con «Antes del descuento» y «Descuento (N %)» arriba del
  subtotal. Facturarla copia el descuento a la factura.
- **Editar no lo borra.** Si no llega `descuentoPorcentaje` (una pestaña
  vieja), se conserva el que tenía.
- **Pide «Cambiar precio y descuento»** (`precio-factura`), como en
  Facturación. Sin él se edita la cotización, pero el descuento queda igual:
  ponerlo o cambiarlo responde 403.

