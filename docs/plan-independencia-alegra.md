# Plan: independizarnos de Alegra

> Estado actualizado, 2026-10-05: el inventario propio ya está construido y
> la apertura provisional en CERO fue autorizada por el usuario; el conteo
> real completo se hará al salir a producción. La aplicación ya no usa
> Alegra. Para ejecutar la migración consultar el
> [plan operativo de corte](plan-corte-independencia.md), el checklist y el
> grafo de esta rama. Hacienda fue autorizada y su integración está implementada;
> la aceptación real con credenciales sigue pendiente, ver el
> [plan fiscal ejecutado](plan-integracion-hacienda.md).
> este plan inicial no sustituye el estado actual ni autoriza el corte.


Rama: `independencia-alegra` · Medido el 11 de setiembre de 2026 contra
producción (solo lectura).

> **Decisión histórica, 11 de setiembre de 2026; aplazamiento reemplazado el 5 de octubre.** Por decisión del usuario entonces:
>
> - El paso a factura electrónica (Fase 0 y emisor propio) **queda
>   pospuesto**.
> - El trabajo se concentra en que los módulos y los datos dejen de depender
>   de Alegra.
> - La lista de tareas está en `checklist-independencia-alegra.md`.
> - Todo va solo en esta rama; `developer` y `main` siguen híbridos.

## 1. Qué hace Alegra hoy por nosotros

Alegra cumple tres papeles distintos, y salir de Alegra obliga a reemplazar
los tres:

1. **Emisor ante Hacienda.** Firma el XML, lo envía, consulta el estado y
   guarda el sello. Es el único papel con obligación legal y el de más
   riesgo.
2. **Base de datos maestra.** Productos, clientes, existencias, facturas,
   pagos y compras viven allá. Lo nuestro son copias parciales que se
   sincronizan.
3. **Utilidades.** PDF de la factura, anulación, notas de crédito y el
   hospedaje de las fotos de productos.

### Cuánto dependemos (medido)

| | |
|---|---|
| Módulos del backend que llaman a Alegra | 18 |
| Código de la integración | 2.195 líneas |
| Referencias a Alegra fuera de la integración | 1.645 líneas en 83 archivos del backend · 669 líneas en 100 archivos del frontend |
| Columnas `alegra_*` en la base | 10 |
| Rutas distintas de la API de Alegra | 20 (`/items`, `/invoices`, `/contacts`, `/bills`, `/payments`, `/estimates`, `/credit-notes`, `/inventory-adjustments`, …) |
| Tareas periódicas que sincronizan | productos cada 6 h, cuentas por cobrar cada 30 min, historial de clientes, fotografía de márgenes, auditorías |

### Qué datos hay en Alegra y qué ya tenemos

| En Alegra | Cantidad | Copia local hoy |
|---|---|---|
| Facturas de venta | 5.398 (desde 2024-06-03) | `venta_historico` 52.089 líneas (sin totales, sin impuestos, sin sello) |
| Productos | 2.130 | `alegra_products_cache` 2.118 (sin existencias ni CABYS) |
| Contactos | 278 (204 clientes, 34 proveedores) | `cliente_portal` 11 |
| Compras | 1.447 | `facturas_proveedores` 862 **con su XML** |
| Pagos | 1.349 | `abonos_cobro` 133 |
| Notas de crédito | 27 | — |
| Existencias | 2.013 productos inventariables | **ninguna** |

Lo que **no existe** en el sistema: armado y firma del XML, clave y
consecutivo, envío y consulta a Hacienda, mensaje receptor, existencias y un
maestro de clientes completo.

## 2. Hallazgo que va antes que todo lo demás

**La mayoría de las ventas no se emite como comprobante electrónico.**

| Mes | Facturas | No electrónicas | % del monto |
|---|---|---|---|
| 2026-05 | 80 | 71 (89 %) | 83 % |
| 2026-06 | 191 | 177 (93 %) | 87 % |
| 2026-07 | 189 | 167 (88 %) | 85 % |
| 2026-08 | 179 | 158 (88 %) | 84 % |
| 2026-09 (al día 10) | 64 | 55 (86 %) | 78 % |

- Salen por la serie 1, "Factura de Venta", que no es electrónica ni lleva
  sello. **Ninguna se convierte después:** todas las de más de 7 días siguen
  igual.
- **Causa técnica:** Facturación no le indica serie a Alegra al crear la
  factura, y la serie predeterminada de la cuenta es la 1. La electrónica es
  la 17 (va por el consecutivo 2.462); el tiquete electrónico es la 3.
- El módulo `duplicados-electronica` existe justamente por el flujo de
  "emitir normal y convertir después".

Estamos en régimen tradicional, así que toda venta se respalda con
comprobante electrónico: factura o tiquete. Un sistema propio "con todo lo
que pide Hacienda" **no tiene un camino no electrónico**, y este plan lo
elimina por diseño.

Esto no depende de salir de Alegra: se puede corregir ya, mandando la serie
electrónica al facturar. Como cambia las ventas declaradas y el IVA, hay que
**acordarlo con el contador antes de activarlo**, incluido qué hacer con lo ya
emitido. Ver la Fase 0.

## 3. Qué pide Hacienda (versión 4.4)

La versión 4.4 es obligatoria desde el 1 de setiembre de 2025. TRIBU-CR
reemplazó a ATV en octubre de 2025; ahí se tramitan la llave criptográfica y
las credenciales de la API.

### Comprobantes

| Documento | ¿Aplica? |
|---|---|
| Factura electrónica | Sí: venta a cliente identificado |
| Tiquete electrónico | Sí: consumidor final o cliente sin identificación |
| Nota de crédito electrónica | Sí: devoluciones, anulaciones, descuentos posteriores |
| Nota de débito electrónica | Sí, poco uso |
| Mensaje receptor (aceptar o rechazar compras) | Sí: sin él se puede objetar el crédito de IVA |
| Factura electrónica de compra | Solo con proveedores que no emiten. Hoy las compras en Alegra **no** se envían a Hacienda (0 de 30 con sello), así que no hay un problema abierto |
| Recibo electrónico de pago (REP) | Solo con IVA diferido o servicios al Estado. En la cuenta el IVA diferido está **desactivado**: hoy no aplica |
| Factura de exportación | No aplica |

### Requisitos técnicos

- **XML 4.4 validado contra el XSD oficial** antes de enviarlo.
- **Firma XAdES-EPES** con la llave criptográfica `.p12` y su PIN (RSA 2048,
  SHA-256).
- **Clave de 50 dígitos:** país, fecha, cédula del emisor, consecutivo,
  situación y código de seguridad.
- **Consecutivo de 20 dígitos:** sucursal (3), terminal (5), tipo (2) y número
  (10). El de Alegra hoy es `001 00001 01 …`.
- **Autenticación OAuth2** contra `idp.comprobanteselectronicos.go.cr`
  (`api-stag` para pruebas, `api-prod` para producción).
- **Envío** a `api.comprobanteselectronicos.go.cr/recepcion/v1/`, y consulta
  del estado hasta que quede *aceptado* o *rechazado*.
- **Contingencia:** si Hacienda o internet caen, el comprobante se emite con
  situación de contingencia y se envía después.
- **Entrega** del XML y el PDF al cliente. La 4.4 admite hasta 4 correos por
  receptor.
- **Conservación por 5 años** de todo lo emitido, lo recibido y las
  respuestas de Hacienda, sin posibilidad de alterarlo.

### Campos nuevos o más estrictos en la 4.4

- **Proveedor de sistemas.** Identifica quién hizo el software. Con desarrollo
  propio lo más probable es que vaya la cédula de la empresa: **confirmar**.
- **Actividad económica del emisor.** En Alegra está registrada la 523402.
- **Actividad económica del receptor.** ~~Obligatoria en facturas y notas que
  identifican al cliente; según las guías, Hacienda **rechaza** el comprobante
  si falta.~~ **No se pide (decisión del usuario, 2026-10-11).** El esquema
  oficial la trae como opcional y 243 de las 247 facturas 4.4 de este emisor
  que Hacienda aceptó no la llevan. Ver `docs/grafo/modulo/hacienda.md`.
- **Medios de pago detallados**, incluido SINPE Móvil.
- **CABYS en cada línea.**
- **Medicamentos:** registro sanitario y forma farmacéutica.

## 4. Datos que faltan (bloquean la emisión)

| Dato | Estado | Consecuencia |
|---|---|---|
| Actividad económica del cliente | **2 de 204** clientes la tienen | ~~Facturas rechazadas~~ Ya no bloquea: es opcional (2026-10-11) |
| Correo del cliente | 28 de 204 | No hay a dónde entregar el comprobante; buscar alternativa (portal o WhatsApp) |
| Identificación del cliente | 195 de 204 | Los 9 restantes solo pueden recibir tiquete |
| Medicamentos: registro sanitario | **0 de 8** | Esas líneas no se pueden facturar en 4.4 |
| Medicamentos: forma farmacéutica | 2 de 8 | Igual |
| CABYS de productos | 2.013 de 2.013 | Listo |
| Impuesto del producto | 2 sin configurar | Corregir |
| Existencias | **457 negativas** | El inventario propio no puede arrancar de estos números |

**Nota sobre la actividad del receptor.** Hay 34 facturas electrónicas
recientes *aceptadas* y solo 2 clientes con actividad registrada. O esas
facturas fueron a esos 2 clientes, o Alegra llena el campo por otra vía.
**Revisar el XML de una de esas facturas antes de dar el dato por bueno**
(Fase 0).

**Cómo completar la actividad sin tipearla.** Hacienda tiene una consulta
pública por cédula que devuelve las actividades económicas del contribuyente
(`api.hacienda.go.cr/fe/ae?identificacion=`). Hay que verificar que siga
disponible; si lo está, llena casi todo de forma automática.

## 5. Cómo queda el sistema

```
Pantallas ─▶ API propia ─▶ Postgres (fuente de verdad)
                               │
                               ├─▶ cola de emisión ─▶ integrations/hacienda ─▶ Hacienda
                               │     (firma, envío, consulta, contingencia, reintentos)
                               ├─▶ PDF (pdfkit, ya en uso) · correo (nodemailer) · WhatsApp (ya existe)
                               └─▶ archivo de 5 años (XML firmado + respuesta, con hash)
```

### Tablas nuevas

Todas se agregan sin tocar las existentes:

- **`producto`:** CABYS, impuesto, unidad, datos de medicamento, costo,
  precio y fotos en almacenamiento propio.
- **`cliente`:** tipo y número de identificación, actividades, hasta 4
  correos, teléfonos, condiciones de crédito. **`proveedor`** va por cédula.
- **`movimiento_inventario`** (kardex) y **`existencia`**, derivada de los
  movimientos.
- **`comprobante`** y **`comprobante_linea`:** tipo, clave, consecutivo,
  situación, estado ante Hacienda, XML firmado, XML de respuesta, copia fija
  del receptor y totales. **Nunca se editan:** una corrección es una nota de
  crédito.
- **`consecutivo`:** por sucursal, terminal y tipo, tomado con bloqueo
  transaccional para que dos ventas no reciban el mismo número.
- **`documento_recibido`** y **`mensaje_receptor`:** las compras. Ya llegan
  por correo; hoy hay 862 XML guardados.
- **`pago`** y **`abono`:** cuentas por cobrar y por pagar.

### El emisor

- **Librería.** Recomiendo `@dojocoding/hacienda-sdk`: licencia MIT,
  TypeScript, 780 pruebas; cubre factura, tiquete, notas, compra, REP,
  mensaje receptor y contingencia. Va detrás de una interfaz propia, con la
  versión fija y el código de firma revisado. Tiene 10 estrellas y es un
  proyecto chico: la interfaz permite cambiarlo o reemplazarlo sin tocar el
  resto.
- **Node 22.** La librería lo exige. Hoy `package.json` pide `>=18`; hay que
  subirlo y confirmar la versión en Render.
- **La venta no espera a Hacienda.** Se guarda con su clave y consecutivo
  (idempotente por clave, como ya hace `factura_intento`) y se firma y envía
  en segundo plano.
- **Secretos.** El `.p12`, el PIN y las credenciales de la API van en
  variables de entorno de Render, nunca en git. Pruebas y producción usan
  credenciales separadas.

## 6. Fases

Cada fase deja el sistema funcionando en producción. Nada se corta de golpe.

### Fase 0 — Decisiones y cumplimiento inmediato (sin salir de Alegra)

- **Reunión con el contador:**
  - serie electrónica por defecto;
  - qué hacer con las facturas no electrónicas ya emitidas;
  - quién envía hoy el mensaje receptor de las compras;
  - qué va en *proveedor de sistemas*;
  - confirmar que el REP no aplica.
- **XML de Alegra:** bajar el de una factura electrónica aceptada y ver qué
  lleva en la actividad del receptor.
- **TRIBU-CR:** llave criptográfica y credenciales **de pruebas**.
- **Facturación:** con el visto bueno del contador, mandar la serie
  electrónica (factura 17 o tiquete 3). Es un cambio de pocas líneas con
  mucho efecto.

**Sale cuando:** las ventas nuevas salen electrónicas y las preguntas al
contador tienen respuesta.

### Fase 1 — Datos completos (Alegra sigue emitiendo)

- **Actividad económica** de los 202 clientes que no la tienen, con la
  consulta pública de Hacienda.
- **Correos** o una vía de entrega para 176 clientes.
- **Registro sanitario y forma farmacéutica** de los 8 medicamentos.
- **Impuesto** de los 2 productos que no lo tienen.
- **Conteo físico** con Auditoría de Inventario para sanear las 457
  existencias negativas.

**Sale cuando:** no queda ningún bloqueador de la sección 4.

### Fase 2 — Base propia en sombra

- **Tablas nuevas** con migraciones aditivas.
- **Carga inicial** desde Alegra: productos, clientes, existencias y las
  5.398 facturas.
- **Sincronización continua** Alegra → local mientras Alegra siga emitiendo.
- **Conciliación diaria:** totales de venta, existencias y saldos, con alerta
  si difieren.
- **Verificar la exportación desde Alegra** del XML firmado y la respuesta de
  Hacienda de cada comprobante. Hay que conservarlos 5 años aunque dejemos
  Alegra.

**Sale cuando:** la conciliación da cero diferencias durante 2 semanas.

### Fase 3 — Emisor propio en pruebas

- **`integrations/hacienda`** contra `api-stag`: factura, tiquete, notas,
  mensaje receptor, contingencia y manejo de rechazos.
- **Pruebas automáticas con dobles.** Nunca contra producción.

**Sale cuando:** hay documentos de cada tipo aceptados en el ambiente de
pruebas, los rechazos se entienden y se corrigen, y la contingencia está
probada.

### Fase 4 — Corte de facturación

- **Terminal propia.** El emisor propio usa **otra terminal** (por ejemplo
  `001 00002`) para no chocar con los consecutivos de Alegra (`001 00001`).
  Hay unicidad de clave en la base.
- **Pocos días de convivencia** con reversa preparada: volver a Alegra si
  los rechazos pasan un umbral.
- **Se apagan** el módulo de duplicados y la creación de facturas en Alegra.

**Sale cuando:** una semana de facturación real sin rechazos sin resolver.

### Fase 5 — El resto de los módulos

En orden de riesgo:

1. Inventario: kardex y ajustes.
2. Compras: registro desde el XML recibido y mensaje receptor.
3. Cuentas por cobrar, pagos y abonos.
4. Cotizaciones.
5. Catálogo y fotos: las URL de Alegra vencen a los 7 días, así que las fotos
   pasan a almacenamiento propio.
6. Reportes.

Se retira cada tarea de sincronización cuando su módulo ya no la necesita.

### Fase 6 — Apagado de Alegra

- **Exportación final:** XML, respuestas, PDF y pagos.
- **Conciliación de cierre.**
- **Alegra en solo lectura** unos meses y después se cancela.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Rechazos de Hacienda en producción | Pruebas completas en staging, corte gradual, reversa a Alegra |
| Consecutivo o clave duplicados | Terminal distinta, índice único, bloqueo transaccional |
| Perder la llave o el PIN, o que la llave venza | Guardado en secretos con respaldo; alerta antes del vencimiento |
| Hacienda caída | Contingencia más cola con reintentos; la venta no se bloquea |
| No conservar lo que emitió Alegra | Exportar y verificar antes de cancelar (Fase 2 y Fase 6) |
| Inventario propio arranca con basura | Conteo físico antes de la carga (Fase 1) |
| Cambio enorme (183 archivos) que rompe producción | Por fases, detrás de interfaces; la rama se actualiza seguido desde `developer` |
| La base local es producción | Migraciones solo aditivas; pruebas con dobles; nada destructivo |
| Librería chica | Interfaz propia, versión fija, código de firma revisado |

## 8. Decisiones pendientes

1. ¿Se activa ya la serie electrónica por defecto? (contador)
2. ¿Qué se hace con las facturas no electrónicas emitidas? (contador)
3. ¿Quién envía hoy el mensaje receptor de las compras?
4. ¿Qué va en *proveedor de sistemas*?
5. Para clientes sin correo: ¿tiquete, portal o WhatsApp?
6. ¿La contabilidad se sigue llevando en Alegra o con el contador? Define si
   la Fase 6 puede cancelar la cuenta.

## Fuentes

- [Hacienda — Comprobantes electrónicos y versión 4.4](https://www.hacienda.go.cr/docs/ComprobantesElectronicos-GeneralidadesyVersion4.4.marzo2025.pdf)
- [Siempre al Día — Facturación electrónica 2026, guía 4.4](https://siemprealdia.co/costa-rica/impuestos/novedades-en-facturacion-electronica/)
- [Siempre al Día — Recibo electrónico de pago](https://siemprealdia.co/costa-rica/impuestos/recibo-electronico-de-pago-rep/)
- [Siempre al Día — Comprobantes recibidos en TRIBU-CR](https://siemprealdia.co/costa-rica/impuestos/comprobantes-electronicos-recibidos-en-tribu-cr/)
- [Siempre al Día — TRIBU-CR 2026](https://siemprealdia.co/costa-rica/impuestos/plataforma-tribu-cr/)
- [Facturele — Actividad económica del receptor en 4.4](https://www.facturele.com/2025/07/22/codigo-de-actividad-economica-cr-4-4/)
- [CRLibre — API_Hacienda](https://github.com/CRLibre/API_Hacienda)
- [CRLibre — URL de la API de comprobantes](https://crlibre.org/preguntas/url-de-api-de-comprobantes-electronicos/)
- [DojoCodingLabs — hacienda-cr](https://github.com/DojoCodingLabs/hacienda-cr)
- [HuliPractice — Conservación de facturas electrónicas](https://help.hulipractice.com/es/articles/1340031-como-se-deben-almacenar-y-conservar-las-facturas-electronicas-en-costa-rica)
- [Hacienda — Resolución DGT-R-48-2016](https://www.hacienda.go.cr/docs/Resolucion_Comprobantes_Electronicos_DGT-R-48-2016_v4.1.pdf)
- [Facturar Online — Qué cambió en 4.4](https://facturaronline.com/blog/facturacion-electronica-4-4-costa-rica/)

## Actualización 2026-10-05: Hacienda autorizada

El usuario reemplazó el aplazamiento y pidió implementación completa dentro
del proyecto, en carpetas propias. Ver [plan ejecutado](plan-integracion-hacienda.md),
[arquitectura](../backend/src/integrations/hacienda/README.md) y
[nodo Hacienda](grafo/modulo/hacienda.md). La 4.4 vigente, configuración con
.p12 y API, firma, FE/TE/NC y mensajes receptor están implementados.
La aceptación real con sus credenciales y el corte siguen pendientes;
no se reemiten históricos. Revisiones manuales y conteo: usuario.
