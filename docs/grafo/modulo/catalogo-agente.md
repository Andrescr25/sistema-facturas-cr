---
id: modulo/catalogo-agente
tipo: modulo
titulo: Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar
estado: vigente
archivos:
  - frontend/src/utils/proporcionImagenCategoria.js
  - backend/tests/proporcionImagenCategoria.test.js
  - backend/src/modules/productos/categorias.imagen.optimizar.js
  - frontend/src/components/catalogo-agente/VistaPreviaProducto.jsx
  - frontend/src/pages/CatalogoAgente.jsx
  - frontend/src/utils/catalogoAgentePersonalizacion.js
  - frontend/src/utils/promocionesCatalogoAgente.js
  - frontend/src/utils/buscarCatalogoAgente.js
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - frontend/src/components/catalogo-agente/BarraSuperior.jsx
  - frontend/src/components/catalogo-agente/BarraCategorias.jsx
  - backend/tests/subgruposCatalogoAgente.test.js
  - backend/tests/busquedaCatalogoAgente.test.js
  - backend/tests/catalogoClienteNuevo.test.js
  - backend/tests/promocionesCatalogoAgente.test.js
  - frontend/src/components/catalogo-agente/SelectorCliente.jsx
  - backend/tests/liquidacionSinStock.test.js
  - backend/src/modules/inventario-auditorias/productosNuevos.js
  - backend/tests/productosNuevos.test.js
  - frontend/src/components/inventario-auditoria/SeccionProductosNuevos.jsx
  - backend/src/modules/ventas/rotacion.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/tests/catalogoAgenteSinCosto.test.js
  - backend/src/modules/precios/ofertasPorBaja.js
  - backend/src/modules/catalogo-agente/catalogo-agente.controller.js
  - frontend/src/utils/catalogoAgenteDb.js
  - frontend/src/hooks/useCatalogoAgente.js
  - backend/tests/catalogoAgenteIdsPropios.test.js
  - frontend/src/components/catalogo-agente/IntroduccionCategoria.jsx
  - frontend/src/components/catalogo-agente/introduccionCategoria.css
  - frontend/src/utils/entradaCategoria.js
  - frontend/src/utils/imagenesCategoriaCatalogo.js
  - backend/tests/categoriasVisuales.test.js
  - backend/tests/filasCatalogo.test.js
  - frontend/src/components/catalogo-agente/Cuadricula.jsx
  - frontend/src/components/catalogo-agente/cuadricula.css
  - frontend/src/hooks/useColumnasCatalogo.js
  - frontend/src/utils/filasCatalogo.js
  - backend/tests/categoriaEnElRecorrido.test.js
aristas:
  depende_de: [tabla/subcategoria, tabla/categoria-config, tabla/venta-linea, tabla/producto-nuevo-catalogo]
  relacionado: [modulo/marcas-catalogo, modulo/gestion-catalogo, modulo/portal-clientes, decision/orden-canonico-compartido, leccion/dos-clases-de-oferta, leccion/fotos-del-catalogo-en-la-tablet, leccion/cache-con-ids-propios-no-borra-pendientes, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-25
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


El catálogo que el agente le muestra al cliente. Es de solo mirar; el pedido
se toma en Facturación. No tiene controles para armarlo desde esta pantalla.
Cada categoría reúne sus familias (subcategorías) en una cuadrícula continua,
en el orden de `categoria_config.orden` y `subcategoria.orden`
— el mismo que ve Gestión de Catálogo, porque las dos pantallas usan las
mismas funciones ([[decision/orden-canonico-compartido]]). El agente recibe
ese orden de `GET /catalogo-agente/config-catalogo`; sin él (no sincronizó o
falló) todo sale alfabético.

2026-10-07, pedido del usuario: una subcategoría puede continuar en la misma
fila que la anterior. Solo una categoría nueva abre otro bloque; al final de
una categoría puede quedar una fila incompleta. `Cuadricula` recorre las
familias canónicas seguidas, sin reordenar por tamaño ni mezclar categorías.
La tarjeta dice la subcategoría en una etiqueta, con hasta dos líneas
visibles y el nombre completo en `title`; los sueltos de una categoría con
familias dicen «Sin subcategoría» y siguen al final. Sin familias, no se
inventan rótulos. Se reutiliza `BloquesPorCategoria` para rebajas y nuevos.
Dos columnas en tablet/celular, tres desde `lg` y cuatro desde `xl`.
Selector móvil con nombre accesible «Elegir cliente».
[Validación visual y límites](../../informes/catalogo-agente-sin-huecos-2026-10-07.md).

Con un cliente elegido, el orden se personaliza (`ordenarCatalogoParaCliente`:
lo que suele comprar primero). Al quitar el cliente, vuelve al orden normal y
arriba de todo.

La búsqueda (`buscarCatalogoAgente.js`) descarta el agrupado y devuelve una
lista plana; Gestión de Catálogo hace lo mismo al buscar.

2026-10-11, pedido de navegación visual: cada bloque de categoría comienza
con `IntroduccionCategoria`, nombre, foto, contador y posición en la colección;
la cuadrícula empieza inmediatamente después. También se reutiliza en Cliente
nuevo, Ofertas y Nuevos, conservando su selección y orden. La imagen asignada
en Gestión gana; sin ella se aprovecha una foto de producto, o un fondo con
icono si tampoco hay fotos. Buscar sigue dando resultados planos. Elegir un
filtro de categoría vuelve arriba para mostrar su introducción.

Refinamiento del mismo día, pedido del usuario después de ver localhost:
las subcategorías necesitaban protagonismo y los productos entradas tipo Apple.
`Cuadricula` muestra navegación horizontal por familia, fija bajo las categorías,
y títulos al empezar una familia. Cuando dos familias comparten fila, aparecen
sus nombres sobre ella y cada tarjeta conserva su etiqueta. (La portada de una
marca ocupa dos casillas; ver [[modulo/marcas-catalogo]].) `filasCatalogo.js`
consume el orden ya calculado: no reordena ni deja huecos al cambiar de familia.
Dos consultas de ancho compartidas ajustan las filas a 2/3/4 columnas. Los
saltos se dirigen a la fila inicial de la familia con margen para las barras.

Las colecciones y próximas CUATRO FILAS de las colecciones en pantalla
comparten el observador de entrada de productos; cada entrada retira su
observación y prepara la siguiente fila. Las restantes son visibles por defecto:
saltarse filas no descubre una pantalla oculta. Las fichas entran una vez con
fade/deslizamiento de 700 ms y 65 ms de desfase, sin estado React por frame.
Al terminar se elimina su animación y transform. Pasadas mayores a 4.000 px/s
muestran directamente las fichas. Búsqueda, movimiento reducido y ausencia/fallo
del observador muestran productos sin animación. Las filas usan `display: contents`
dentro de una cuadrícula por categoría, observando la primera ficha como referencia;
no hay cientos de cuadrículas, alturas estimadas ni virtualización.

**RETIRADO el 2026-10-19** (ver «La categoría pasa con el scroll», al final):
los dos párrafos que siguen y la sección del 2026-10-18 cuentan un efecto que
ya no existe en el código.

Nueva indicación del usuario después de revisar este recorrido: al cambiar de
categoría, OSCURO → NOMBRE/FOTO → CLARO/PRODUCTOS, avanzando al seguir el scroll.
`TransicionCategoria` conserva el título lógico para lectores de pantalla y
reutiliza la foto/cabecera como escena visual. `RecorridoCategorias` tiene un
único velo fijo, que cubre la vista con opacidad y deja pasar los eventos de
puntero. Modal de cliente/sincronización y controles con foco de teclado mantienen
su acceso. El separador ocupa 85 svh (mínimo 440, máximo 900 px), sin espera,
scroll forzado, bloqueo táctil ni salto automático. La escena central aparece
solo durante su fase; luego se retira y los productos quedan en la vista clara.
Gestión de Catálogo conserva su previsualización compacta de imagen.

`focoCategoria.js` calcula el progreso desde la posición del separador, con
oscurecimiento completo antes de que aparezca nombre/foto. Un observador para
estos separadores activa un listener pasivo de scroll solo cerca de ellos;
requestAnimationFrame agrupa la lectura de los separadores próximos antes de
escribir opacidad/transform, sin recorrer productos ni renderizar React por frame.
Al detener el scroll la fase permanece; al invertirlo vuelve por el mismo recorrido.
No es un temporizador de pantalla. Las imágenes se preparan una sola vez al
acercarse, evitando descargar todas por estar en escenas fijas. Buscar, cambiar
colección, desmontar, preferir movimiento reducido o fallar la observación
retiran el velo y dejan la versión compacta. La preferencia también se escucha
si cambia durante una escena.

`<picture>` elige la WebP liviana (hasta 960×720) en móvil y la grande (hasta
1920×1080) en escritorio. La compresión ya prepara resolución para la escena
grande, en vez de las miniaturas de la cabecera original.

**La foto se ve completa, con su proporción (2026-10-25).** El usuario: «ahora
está recortando mucho la imagen que pongo». El banner era una franja fija de
168/200/216 px y de la foto de Línea Eléctrica se veía el 52 % del alto en el
teléfono (con la copia recortada), el 56 % en tablet y el 38 % en escritorio.
Ahora, con las medidas guardadas, el banner toma la forma de la foto
(`--relacion`, clase `introduccion-categoria--foto`) con topes de alto de
260/340/420 px; se ve el 100 %, 95 % y 74 %. `width: 100%` es obligatorio: sin
él el tope de alto angosta el banner. Sin medidas (foto de respaldo de un
producto, copias sin metadatos) conserva la franja. La copia móvil solo se
usa si tiene la misma proporción que la grande (`urlMovilUsable`,
`proporcionImagenCategoria.js`): las anteriores al cambio quedaron recortadas
y se ignoran. El degradado oscuro de la izquierda (donde va el nombre) no
cambió. Lazy/async/prioridad baja, altura reservada y
respaldo si falla, sin bloquear el recorrido. Las dos variantes se descargan
al actualizar el catálogo y viajan en su caché existente:
[[leccion/fotos-del-catalogo-en-la-tablet]].
[Primera implementación](../../informes/catalogo-categorias-visuales-2026-10-11.md)
[entrada de productos](../../informes/catalogo-revelado-subcategorias-2026-10-11.md)
y [foco por categoría vigente](../../informes/catalogo-foco-scroll-2026-10-11.md).
Las tres hojas de animación usan colores de la paleta por rol (`theme()`);
la prueba de estructura ya no las exceptúa.
[Corrección de calidad y subida](../../informes/catalogo-imagen-calidad-2026-10-11.md).

2026-10-07, segunda corrección del usuario: OFERTAS DENTRO DE SU FAMILIA.
En Todo no hay bloque superior de ofertas/rebajas/liquidación. El hook cruza
las mismas listas de promociones con la ficha, y `conPromocionesDelCatalogo`
adjunta `precioAntes`/`bajaPorcentaje` y/o `descuentoPorcentaje`, sin cambiar
precio base, clasificación ni caché cruda. Categorías, búsqueda, habituales,
perdidos y nuevos reciben esos datos. El filtro Ofertas reúne rebajas y
liquidación por categoría/familia, sin duplicar una ficha superpuesta; gana
la liquidación. La tarjeta Oferta usa rótulo con porcentaje, borde naranja
doble, fondo suave y área del precio resaltada; Liquidación conserva el
porcentaje y morado. No aplicar otra rebaja al precio ya rebajado.
[Informe y validación](../../informes/catalogo-ofertas-familias-2026-10-07.md).

PRODUCTOS NUEVOS (2026-09-27, decisión del usuario): conserva su sección
propia al principio, en el mismo orden por categoría. Es una lista
MANUAL (`producto_nuevo_catalogo`: qué producto, cuándo, quién) que se
administra en Auditoría de Inventario, pestaña "Productos nuevos" — agregar o
quitar, nada automático. Solo entra un producto activo y visible; uno que
después se desactiva queda en la lista marcado ("No sale: …") en vez de
borrarse solo. La lista usa `producto_id` propio y se quita por su entrada
`registroId`, incluso si no tiene ficha ([[tabla/producto-nuevo-catalogo]]).
La tablet baja solo los ids de `GET
/catalogo-agente/productos-nuevos`, abierta sin sesión como las rebajas; la
administración (`/inventario-auditorias/productos-nuevos`) pide sesión. No
entra en "Cliente nuevo".

CLIENTE NUEVO (2026-09-25). En el selector de clientes, "Cliente nuevo" va
siempre arriba y aparece al buscarlo. No es una ficha de cliente: es un id fijo
(`CLIENTE_NUEVO_ID`) sin compras. Con él elegido, en vez del catálogo
completo se ve `catalogoClienteNuevo`. Selecciona OFERTA (rebajas), LIQUIDACIÓN
(excesos), rotación A ("Lo más vendido") y B ("También se vende bien").
Desde el segundo pedido del 2026-10-07, `todos` reúne las cuatro selecciones
en una sola lista por categoría/familia: cada familia aparece una vez, con
promociones y normales juntos. Las cuatro listas anteriores y sus contadores
se conservan como filtros exclusivos, para no cambiar la selección original.
Ningún producto sale dos veces: liquidación gana y las promociones no se
repiten en A/B. C sin promoción queda solo en el buscador; C promocionada
sigue entrando como antes. Sin rotación disponible se conservan promociones
en su familia y el aviso de actualización. El buscador mira todo el catálogo.
La rotación baja al sincronizar de
`GET /catalogo-agente/rotacion` (solo ids, pide sesión) y se guarda en la
tablet como las rebajas. Es la rotación EN EL MOMENTO de
`ventas/rotacion.js` (unidades de los últimos 3 meses, la misma de
[[modulo/rentabilidad]]); la foto a mano de `producto_rotacion` ya no se usa.

Las ofertas en la tarjeta son DOS cosas distintas — ver
[[leccion/dos-clases-de-oferta]].

EN `independencia-alegra` (2026-09-24): los productos salen de `producto`, no
de Alegra ni de la caché, y la subcategoría de `producto.subcategoria_id`
(`conSubcategoria`), que es donde la pone Gestión de Catálogo en esta rama.
La categoría viaja en `itemCategory` —como la llama Alegra—, porque es lo
que lee `catalogoAgentePersonalizacion.js`: con `category` todo el catálogo
caía en "Otros".

LA TARJETA NO DICE NADA DEL STOCK (2026-09-25, decisión del usuario): el
negocio es intermediario, casi nunca tiene existencias y vende con el stock
del proveedor. "Agotado" y "Quedan N" se quitaron, y un producto en cero sale
en su lugar como cualquier otro. La única excepción es Liquidación, que sí es
mercadería física (sale sola cuando se acaba: `liquidacionSinStock.test.js`).

LA ACTUALIZACIÓN SIN SESIÓN Y LAS FOTOS: ver
[[leccion/fotos-del-catalogo-en-la-tablet]]. En esta pantalla un 401 no manda
al ingreso; el orden y la rotación (que piden sesión) se quedan como estaban
y la pantalla lo avisa.

SECCIÓN 12, PARTE 3 (2026-10-03): productos, historial por cliente, ofertas,
rebajas, lista manual y rotación A/B entregan ids propios, incluidos productos
y clientes sin Alegra. Un cliente activo sin compras entra con `p: []`.
La caché v3 invalida juntos los ids anteriores y conserva orden y fotos.
Productos, clientes y metadatos se reemplazan en una transacción; un fallo
de descarga o almacenamiento conserva la última copia válida. Ver
[[leccion/cache-con-ids-propios-no-borra-pendientes]].

SOLO LA COLA HISTÓRICA conserva el borde de Alegra. La migración no abre
`SistemaFacturasCR` ni borra pedidos o facturas pendientes. El servicio
reconoce campos antiguos explícitos y traduce por su correspondencia;
el contrato nuevo recibe `clienteId` y `productoId`, sin mezclarlos. Precio,
IVA y nombre salen del maestro. Cabecera y líneas se confirman juntas;
reenvíos devuelven el pedido original. Clientes los factura con el mismo
servicio propio del portal.

AL VOLVER LA CONEXIÓN (2026-10-04). El error que aparecía en la consola de
esta pantalla —`Cannot read properties of null (reading 'transaction')`— no
era del catálogo sino de Facturación sin señal: la base local del navegador
solo se abría en esa pantalla, y el regreso de la conexión se escucha en toda
la aplicación. Está explicado en [[modulo/facturacion-offline]]. El mismo
arreglo está en producción (`main` `e19c3e5`).

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].

## Cambio de categoría fluido — 2026-10-18 (RETIRADO el 2026-10-19)

El usuario: «hay un error en el catálogo agente, se supone que este tiene que
ir súper fluido pero se le agregó unas imágenes en las categorías, cuando el
cliente va por un cambio de categoría la animación es muy brusca y se queda
pegado. Haz que sea más fluido». Se conserva su secuencia (oscuro → nombre y
foto → claro con productos); cambia cómo se mueve.

LO QUE SE MIDIÓ, en Chromium a tamaño de tablet (768×1024, densidad 2, CPU
4× más lenta), con 14 categorías con foto puesta por el mismo proceso de
Gestión de Catálogo sobre una copia desechable:
- **Tocar una categoría** dejaba la pantalla NEGRA: el oscurecido saltaba de
  0 a 1 en un cuadro y a los 2 s seguía negro con la escena al 22 %, hasta
  que alguien siguiera bajando. Es el «se queda pegado».
- **Detenerse en lo oscuro** dejaba la pantalla al 75 % negra y vacía.
- **Bajar a gestos** cambiaba hasta 29 % de opacidad por cuadro, y una pasada
  rápida 72–87 %: un destello.

QUÉ CAMBIÓ (`utils/focoCategoria.js`):
- Lo que se ve SIGUE al scroll con una curva exponencial por tiempo
  (`acercar`, 110 ms), en vez de copiarlo: los saltos del dedo se vuelven
  fundidos. Un cuadro lento cuenta como mucho 50 ms, así una foto que se
  decodifica no produce un salto. Al llegar, deja de pedir cuadros.
- **Nunca queda a medias**: quieto 260 ms dentro de un separador, termina en
  el estado estable más cercano (`alQuedarseQuieto`): la categoría entera a
  la vista o el catálogo claro.
- **Tocar una categoría** (`entrarACategoria`) lleva la vista a sus productos
  y reproduce la presentación sola (`enPresentacion`: oscuro, nombre y foto
  a los 220 ms, claro desde los 1.250 ms), sin decir «Seguí bajando». Mover
  el dedo la interrumpe y devuelve el mando al scroll. Sigue desde la
  oscuridad que ya había (`oscuridadActual`), para que tocar otra categoría
  con una escena a la vista no parpadee a claro. «Todo», las secciones
  especiales y el movimiento reducido suben al principio como antes.
- Si el último separador se aleja con la escena a la vista, termina de
  apagarse sola en lugar de cortarse.

Y ALREDEDOR:
- La foto de la escena se carga apenas se prepara (`cargarYa`), se
  decodifica con `decode()` y entra con un fundido (`data-lista`): ya no se
  decodifica en el cuadro en que aparece. La vista previa de Gestión de
  Catálogo usa lo mismo.
- La escena tiene capa propia (`will-change`) desde que empieza a oscurecer,
  y el velo también: se pinta una vez y después solo se funde y se mueve.
- Las dos barras fijas dejaron el desenfoque (`backdrop-blur`) por fondo
  blanco: se recalculaba en cada cuadro del scroll y no se distinguía.
- El tramo de cada separador bajó de 85 a 70 svh (400–760 px).

DESPUÉS, mismas pruebas: tocar una categoría termina claro sobre sus
productos (6 fichas a la vista, ~1,6 s); quieto en lo oscuro termina con la
categoría entera; a gestos ≤ 8 % por cuadro; pasada rápida ≤ 19 %. 390,
768 y 1440 px sin desborde ni errores; movimiento reducido sin escenas.
Queda un cuadro de ~130 ms al tocar (armar la colección nueva), igual que
antes, ANTES de que empiece la animación. Pruebas en
`backend/tests/focoCategoria.test.js`.

## La categoría pasa con el scroll — 2026-10-19

Al día siguiente, el usuario, probándolo en la tablet: «en la tablet sigue
igual, muy pegado. No quiero que la animación se detenga para mostrar la
categoría, quiero que siga el deslizamiento». La escena fija ocupaba un tramo
del recorrido en el que el dedo bajaba y nada se movía —la pantalla oscura con
la categoría encima—, y eso se siente como scroll trabado por más suave que
sea la animación. **Reemplaza** la secuencia OSCURO → NOMBRE/FOTO → CLARO que
él había pedido el 2026-10-11 y el arreglo del 2026-10-18.

Se retiró el efecto entero: `RecorridoCategorias` (el velo fijo),
`TransicionCategoria` (la escena fija), `transicionCategoria.css` (el tramo de
70 svh) y `utils/focoCategoria.js` (el control por cuadro), con sus pruebas.
Cada categoría vuelve a abrir con `IntroduccionCategoria` EN EL RECORRIDO: la
tarjeta grande con su foto, nombre, cantidad y posición (05 / 19), que pasa
con el scroll como un producto más y entra con su animación breve de CSS
(`entradaCategoria.js`, la misma de antes, que nunca retiene el scroll).
Elegir una categoría en la barra sube al principio de ella.

Se conservan del 2026-10-18 lo que no detiene nada: la foto se descarga al
acercarse (`loading="lazy"`), se decodifica con `decode()` y entra con un
fundido (`data-lista`), y las barras fijas no usan `backdrop-blur`.

Medido en Chromium a tamaño de tablet (CPU 4× más lenta, 14 categorías con
foto), bajando 9.000 px a gestos: entre una categoría y la siguiente hay que
bajar 389 px en vez de 887, y la pantalla está tapada 0 px del recorrido en
vez de 780 (64 cuadros). El tiempo por cuadro es el mismo. Prueba:
`backend/tests/categoriaEnElRecorrido.test.js` (no vuelven las capas fijas ni
los tramos del alto de la pantalla).



## Marcas y presentaciones — 2026-10-22

Gestión conserva categorías, subcategorías y filas existentes. El botón
«Marcas» de cada subcategoría permite nombrar una agrupación, seleccionar sus
productos existentes y subir una imagen general independiente. En el agente
se muestra marca/foto/lista de presentaciones con IVA; tocar una presentación
abre su fotografía individual sin consultar al servidor. Ver
[[modulo/marcas-catalogo]]. SQL064 aplicada en producción el2026-10-22 antes de publicar a main, con
respaldo restaurado y verificación de conservación de los datos. Ver
[publicación](../../informes/despliegue-marcas-2026-10-22.md).


## Ampliar fotografías de todos los productos — 2026-10-22

El usuario extiende la vista previa a las tarjetas normales: tocar la foto
abre VistaPreviaProducto, el mismo modal de las presentaciones por marca.
La zona de imagen es un botón nativo con nombre accesible, foco visible y
lupa discreta. Sin foto se conserva el marcador y no se ofrece ampliación.
Cuadricula comparte una sola selección/modal por colección; el callback de
estado es estable para conservar memo y no repintar fichas al escribir.

Funciona en categorías, búsqueda y selecciones de ofertas/nuevos/cliente.
Usa el producto ya descargado y la misma foto de la tarjeta; no consulta la
API ni agrega otra caché. Escape/botón/fondo cierran y devuelven el foco sin
mover el scroll. No requiere migración, dependencia ni cambio en el servidor.


Verificado en Chromium a390/700/1440:32 comprobaciones correctas, sin erroresJS
ni desbordamiento. Foto correcta, botón con teclado, cierre por Escape y botón,
foco/scroll restaurados, búsqueda plana, marcador sin foto sin ampliación y
recarga offline con imagen desde caché. Build y lint del cambio correctos;
grafo/estructura y reglas compartidas:33 pruebas correctas. Evidencia privada
codex-catalogo-fotos-20261022. No requiere SQL ni acceso a producción para probar.


La ampliación se publica a main por Codex como continuación del catálogo,
con suite completa local:239 archivos,2941 correctas,0fallos y3 omisiones
históricas, conservando el inventario de la copia. No viajan migraciones ni
commits nuevos de otro agente. Vista local5173/3000 actualizada.
