# Anzuelos de Favarcia — relevo del 2026-11-03

El usuario pide ordenar el catálogo por familias a partir del catálogo de su
proveedor Favarcia. Decide trabajar primero en una copia actual de producción;
elige vender los anzuelos por caja, corregir relaciones que mezclaban códigos,
conservar los productos ligados al proveedor y usar margen del 30 % sobre el
precio. Nombres en MAYÚSCULAS sin tildes, conservando Ñ y medidas.

Después de revisar el resultado local, autoriza: «perfecto, subamos todo a
prod» (2026-11-03). Claude publica el ajuste de nombres de Gestión de Catálogo
053fb2e y aplica el plan revisado en producción. Codex recibe el relevo cuando
faltan las fotografías; no se vuelve a ejecutar el lote de datos.

## Datos ya aplicados y verificados

Se compara por lectura READ ONLY el estado actual con el cierre respaldado
de Claude: 29 fichas del lote, 26 relaciones proveedor/código y ninguna
diferencia en nombres, referencias, costos, precios, subcategorías y factores.
De las 29 fichas, 26 están activas y 3 dadas de baja (103, 107 y 370).
El producto nuevo es 4366, «ANZUELO TRIPLE 4 ESTAÑADO P/MAR 3551DS 50 PZAS».
Las 25 activas con costo tienen margen entre 30 % y 30,56 %, por los escalones
de redondeo ya revisados con el usuario. No se recalculan ni vuelven a guardar.

La baja de 103 y conservación de 106 se explicaron al usuario antes de su
aprobación final: 106 sí tiene Favarcia y 103 carecía de relación. Se conserva
ese resultado aprobado. Las excepciones pendientes de información son:

- 376, Mustad No.16, sin costo: no calcular precio hasta tener el dato real.
- 377, Mustad No.4, costo provisional del No.5: falta una factura propia.

## Fotografías pendientes

26 PNG recortados del catálogo original, cada uno menor de 2 MiB. Se preservan
los bytes originales, sin volver a generar o retocar las imágenes. El archivo
`fotos-pendientes.json` conserva qué código corresponde a cada ID propio,
incluido 4366. El servicio existente de carga valida los bytes, escribe en
el disco de Render y registra la sustitución en bitácora.

La API de producción rechaza con TOKEN_INVALIDO la sesión firmada con el
secreto local. No hay sesión de navegador conectada disponible en Codex.
Se abre una ventana propia de Chrome for Testing en el inicio de sesión real
para que el usuario se autentique. La contraseña no se lee desde el formulario
ni se pide por chat. La sesión que devuelve el login se usa en memoria para
completar exclusivamente las 26 fotos autorizadas; no se guarda en archivos.

La operación preparada primero respalda las fichas y los archivos anteriores,
valida que nombre/foto sigan iguales a la revisión y sube cada imagen por
`POST /maestro/productos/:id/imagen/archivo`. Después verifica el GET público,
los bytes por SHA-256 y que los demás campos de cada producto se conserven.
Guarda progreso por producto para evitar repetir una sustitución ya confirmada.
Cualquier fallo se detiene y requiere revisar el estado antes de reanudar.

**Cierre confirmado — 2026-11-03 15:50:49 CR:** el usuario inicia sesión y Codex completa
las 26 fotografías por la API normal. Cada descarga pública devuelve 200 y
su SHA-256 coincide con el PNG de origen. Los demás campos de cada ficha se
conservan, incluidos precios, costos, nombres, estado y referencias.

Una conexión nueva y de solo lectura confirma las 26 rutas y las 26 entradas
de bitácora con motivo foto y la cuenta administradora autenticada (ID 4).
El respaldo conserva las 24 imágenes anteriores y las fichas anteriores;
dos productos carecían de foto. Para revertir una sustitución se sube su
archivo respaldado por la misma API; no se guarda una ruta a un archivo que
el servicio ya eliminó. Una descarga de los originales no altera productos.

Verificación de las fotos públicas en Chromium y WebKit a 390 y 1280 px:
26 imágenes decodifican en cada uno de los cuatro recorridos (104 lecturas),
sin desborde. Evidencia visual revisada con los nombres y medidas del lote.
La ventana y la sesión temporal propias se cierran al terminar; no se
conservan tokens ni contraseñas. El lote de datos de Claude no se repitió.

## Respaldo y evidencia

Fuera de Git, sin credenciales:

- `~/.local/share/sistema-facturas-cr/respaldos/20261103-produccion-anzuelos-favarcia/`:
  antes/después del lote aplicado por Claude y lista de fotos pendientes.
- `~/.local/share/sistema-facturas-cr/codex-relevo-favarcia-20261103/`:
  auditoría de solo lectura, copias de las 26 fuentes, hashes y ejecución del
  cierre de fotos. Resultados reales: fotos-resultado.json, verificacion-final.json y
  fotos-navegador.json; respaldo-fotos/ conserva las sustituciones.

El maestro de producto, los documentos y sus relaciones se siguen leyendo
por ID propio. No se ejecutan nuevas migraciones, limpieza semanal ni envíos
de mensajes para esta continuación.
