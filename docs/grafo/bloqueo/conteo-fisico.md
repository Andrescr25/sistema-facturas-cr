---
id: bloqueo/conteo-fisico
tipo: bloqueo
titulo: Conteo real al salir a producción — no bloquea construir inventario
estado: vigente
archivos:
  - backend/src/modules/inventario-auditorias/inventario-auditorias.service.js
aristas:
  relacionado: [modulo/inventario, tabla/compra-linea, decision/inventario-desde-cero]
medido: 2026-10-05
---

DECISIÓN RESUELTA POR EL USUARIO, 2026-10-04. Inventario y auditorías desde
cero provisional; conteo completo al salir a producción porque el físico está
desordenado. [[decision/inventario-desde-cero]]. No volver a pedir elegir una
estrategia ni esperar el conteo para desarrollar. El kardex, operaciones,
auditorías, excesos y pantalla están implementados: [[modulo/inventario]].

Lo pendiente es un HECHO REAL: contar todos los productos en producción y
confirmarlos con la auditoría inicial completa. Mientras tanto, cero no
significa que físicamente no haya mercadería. La confirmación del conteo y
el día del corte no se sustituyen por fixtures o marcas del checklist.

Antes de esta autorización no había kardex propio y la auditoría ajustaba
Alegra en vivo; 457 productos de 2.013 inventariables estaban en negativo.
La copia conservaba 17 auditorías y 470 descuentos. La 042 preserva esa
historia, la excluye del inventario activo y no importa las cantidades.
El flujo viejo de devolución era DE CLIENTE; la salida a proveedor es propia
ahora. La sincronización de productos cada seis horas ya fue retirada.

Durante el conteo real, mantener quietas las operaciones y el catálogo.
Si cambian movimientos o productos, actualizar el conteo y contar otra vez;
la revisión global y el catálogo completo impiden una apertura parcial o
obsoleta. Cero físico también se escribe explícitamente, no se interpreta
un campo vacío como cero. El costo de apertura parte del maestro propio.
