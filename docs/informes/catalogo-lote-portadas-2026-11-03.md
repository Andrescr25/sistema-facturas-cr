# Selección del catálogo y portadas de marcas — 2026-11-03

Pedido del usuario: al marcar productos, poder desactivarlos u ocultarlos del
catálogo junto a las acciones de mover. Autoriza crear portadas para todas
las marcas y después confirma **conservar las buenas y completar las
faltantes**. Se revisan las 61 existentes: 32 con imagen y 29 sin ella.

## Acciones sobre la selección

La barra existente añade **Ocultar del catálogo** y **Desactivar**:

- Ocultar cambia `oculto`; los activos continúan disponibles en Facturación,
  fuera de los catálogos del agente y clientes.
- Desactivar cambia `activo`; retira de la venta y de ambos catálogos.
- Se explica el alcance y se confirma el número de productos con el diálogo
  existente. Después se releen lista/conteos y se limpia la selección.
- Cambiar categoría, texto, proveedor o estado limpia la selección anterior:
  una selección invisible no debe afectar otros productos.
- Mientras se envía se bloquean las acciones y selectores. Un fallo conserva
  la selección para corregir o reintentar. No se anuncia éxito parcial.

`PATCH /maestro/lote/estado` requiere sesión y Gestión de Catálogo, igual que
las acciones previas. Acepta hasta 1.000 ids propios, elimina repetidos, valida
banderas booleanas y exige que existan todos. Bloquea en orden de id, realiza
un UPDATE y registra una bitácora por producto realmente cambiado, dentro de
la misma transacción. Un fallo revierte el lote entero. Repetir el mismo
estado no cambia fechas ni crea más bitácoras.

Ficha y lote reutilizan `estadoProducto` para validar y nombrar la acción.
`registrarCambios` comparte la preparación/validación del escritor individual
de bitácora y hace un INSERT con `jsonb_to_recordset`. Son cinco consultas
con transacción, también para 1.000 productos; no se envía una petición ni una
consulta por ficha. Se conservan precios, imágenes, asociaciones, documentos
e inventario. No hay SQL de esquema nuevo.

Se retira el panel de trabajos de Alegra que ya no podía activarse: el gancho
siempre devolvía `trabajo:null`. La barra sigue en su lugar y usa `Boton`,
la paleta del sistema y el diálogo existente, sin dependencias nuevas.

## Portadas generadas

Las 29 imágenes se crean con la herramienta integrada `image_gen`, usando la
foto de un producto de cada grupo como referencia. Son portadas ilustrativas
con fondo completo; las fotos individuales y las presentaciones permanecen
como estaban. Se revisan los productos, materiales, colores, encuadre y
letras. Cuatro imágenes se afinan para retirar paquetes, medidas o datos de
una variante concreta. No se crean marcas ni se cambian sus miembros.

El servicio existente de imágenes de marca genera los WebP sin recortar:
667×1000 px, máximo 107 KiB; 1,94 MiB entre las 29 (aprox. 69 KiB por portada).
Se conservan lazy loading, dimensiones reservadas, caché sin conexión y el
DTO compartido de ambos catálogos; no se añade una consulta por tarjeta.

Archivos finales y prompts exactos: [prompts.json](../recursos/portadas-marcas-2026-11-03/prompts.json).
El manifiesto relaciona marca, producto/foto de referencia, huellas, nombre de
archivo, prompt inicial y revisión cuando corresponde. No se incluyen
secretos ni originales de base de datos en Git.

| Marca | Agrupación | Portada |
| --- | --- | --- |
| 60 | Bolsa Manilla Blanca China | [Ver](../recursos/portadas-marcas-2026-11-03/60-bolsa-manilla-blanca-china.webp) |
| 61 | Bolsa Manilla Blanca Salva | [Ver](../recursos/portadas-marcas-2026-11-03/61-bolsa-manilla-blanca-salva.webp) |
| 62 | Bolsa Manilla Color Nacional | [Ver](../recursos/portadas-marcas-2026-11-03/62-bolsa-manilla-color-nacional.webp) |
| 63 | Bolsa por Kilo Transparente | [Ver](../recursos/portadas-marcas-2026-11-03/63-bolsa-por-kilo-transparente.webp) |
| 64 | Bolsa Transparente por Kilo Nacional | [Ver](../recursos/portadas-marcas-2026-11-03/64-bolsa-transparente-por-kilo-nacional.webp) |
| 65 | Bolsa Transparente Salvadoreña | [Ver](../recursos/portadas-marcas-2026-11-03/65-bolsa-transparente-salvadorena.webp) |
| 66 | Envase con Tapa | [Ver](../recursos/portadas-marcas-2026-11-03/66-envase-con-tapa.webp) |
| 67 | Vaso de Cartón | [Ver](../recursos/portadas-marcas-2026-11-03/67-vaso-de-carton.webp) |
| 68 | Vaso Desechable Link | [Ver](../recursos/portadas-marcas-2026-11-03/68-vaso-desechable-link.webp) |
| 69 | Amarra Plástica | [Ver](../recursos/portadas-marcas-2026-11-03/69-amarra-plastica.webp) |
| 75 | Separador de Cerámica Masaca | [Ver](../recursos/portadas-marcas-2026-11-03/75-separador-de-ceramica-masaca.webp) |
| 91 | Cinta de enmascarar | [Ver](../recursos/portadas-marcas-2026-11-03/91-cinta-de-enmascarar.webp) |
| 92 | Candela de Cumpleaños | [Ver](../recursos/portadas-marcas-2026-11-03/92-candela-de-cumpleanos.webp) |
| 93 | Llanta de Bici | [Ver](../recursos/portadas-marcas-2026-11-03/93-llanta-de-bici.webp) |
| 94 | Neumático Kenda para Bici | [Ver](../recursos/portadas-marcas-2026-11-03/94-neumatico-kenda-para-bici.webp) |
| 95 | Neumático Kenda para Moto | [Ver](../recursos/portadas-marcas-2026-11-03/95-neumatico-kenda-para-moto.webp) |
| 96 | Rodamientos Vini | [Ver](../recursos/portadas-marcas-2026-11-03/96-rodamientos-vini.webp) |
| 98 | Lámina Fusible | [Ver](../recursos/portadas-marcas-2026-11-03/98-lamina-fusible.webp) |
| 99 | Splitter de TV | [Ver](../recursos/portadas-marcas-2026-11-03/99-splitter-de-tv.webp) |
| 100 | Macetero con Plato | [Ver](../recursos/portadas-marcas-2026-11-03/100-macetero-con-plato.webp) |
| 101 | Taza Hermética | [Ver](../recursos/portadas-marcas-2026-11-03/101-taza-hermetica.webp) |
| 102 | Tina | [Ver](../recursos/portadas-marcas-2026-11-03/102-tina.webp) |
| 103 | Cremera | [Ver](../recursos/portadas-marcas-2026-11-03/103-cremera.webp) |
| 107 | Cuerda de Pescar | [Ver](../recursos/portadas-marcas-2026-11-03/107-cuerda-de-pescar.webp) |
| 108 | Cuerda Multicolor | [Ver](../recursos/portadas-marcas-2026-11-03/108-cuerda-multicolor.webp) |
| 109 | Cuerda Spider Roja | [Ver](../recursos/portadas-marcas-2026-11-03/109-cuerda-spider-roja.webp) |
| 110 | Nylon Monofilamento | [Ver](../recursos/portadas-marcas-2026-11-03/110-nylon-monofilamento.webp) |
| 111 | Plomadas | [Ver](../recursos/portadas-marcas-2026-11-03/111-plomadas.webp) |
| 115 | Espejo | [Ver](../recursos/portadas-marcas-2026-11-03/115-espejo.webp) |

## Verificación y estado

- PostgreSQL desechable propio, con ensayos en BEGIN/ROLLBACK: 47 pruebas
  dirigidas correctas. Incluye ocultar y seguir vendiendo, desactivar,
  repetidos, id ausente, booleanos inválidos, idempotencia y reversión total
  si falla una bitácora. El caso de 1.000 productos comprueba cinco consultas.
- HTTP real local: 401 sin sesión, 403 sin módulo y 200 con Gestión de Catálogo.
- Suite completa por archivo:273 archivos, 3.336 correctas, cero fallos, tres omisiones
  históricas del ensayo de corte anterior a la operación.
- Navegador local Chromium/WebKit,390/1280 px: cancelar, ocultar, desactivar,
  cambiar filtro, error, selección conservada y controles bloqueados; sin
  errores JS ni desbordes.
- Las 29 portadas se aplican primero por el servicio existente en una copia
  local. Se comprueba que los 2.213 productos del escenario no cambien y que las
  otras 32 imágenes permanezcan iguales. Las 61 marcas conservan sus miembros.

Las 61 portadas pasan 366 comprobaciones locales: agente y clientes en
Chromium, clientes en WebKit, a 390/1280 px. Se abre la foto individual desde
las 29 agrupaciones nuevas. Otra pasada revisa los encuadres del agente sin
el encabezado fijo encima de las capturas; sin errores JS ni desbordamientos.

Las 29 nuevas se cargan por la API existente con la sesión real del
administrador el 03/11, entre las 19:41 y 19:43 CR. Antes de cada subida se
verifican nombre, miembros e imagen todavía vacía. Se comprueba GET 200 y
SHA-256 idéntico al WebP revisado. Una conexión independiente READ ONLY
confirma las 61 fotos, las 32 anteriores intactas, los 2.210 productos y
subcategorías conservados, y exactamente 29 bitácoras del cambio de portada.
El respaldo y el progreso por imagen permiten revisar o continuar sin volver
a sustituir una portada ya cargada. No se ejecuta SQL de esquema.

La entrega no necesita migraciones. Incluye solamente este cambio de Codex,
partiendo de `a8d10e8`; se publica por avance sin fusión de developer a main.
La confirmación de Render y el commit publicado se registran en la memoria
compartida de publicaciones, después del despliegue.
Los artefactos privados del ensayo viven en
`~/.local/share/sistema-facturas-cr/codex-catalogo-lote-portadas-20261103/`.
