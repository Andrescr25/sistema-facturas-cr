# Señuelos y engañadores Favarcia — 2026-11-03

Codex continúa la limpieza de pesca solicitada por el usuario: corregir los
nombres y las imágenes con su catálogo y fijar un margen del 30 %. Alcance:
44 fichas de «Señuelos y Engañadores» (subcategoría 32). Anzuelos, otras
familias y marcas quedan conservados.

## Fuente e identificación

`catalogo_pesca.pdf`, aportado por el usuario: 47 páginas, sin precios.
SHA-256: `36bd959708942e46d10822b6d42bb807f1329259109dc9fb8ee51c967f54c669`.
Se cruza cada ficha con el código Favarcia, modelo, color, peso y empaque;
una foto parecida no acredita otra referencia. Se extraen las imágenes
originales del documento, sin generar ni reconstruir productos.

Las 39 fichas con relación de proveedor tienen compras propias registradas
en CRC del mismo producto/código/cédula, factor 1. La cédula y el código de
la relación acreditan la identidad; no se toma el costo de otro producto.
Se excluyen compras anuladas, regalías y descuentos totales.

Para dos Tracershot que no aparecen en el PDF se usa la
[ficha oficial de Mustad MJIG07](https://mustad-fishing.com/eu/products/mjig07/):
7427767 corresponde a MJIG07-PKZ-20-1, Pink Zebra, 20 g; 7427769 corresponde
a MJIG07-PNK-25-1, Pink, 25 g. Las fotos se identifican por variante real.

## Resultado en los datos

- 40 nombres corregidos, en MAYÚSCULAS y sin tildes en las vocales;
  se conserva la Ñ. Modelo, medida y empaque quedan legibles. Se corrigen
  también los pesos/modelos que no coincidían con el proveedor.
- 39 costos y precios revisados; 30 costos tenían importes incompletos y
  se corrigen con la compra propia. No se modifica la compra original.
- Margen sobre venta: costo sin impuesto / (1 − 0,30). Se reutilizan
  `calcularCostoUnitarioPropio`, `precioSinImpuesto`, `precioConImpuesto`
  y `clasificarProducto`, con la tarifa real. Se conserva el redondeo hacia
  arriba del lote de anzuelos: pasos de 5/25/100 según el importe sin IVA.
  El margen resultante está entre 30 % y 30,91 %.
- 33 precios suben, 5 bajan y uno permanece igual. Las bajas responden a la
  instrucción expresa de fijar el margen del 30 %, no a una sugerencia
  automática. Las 38 variaciones dejan historial de Gestión de Catálogo.
- 38 fotos nuevas: 36 del PDF y dos del fabricante. Cada descarga posterior
  devuelve HTTP 200 y SHA-256 idéntico al archivo subido.
- Se retiran las dos imágenes que el usuario confirma equivocadas y cuya
  referencia no aparece en el PDF; las fichas conservan su precio y venta.

El empaque sigue siendo la unidad propia confirmada por las compras: por
ejemplo, el plumero 7427191 se vende por su presentación de 12 piezas.
No se divide su costo por doce ni se modifica el factor de conversión.

### Retirados de la venta

El usuario autoriza eliminar las fichas sin código de proveedor. Se
desactivan, conservando ids, documentos, relaciones y existencias:

| Id | Referencia anterior | Motivo |
| --- | --- | --- |
| 366 | C05 | Caja de cinco señuelos sin código identificable |
| 835 | EYE21 | Big Eye sin código/color confirmado |
| 844 | zip02 | Zippy duplicado, sin compras ni relación propia |
| 1803 | 121 | Superficie de 90 mm sin modelo/código confirmado |

No se borran físicamente ni se trasladan documentos al Zippy identificado.

### Pendientes de información

| Código Favarcia | Ficha | Información pendiente |
| --- | --- | --- |
| 7427625 | 830, LF012-10, 15 g gris/blanco tornasol | Costo con IVA |
| 7427325 | 1784, HB202-02, 100 mm / 11 g | Foto correcta |
| 7427768 | 432, camarón transparente, 5 piezas, 8 cm / 9 g | Foto correcta |

El usuario elige **conservar 830 pendiente de costo**: nombre y foto se
corrigen; descripción indica el código y la pendiente. Costo/precio
anteriores permanecen intactos, sin afirmar que ya cumpla el margen nuevo.
No se inventa una compra ni se crea una relación de proveedor a partir de
una fotografía. Los otros dos quedan sin imagen hasta recibir la auténtica.

## Aplicación y conservación

Primero se ensaya en una copia desechable propia de PostgreSQL con ROLLBACK.
La aplicación real, 2026-11-03 17:43:11 CR, usa los servicios existentes de
producto/estado/bitácora, adaptados a una transacción mediante
`baseEnTransaccion`. Se bloquean las fichas en orden de id y se exige que
coincidan con la revisión previa; compras, factores e impuestos se vuelven
a comprobar antes de escribir. No se aplican migraciones de esquema.

Respaldo previo privado:
`~/.local/share/sistema-facturas-cr/respaldos/20261103-senuelos-favarcia-codex/`.
Incluye plan, todas las fichas, marcas, historial previo y huellas de diez
tablas. Las 44 fotos previas se descargan antes del cambio en
`~/.local/share/sistema-facturas-cr/codex-senuelos-favarcia-20261103/fotos-actuales/`.

La transacción deja 46 bitácoras y 38 historiales; conserva exactamente el
resto del maestro, marcas y diez tablas: relaciones, facturas/líneas,
compras/líneas, pagos, CxP, inventario, costo histórico y líneas del buzón.
Las fotos se cargan después por la API existente, con la sesión real del
usuario y otras 38 bitácoras, sin exportar JWT o contraseñas. No hay envíos
de prueba, movimientos de inventario ni aceptación de compras nuevos.

Una conexión nueva READ ONLY comprueba las fichas completas, las 84
bitácoras, los 38 historiales y la conservación de las demás fichas/marcas.
Ambas API públicas devuelven exactamente 40 productos activos de la familia,
con nombres, precios y fotos esperados, sin los cuatro retirados ni costos
de compra expuestos. Los respaldos y resultados privados no se comitean.

## Redondeo visible del agente

El recorrido descubre que 1.650 sin IVA al 13 % se convertía internamente
en 1.864,499999…; el agente mostraba ₡1.864 y clientes ₡1.865. El ayudante
existente `precioCatalogoAgente` reutiliza ahora `redondearDinero` antes del
formato, tanto al incluir impuesto como al aplicar descuento. Así coinciden
tarjeta, presentación y vista previa con los céntimos del servidor. No se
acumulan descuentos ni se vuelve a descontar una baja de precio.

La regresión verifica el caso real, el descuento fraccionario y las tarifas
0/1/2/4/8/13 %. Se conserva la estructura y no se añade otro formateador.

## Verificación

- Ensayo final local con ROLLBACK y comprobaciones de conservación.
- 87 pruebas dirigidas de productos, precios, fotos y base local correctas.
- Suite completa por archivo: 272 archivos, 3.327 pruebas correctas,
  ningún fallo y tres omisiones históricas del ensayo de corte.
- Build y lint del ayudante correctos.
- Portal real: 160 comprobaciones en Chromium/WebKit, a 390/1280 px.
- Agente con el build corregido: 80 comprobaciones locales a 390/1280 px,
  usando las respuestas públicas verificadas de esta familia y metadatos
  capturados; imágenes desde los archivos originales. Las API locales se
  interceptan, sin desarrollar contra la base de producción.
- Se comprueban las 40 tarjetas, carga de las 38 imágenes, precios y ocho
  ejemplos de vista previa, sin errores JS ni desbordes. Los productos sin
  imagen usan el estado vacío esperado. Las acciones ajenas a GET se bloquean.

La suite usa un clon desechable propio, configuraciones fiscales sin secretos
reales y una fecha de pagos anterior para separar las salidas reales del día
de los cobros sintéticos. Corre por archivo en serie para que las pruebas de
huellas no se crucen con secuencias de otros casos. Se mantienen las tres
omisiones históricas de los dos archivos del ensayo de corte, que requieren
el estado anterior a iniciar operaciones, no la copia actual de producción.
No se cambia código de Hacienda, caja o inventario para acomodar esos datos.

El ajuste de frontend no necesita SQL: los datos del lote ya están aplicados
y no deben reaplicarse al publicar el código de redondeo.
