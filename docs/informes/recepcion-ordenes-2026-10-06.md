# Recepción física de órdenes por ciclo — 2026-10-06

Estado de esta parte: recepción parcial/final implementada y verificada en copia
propia. Integración local y verificaciones finales se anotan al cierre abajo.
Base de partida `72c07c2`, rama tmp/codex-recepcion-ordenes-20261006; sin otra reserva
en commits/worktrees. Solo independencia-alegra; developer/main/producción fuera.

## Resultado

Reporte Proveedores → Órdenes por ciclo → enviada → Recepción física.
Cantidad NUEVA por entrega en unidades propias, separado del PDF y de compra.
Parcial conserva pendiente y permite otra entrega. Final exige motivos para
faltantes y extras facturados rechazados, conserva hora del servidor y auditoría.
Agotado se declara expresamente solo tras confirmación del proveedor. PDF,
solicitud/envío originales e historial permanecen dentro de la orden.

SQL 049: eventos/líneas, modalidad fija de stock en compra, estados parcial y
recibida, protecciones de fuente comercial usada y cobertura por origen.
Registro comercial explícito previo mantiene precios/costos/CxP. Compra NUEVA
ya vinculada difiere stock hasta recibir; anteriores conservan su entrada previa
y no vuelven a acreditar. Mismo origen compra/id, delta físico y costo de las partidas de la
entrega nueva; no duplicar compra ni kardex. Históricos sin entrada propia
completa se rechazan para no importar stock antiguo como mercadería nueva.

Final 6 de 10 conserva cobertura 6 y permite otra orden 4; parcial 6 de 10 conserva
cobertura 10 y pendiente 4. No resolver faltantes de clientes automáticamente ni
cubrir dos semanas con una cantidad. La orden enviada sigue en 10 y PDF idéntico.

## Verificación en copia propia

22 pruebas PostgreSQL nuevas: secuencia 4 + 3 + 3, parcial/final, revisión, motivos,
final 0 sin factura, conversiones/cajas, varias facturas/exceso/fracciones, costos
por partida, histórico sin kardex, compra anterior, rollback y SQL inmutable.
Dos conexiones reales: misma clave confirma una entrada, claves distintas con
misma revisión confirman solo una y rechazan la segunda 409. Fixtures persistidos
solo en base desechable identificada, retirada al cerrar.

Chromium 1440/390 px: compra aceptada con stock 0, parcial [6,2,0], final [12,4,0],
extras facturados rechazados con detalle, dos eventos, fecha e historial y reintento
sin cambios. PDF accesible tras final. Nueve huellas comerciales iguales antes/
después de recepción; cantidades/orígenes/PDF del envío preservados, próximo ciclo 4
independiente. ACL 401 sin sesión/403 otro módulo, tres paneles únicos y sin
desborde/errores JS. Transporte simulado exclusivamente en proceso 3003 privado.
No usar este resultado como prueba de WhatsApp real ni recepción física real.

La primera suite completa encontró stock de los fixtures de navegador en la
copia, mientras el ensayo de corte exige stock inicial cero. Se restauró SOLO
la base propia desde el dump previo, se aplicó la 049 completa y se repitió la
suite sobre esa copia limpia. No relajar esa comprobación ni tocar la compartida.

## Checklist y límites

Cerrar REC-05/06/07/09/10/11 y FAL-07: **68 listos / 31 pendientes, 99 IDs**.
FAL-04 conserva trabajo de vista global de todos los conceptos, FAL-03 stock
comprometido y FAL-08/OC-03 cierre de enviada. VAL-03 incluye archivo 24 h pendiente;
VALIDACIONES integrales permanecen abiertas. Independencia 147 IDs: 133/14 aparte.

No hay corrección/reapertura física aún: no borrar eventos ni editar fuentes
recibidas. Mercadería positiva necesita factura/compra revisada; no crear CxP/
compra automática desde recepción. Factura completa repartida entre órdenes aún
requiere asignación explícita por línea/cantidad. Compras anteriores no se
ajustan al nuevo físico; informar tratamiento en pantalla. Stock compartido
permanece provisional cero; conteo real del usuario en producción pendiente.

Siguiente parte: retirar cron/botón/API de limpieza semanal y archivo individual
24 h desde final, conservando historial/PDF y excluyendo parciales. Después
carga/entrega y pendientes de filtros/exportaciones. Jamás ejecutar limpieza
vieja para verificar su retiro. Catálogo cuatro productos por página conservado.

Suite completa final: **2.103 pruebas / 364 suites, sin fallos ni omitidas**.
Grafo: 12 aprobadas. Build aprobado; sin instalar dependencias ni regenerar
Prisma. La 049 completa se aplicó a la copia restaurada antes de esta suite.

## Cierre local

Pendiente de registrar aquí: suite completa, grafo/build, hash de implementación,
respaldo/aplicación 049 local, 32 huellas operativas y retiro de copia/base/puertos.
La implementación no se acredita aplicada hasta completar estas verificaciones.
Evidencia privada /private/tmp/codex-recepcion-ordenes-20261006; sin secretos
ni datos de prueba en base habitual.
