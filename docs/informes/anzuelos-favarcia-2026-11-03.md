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

**Estado del relevo:** fotografías listas; falta autenticación válida del
administrador en la ventana abierta. No se atribuye como terminado el envío.

## Respaldo y evidencia

Fuera de Git, sin credenciales:

- `~/.local/share/sistema-facturas-cr/respaldos/20261103-produccion-anzuelos-favarcia/`:
  antes/después del lote aplicado por Claude y lista de fotos pendientes.
- `~/.local/share/sistema-facturas-cr/codex-relevo-favarcia-20261103/`:
  auditoría de solo lectura, copias de las 26 fuentes, hashes y ejecución del
  cierre de fotos. Los resultados reales se registran cuando la API confirme.

El maestro de producto, los documentos y sus relaciones se siguen leyendo
por ID propio. No se ejecutan nuevas migraciones, limpieza semanal ni envíos
de mensajes para esta continuación.
