---
id: leccion/el-doble-de-prisma-no-valida-tipos
tipo: leccion
titulo: Un doble de Prisma no valida tipos — un NULL donde el cliente espera un texto revienta todas las lecturas
estado: vigente
archivos:
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/migrations/independencia/038_relacion_de_compra_por_producto_propio.sql
  - backend/tests/relacionPropia.test.js
  - backend/prisma/schema.prisma
  - backend/src/modules/pagos-proveedores/cuentasPorPagar.lectura.js
  - backend/tests/cuentaPorPagarSinFactura.test.js
aristas:
  relacionado: [bloqueo/prisma-no-se-regenera, tabla/supplier-product-mapping, modulo/relacionar-productos, tabla/cuentas-por-pagar]
medido: 2026-10-29
---

**Qué pasó (2026-10-03).** Para que un producto sin ficha en Alegra se
pudiera relacionar, la migración 038 soltó el NOT NULL de
`supplier_product_mapping.alegra_item_id` y el código empezó a guardar NULL
ahí. Las 1.693 pruebas pasaron. En el navegador, relacionar funcionó — y al
recargar, la factura ya no abría: `GET /productos-revision/factura/:id`
respondía 500.

```
Error converting field "alegraItemId" of expected non-nullable type "String",
found incompatible value of "null".   (P2032)
```

**Por qué.** El cliente de Prisma generado declara `alegraItemId` y
`alegraName` obligatorios, y en esta rama no se regenera
([[bloqueo/prisma-no-se-regenera]]). Prisma valida cada fila que LEE: una
sola con NULL hace fallar la consulta entera. Y al mapeo lo leen con Prisma
unos treinta lugares en cinco archivos —el buzón al recibir una factura,
Revisión de Precios, el catálogo, abrir una factura para relacionarla—, casi
siempre como `include: { mapeo: true }` de otra cosa. Una fila mala no rompe
"su" pantalla: rompe todas.

**Por qué no lo vieron las pruebas.** Las pruebas contra PostgreSQL corren en
una transacción que se deshace, y Prisma abre su propia conexión, así que se
reemplaza por un doble que lee de la misma. Ese doble devuelve lo que haya en
la fila; no sabe qué tipos espera el cliente. Lo que probaba era el SQL, no
la lectura.

**Cómo quedó.**

- El mapeo de un producto sin ficha guarda **`''`**, no NULL
  (`SIN_FICHA_EN_ALEGRA`). Prisma lo lee, en JavaScript vale como "no tiene",
  y no cruza con ningún id real (medido: ningún producto ni fila de la caché
  tiene el id vacío). En la línea y en `costo_historico` sí va NULL: ahí el
  cliente lo tiene opcional.
- La migración deja las dos columnas **NOT NULL**: no depende de acordarse.
- El doble de `relacionPropia.test.js` ahora falla con NULL, igual que el
  cliente. Y tres pruebas amarran lo que tiene que coincidir: lo que exige el
  cliente generado (`Prisma.dmmf`), lo que permite la columna, y lo que
  escribe el código. El día que se regenere el cliente con el campo opcional,
  la primera falla y avisa que `''` puede volver a ser NULL.

**La regla.** En esta rama, una columna que el cliente de Prisma declara
obligatoria no se puede dejar en NULL aunque la base lo permita. Antes de
soltar un NOT NULL de una tabla vieja: mirar `Prisma.dmmf` y contar quién la
lee con Prisma. Y lo que solo se probó con dobles, abrirlo en el navegador.

## Caso 2 (2026-10-29) — la factura de compra a mano y Pagos a Proveedores

**Qué pasó.** La «factura de compra a mano» (2026-10-25) crea su cuenta por
pagar sin factura del buzón: `factura_id` NULL. La columna lo permitía, pero
el cliente de Prisma declara `facturaId` obligatorio y la lista de Pagos a
Proveedores la leía con `findMany`. Al cargarse la primera factura a mano, la
pantalla respondió 500 («Error obteniendo cuentas por pagar», P2032 «Error
converting field "facturaId"…»). Una sola fila bastaba para tumbar todas.

**Por qué no lo vimos.** Las pruebas de la compra a mano comprobaban que la
cuenta se CREABA, no que la lista de la pantalla pudiera LEERLA; y esa lectura
estaba en un servicio que el grafo daba por migrado a `pg` (decía que
`pagosProveedoresService.js` ya seguía la regla) pero conservaba dos lecturas
con Prisma. Fue la misma regla de arriba, con la misma señal («cuenta cuántos
la leen con Prisma»), y no se aplicó al escribir NULL en una columna de una
tabla vieja.

**Cómo quedó.** Las cuentas se leen y se anotan con `pg`
(`cuentasPorPagar.lectura.js`); el servicio ya no importa Prisma. La prueba
`cuentaPorPagarSinFactura.test.js` crea las cuentas con el MISMO código de la
compra a mano y las lee como la pantalla, y otra impide que vuelva a haber un
`prisma.cuentaPorPagar.findMany/update` en el backend. Se comparó, proveedor
por proveedor, el servicio viejo con el nuevo: mismos datos y mismo resumen
(solo cambia el orden de dos cuentas con el mismo vencimiento exacto, que
Prisma no ordenaba).

**La regla, ampliada.** No basta con mirar `Prisma.dmmf` antes de soltar un
NOT NULL: cada vez que una funcionalidad nueva escribe NULL (o un valor
distinto) en una tabla vieja, hay que abrir las pantallas que LEEN esa tabla
—todas— con una fila de esa clase, no solo comprobar que la fila se creó.
