---
id: bloqueo/conteo-fisico
tipo: bloqueo
titulo: Inventario espera un conteo físico que es del usuario
estado: vigente
archivos:
  - backend/src/modules/inventario-auditorias/inventario-auditorias.service.js
aristas:
  relacionado: [modulo/inventario, tabla/compra-linea]
medido: 2026-09-20
---

Bloquea los 9 ítems de la sección 5 (Inventario) del checklist, y con ellos
retirar `alegra_products_cache` del todo: mientras las existencias sigan
viviendo solo en Alegra, algo va a tener que seguir leyendo esa caché.

DE QUIÉN DEPENDE: del usuario, no de código. No se puede migrar "cuánto hay
de cada producto" sin un conteo físico que confirme el punto de partida —
migrar los números de Alegra tal cual arrastraría cualquier descuadre que ya
tuvieran.
