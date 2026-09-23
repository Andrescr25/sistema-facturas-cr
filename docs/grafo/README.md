# Mapa del grafo — rama `independencia-alegra`

Por acá se entra. Cada nodo es un archivo con un frontmatter que lee la
máquina (`archivos:` que existen de verdad, `aristas:` hacia otros nodos) y un
cuerpo para la persona. `npm test` valida todo — incluido que este mapa nombre
cada nodo (`backend/tests/grafo.test.js`).

**Antes que nada, [CLAUDE.md](../../CLAUDE.md)**: los invariantes que rompen
algo real si se ignoran (en qué worktree la base es producción, qué no se
toca, qué no se regenera).

## Cómo usarlo

1. Buscá el **módulo** de lo que vas a tocar. Es el nodo con más contexto.
2. Seguí sus aristas: `depende_de` (tablas), `bloqueado_por` (qué impide
   avanzar), `relacionado`.
3. Antes de cambiar una tabla o un flujo, leé las **decisiones** y
   **lecciones** que lo tocan: dicen por qué es así y qué salió mal antes.
4. Si cambiás algo que un nodo describe, actualizalo en el mismo commit —
   `npm test` avisa en su salida qué nodos tienen código más nuevo que su
   fecha `medido`.

## Módulos

- [Compras — ya no toca Alegra para registrar una compra](modulo/compras.md)
- [Facturación de venta — ya cerrado en la migración](modulo/facturacion.md)
- [Inventario — todavía no existe nada propio](modulo/inventario.md) · *pospuesto*

## Tablas

- [La compra es nuestra, el buzón es otra cosa](tabla/compra.md)
- [La cantidad se guarda dos veces, a propósito](tabla/compra-linea.md) — `compra_linea`
- [El buzón — lo que llegó por correo, aceptado o no](tabla/facturas-proveedores.md) — `facturas_proveedores`
- [Se crea al recibir el correo, se libera al aceptar](tabla/cuentas-por-pagar.md) — `cuentas_por_pagar`

## Decisiones

- [El buzón y la compra son tablas distintas, a propósito](decision/el-buzon-no-es-la-compra.md)
- [El total del comprobante manda, no la suma de las líneas](decision/el-total-manda-sobre-las-lineas.md)
- [Los archivos grandes se guardan como ruta, no como columna](decision/la-ruta-no-el-contenido.md)
- [Caja General es el centro — todo cobro entra, todo pago sale](decision/caja-general-es-el-centro.md)

## Lecciones

- [En los worktrees main/developer, "local" es producción](leccion/la-db-local-es-produccion.md)
- [Dos funciones `texto` con firmas opuestas](leccion/dos-helpers-texto.md)

## Bloqueos

- [Inventario espera un conteo físico que es del usuario](bloqueo/conteo-fisico.md)
- [node_modules es un enlace al árbol de producción](bloqueo/prisma-no-se-regenera.md)
- [Las 882 facturas de compra viejas no tienen su XML — las nuevas sí lo guardan](bloqueo/xml-historico-sin-recuperar.md)

## El grafo de la otra rama

`developer`/`main` tienen su propio grafo, con los módulos que viven allá
(catálogo, permisos, revisión de precios, impuestos…). Cada rama describe SU código —el
validador exige que cada archivo citado exista en la rama—, y se juntan
cuando las ramas se unan.
