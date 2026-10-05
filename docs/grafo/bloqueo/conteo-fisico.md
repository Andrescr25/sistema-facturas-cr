---
id: bloqueo/conteo-fisico
tipo: bloqueo
titulo: Inventario espera un conteo físico que es del usuario
estado: vigente
archivos:
  - backend/src/modules/inventario-auditorias/inventario-auditorias.service.js
aristas:
  relacionado: [modulo/inventario, tabla/compra-linea]
medido: 2026-10-04
---

Bloquea los 9 ítems de la sección 5 (Inventario) del checklist, y con ellos
retirar `alegra_products_cache` del todo: mientras las existencias sigan
viviendo solo en Alegra, algo va a tener que seguir leyendo esa caché.

DE QUIÉN DEPENDE: del usuario, no de código. No se puede migrar "cuánto hay
de cada producto" sin un conteo físico que confirme el punto de partida —
migrar los números de Alegra tal cual arrastraría cualquier descuadre que ya
tuvieran.

ES LO ÚLTIMO QUE ATA LA APLICACIÓN A ALEGRA (medido el 2026-10-04). Del
código del servidor solo dos archivos importan la integración: la
sincronización de productos cada 6 horas (`server.js`) y
`inventario-auditorias.service.js`. Ninguna pantalla llama a Alegra. Ese
módulo, de 1.564 líneas, hace cuatro cosas distintas:

- **Conteos** por categoría: compara lo contado con `inventory.availableQuantity`
  que le pide a Alegra en vivo, y ajusta allá (`POST /inventory-adjustments`).
- **Excesos**: detecta sobrantes con esas mismas existencias, les pone un
  descuento (`producto_descuento_exceso`, que es lo que muestran los catálogos
  y aplica Facturación) y da de baja la oferta cuando Alegra dice que quedó
  en cero.
- **Devoluciones** a proveedor.
- **Productos nuevos** del catálogo, que ya es propio.

Todo llaveado por el id de Alegra del producto.

CUÁNTO SE USA (copia local, datos de producción hasta mediados de setiembre):
17 auditorías en total — 10 conteos por categoría (2 de julio al 7 de
agosto), 1 al azar, 1 devolución y 5 tandas de excesos (23 de julio al 16 de
agosto); ninguna después. 470 descuentos de exceso vigentes.

LO QUE CAMBIA EN EL CORTE, se decida lo que se decida: desde ese día las
ventas ya no pasan por Alegra, así que sus existencias quedan congeladas.
Cualquier cosa que las siga leyendo muestra un número viejo. No existe la
opción de "seguir leyendo de Alegra un tiempo más".

DECISIÓN ABIERTA, DEL USUARIO — qué pasa con el inventario en el corte:

A. **Inventario propio antes del corte.** La tabla de movimientos, que cada
   venta, compra y nota de crédito la mueva, y la auditoría escribiendo ahí.
   El conteo físico se puede hacer con la propia auditoría: lo contado pasa a
   ser el saldo inicial. Son los 9 ítems de la sección 5.
B. **Cortar sin existencias.** Se apagan las partes que las necesitan —los
   conteos contra el sistema, detectar excesos solos, dar de baja la oferta
   al llegar a cero— y quedan los descuentos de exceso puestos a mano, por
   producto propio. El inventario se arma después, cuando se haga el conteo.

Para pensarlo: Alegra tiene hoy 457 de 2.013 productos en negativo, no hay
conteos desde agosto, y el negocio vende con el stock del proveedor.
