---
id: modulo/inventario
tipo: modulo
titulo: Inventario — todavía no existe nada propio
estado: pospuesto
archivos:
  - backend/src/modules/inventario-auditorias/inventario-auditorias.service.js
aristas:
  bloqueado_por: [bloqueo/conteo-fisico]
  relacionado: [modulo/compras]
medido: 2026-09-20
---

Verificado el 2026-09-20: ninguna de las 20 migraciones de
`migrations/independencia/` crea `movimiento_inventario`, `existencia`,
`stock` ni `kardex`. `producto` solo tiene la bandera `inventariable`; no hay
columna de existencias. Todo lo que hoy depende de cantidades disponibles lee
`inventory.availableQuantity` de Alegra en vivo
(`inventario-auditorias.service.js`, con el comentario propio "la caché no
guarda existencias").

`compra_linea.cantidad_propia` ([[tabla/compra-linea]]) ya es una columna
GENERADA pensada para el día que exista este módulo: cuando el inventario se
mueva, se mueve en esa cantidad, no en la del proveedor.

No se empieza sin el conteo físico. Ver [[bloqueo/conteo-fisico]].
