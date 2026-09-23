---
id: leccion/la-db-local-es-produccion
tipo: leccion
titulo: En los worktrees main/developer, "local" es producción
estado: vigente
archivos:
  - backend/config/database.js
aristas:
  relacionado: [bloqueo/prisma-no-se-regenera]
medido: 2026-09-23
---

En el worktree `sistema-facturas-cr` (`main`/`developer`), `backend/.env`
apunta al MISMO Supabase que usa producción (Render). No hay base de pruebas
separada: un script de verificación que escribe toca los datos reales del
negocio. Lo mismo vale para Alegra y para el buzón de Gmail: también son los
de producción.

Solo el worktree `sistema-facturas-cr-independencia` (rama
`independencia-alegra`) tiene una base propia, aislada por
`backend/config/aislado.js` en esa rama (`DATABASE_URL` tiene que resolver a
`localhost`/`127.0.0.1`, si no lanza `BASE_NO_AISLADA`; y bloquea las salidas
a Alegra, WhatsApp y correo).

TRES VECES QUE COSTÓ

1. **2026-07-21 — un reintento duplicó un lote.** Un `curl -m 180` a
   `generar-excesos` dio timeout del lado del cliente; Express no cancela el
   trabajo porque el cliente se desconecte, así que el servidor siguió. Un
   segundo `curl` creó un lote "Excesos N" duplicado, real, que hubo que
   limpiar a mano.
2. **2026-08-16 — una verificación cambió descuentos reales.** Probando el
   arreglo de excesos se corrió `aplicarDescuentoTanda` contra las tandas #41
   y #33 reales: bajó de 40 % a 30 % el descuento de 2 productos y creó 2
   filas en una tanda que nadie había pedido tocar. Se pudo reconstruir de
   casualidad.
3. **2026-09-04 — una cotización real, borrada para siempre.** Para comprobar
   que `DELETE /cotizaciones/:id` rechazaba una ya facturada, se apuntó a la
   cotización #1 real asumiendo que estaba facturada. No lo estaba: la guarda
   la dejó pasar, como debía, y se borró. Alegra no la conserva.

CÓMO APLICARLO

- Antes de que algo escriba, decidir cómo se revierte. Preferir leer y
  simular (correr el SELECT que usaría la función) sobre ejecutar.
- Si hay que escribir, capturar antes el estado previo de lo que se va a tocar
  y decirle al usuario qué se movió.
- Un endpoint destructivo se prueba SOLO contra un registro creado para eso,
  llevado antes al estado que debe bloquearlo. Si no se puede, ese camino
  queda cubierto por pruebas con dobles, y se dice.
- Para ver una pantalla en un navegador, bloquear en el navegador toda
  petición que no sea GET.
- Después de un timeout, NO reintentar: primero comprobar si el efecto ya
  ocurrió.
