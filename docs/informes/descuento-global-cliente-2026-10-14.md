# Descuento global del cliente — 2026-10-14

Pedido: porcentaje en la ficha del cliente, aplicado al facturar productos
con margen mayor al 21 %. Confirmación del usuario: usar el mayor entre el
descuento del cliente, la oferta y el manual, sin acumularlos.

## Comportamiento

- Input en «Crédito y descuento» de crear/editar cliente y condición visible
  en la ficha. 0 o vacío desactiva; rango 0–100 con hasta dos decimales.
- Con cliente al 5 %, precio sin IVA de 100 y costo sin IVA de 70, descuento
  del 5 %. Si costo es 79, margen exactamente 21 %: descuento automático 0.
- Oferta/manual del 10 % gana sobre 5 % del cliente. Una oferta del 10 %
  sigue siendo la mayor aunque se teclee un porcentaje menor.
- El margen usa el precio de la línea antes de descuentos. Cambiar precio
  recalcula elegibilidad, sin convertir el descuento automático en manual.
- Tarifa real para quitar IVA al costo; tarifa desconocida, costo ausente,
  inconsistencia entre fuentes o historial inestable excluyen la rebaja.
- El porcentaje se ve en cada línea y en el total antes de guardar. La
  escritura vuelve a leer la ficha y los costos: si la vista previa venció,
  devuelve 409 sin emitir ni cobrar; la pantalla renueva condiciones y
  conserva los productos para que se revisen antes de otro clic.
- Una factura ya guardada conserva su descuento al editar/reimprimir,
  aunque cambie después el porcentaje del cliente.
- FE y TE usan las líneas persistidas; sigue siendo necesario elegir el
  motivo fiscal cuando hay descuento. No se inventa un motivo por omisión.

## Implementación

SQL 060 agrega `cliente.descuento_global` NUMERIC(5,2), default 0 y CHECK
0–100. Validación y bitácora de la ficha comparten transacción.

`descuentoCliente.service.js` usa la clasificación de costos de Rentabilidad
y el historial válido. Consulta por lote y por ids propios dentro de la
transacción recibida. Endpoint privado de Facturación entrega condiciones;
no se agregan costos al catálogo público ni compartido.

`facturaLineas.js` extrae las cuentas y la validación de identidad de la
copia mostrada, conservando export compatible del servicio. El archivo de
escritura baja de 827 a menos de 700 líneas, retirando su excepción de tamaño.

Frontend: regla pura en `utils/descuentoCliente.js`, carrito en
`useLineasFacturacion`, condiciones/API en su hook y servicio. La página
solo compone. El hook principal disminuye y su límite de deuda también.
Redondeo compartido en `utils/moneda.js`; base, descuento e IVA se redondean
por línea como en el backend para evitar diferencias de centavos.

IndexedDB conserva las condiciones por usuario/cliente. La cola nueva
guarda porcentaje revisado y descuento base por línea junto con la clave
de idempotencia. Una cola anterior sin vista previa queda pendiente si el
cliente ahora tiene descuento, sin alterar silenciosamente lo prometido.

## Verificación y publicación

Se usa una copia desechable de PostgreSQL local y BEGIN/ROLLBACK para
registros de prueba. Ningún mensaje, comprobante fiscal ni correo real.

Pruebas cubren frontera exacta del 21 %, tarifas 0/1/2/4/8/13 %, costos
ausentes, prioridad entre descuentos, precio final con IVA, porcentajes
inválidos, centavos, vista previa vencida y SQL por lote. FE y TE cumplen
XSD con firma de certificado ficticio; sin motivo fiscal se rechazan.

PostgreSQL verifica ficha, líneas, impuestos, totales, ausencia de consumo
de número ante conflicto, conservación de descuentos anteriores y cola
antigua pendiente. Navegador comprueba guardar/reabrir ficha y factura,
precio/manual/oferta, uso offline y permisos 401/403 en móvil, tableta y
escritorio. Sin desborde horizontal ni errores JavaScript.

Verificación final:

| Comprobación | Resultado |
| --- | --- |
| Suite completa, ejecución serial por archivo | 242 archivos, 2.922 casos: 2.516 aprobados, 406 omitidos por entorno, 0 fallos |
| Regla, centavos y XML fiscal | 25 pruebas aprobadas |
| PostgreSQL de la función | 7 pruebas aprobadas con BEGIN/ROLLBACK |
| Historial de costos existente con PostgreSQL | 7 pruebas aprobadas |
| Estructura y grafo | 23 comprobaciones aprobadas |
| Build frontend | Correcto; advertencias previas de tamaño y Browserslist |
| Chromium | 390/700/1440 px, ficha/factura/offline y conflicto recuperable, sin errores ni desborde |

La suite serial corre cada archivo en su propio proceso: evita interferencias
entre dobles bajo Node 25. Conexiones limitadas a localhost y salidas reales
bloqueadas durante toda la verificación. Evidencia privada de navegador,
logs y copia desechable: `codex-descuento-clientes-20261014`.

SQL 060 aplicada inicialmente a la copia desechable y a la vista previa
local, con respaldo de esta última antes del cambio.

## Migración y despliegue autorizados a producción

Usuario: «ok, dale adelante haz la migracion y sube a main». Codex publica
el cambio funcional `1dead1f` y este registro, ambos propios y firmados;
`git log origin/main..developer` no incluye trabajo nuevo de Claude.

SQL 060 aplicada en producción por Codex **el 14 de octubre a las 15:31:43,
Costa Rica (21:31:43 UTC)**. Transacción REPEATABLE READ, bloqueo asesor de
despliegue, lock_timeout 5 s y statement_timeout 45 s; COMMIT solo tras validar:

- Las 144 tablas mantienen la huella de todas sus columnas anteriores.
- 250 clientes inicializados en 0 %, sin asignar descuentos por omisión.
- NUMERIC(5,2), NOT NULL, default 0 y CHECK 0–100 validado.
- Restricciones, índices y triggers anteriores de Clientes conservados.
- Ninguna factura ni línea anterior reescrita.

Respaldo privado completo del esquema public: **19.089.457 bytes** y SHA-256
registrada. Restauración en PostgreSQL local con salida correcta; SQL 060
ensayada sobre ese mismo respaldo, preservando las 144 tablas. Sobre la copia
restaurada pasan **107 pruebas dirigidas**, sin fallos ni omisiones, y Chromium
390/700/1440 de ficha, factura, descuentos, conflicto recuperable y offline.
La suite completa, build y XML fiscal de la implementación siguen vigentes;
este registro solo modifica documentación y verifica estructura/grafo.

Producción no se usa para desarrollar ni ejecutar pruebas de escritura.
La intervención remota se limita a la migración autorizada y a lecturas de
comprobación del despliegue; no se mandan mensajes ni comprobantes reales.
No se regenera Prisma ni se instalan dependencias compartidas. Evidencia y
respaldo privados: `codex-despliegue-descuento-20261014`.

Se publica por avance sin fusión `developer:main` y se comprueba GitHub,
la página actualizada y el endpoint autenticado nuevo en Render mediante
GET. El commit final y la comprobación de Render se registran en la memoria
compartida `permiso-subir-a-main.md`.
