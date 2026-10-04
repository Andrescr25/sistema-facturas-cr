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
aristas:
  relacionado: [bloqueo/prisma-no-se-regenera, tabla/supplier-product-mapping, modulo/relacionar-productos]
medido: 2026-10-03
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
