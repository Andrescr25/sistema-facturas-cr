---
id: decision/inventario-desde-cero
tipo: decision
titulo: Inventario nuevo en cero provisional, conteo completo al salir a producción
estado: vigente
archivos:
  - backend/migrations/independencia/042_inventario_propio.sql
aristas:
  relacionado: [modulo/inventario, bloqueo/conteo-fisico]
medido: 2026-10-04
---

INSTRUCCIÓN EXPRESA DEL USUARIO, 2026-10-04. Auditoría e inventario se
empiezan desde cero porque el físico está desordenado. Pidió «todo en 0s»
y realizar un inventario completo cuando este sistema salga a producción.
También autorizó completar durante la noche todo el checklist, excluyendo
Hacienda. Claude agotó su sesión; Codex continúa solo.

Esto supera la decisión anterior de esperar el conteo para construir §5.
Construir kardex, operaciones, pantalla, auditoría y retiro de dependencias
ahora. No volver a pedir elegir entre las opciones anteriores del bloqueo.

La apertura en cero es PROVISIONAL y se identifica así. No significa que
ya se contó ni que físicamente no haya mercadería. No copiar cantidades de
Alegra, sus negativos, auditorías, excesos o regalías al inventario activo.
Los registros anteriores se conservan como históricos, fuera de las listas
del trabajo nuevo; no se borran documentos de venta ni compras.

Desde esa apertura las operaciones propias mueven el kardex; un conteo
completo real establece después la existencia y el costo inicial de cada
producto. La confirmación del conteo y el día del corte siguen requiriendo
hechos reales. Mantener memoria, grafo y checklist actualizados. Hacienda
queda para mañana; no emitir ni corregir documentos fiscales para cerrar
las filas pendientes.
