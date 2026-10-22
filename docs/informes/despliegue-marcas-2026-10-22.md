# Marcas del catálogo y título más suave — 2026-10-22

El usuario aprueba la función36af6b9 y autoriza main, pidiendo primero que el
nombre de marca se vea menos tosco. Codex reduce el peso de800 a500, el tamaño
de18/20 a16/18px, elimina las mayúsculas forzadas y el espaciado amplio y usa
un tono neutro con algo más de aire superior. Se conserva la fuente del sistema;
no se descarga otra tipografía ni se cambia el nombre guardado.

## Publicación

Viaja36af6b9 (marcas, imagen general y presentaciones con vista previa), propio
de Codex y previamente verificado, junto al ajuste de tipografía y este registro,
también de Codex. No se agregan commits nuevos de otro agente. Antes del push a
main se aplica SQL064, ya ensayada sobre el respaldo restaurado localmente.

## Migración064

Respaldo public de **20.408.064 bytes**, con SHA256 comprobado y
restauración completa sin errores antes de tocar el esquema remoto. Ensayo de
SQL064 y su repetición sobre ese clon; pruebas de negocio sólo locales.

SQL064 aplicada por Codex en producción el **2026-10-22 12:03:03 CR**, en una
transacción con bloqueo de despliegue, lock_timeout5s y statement_timeout60s.
La comparación dentro de la misma instantánea antes y después confirma:

- **145 tablas anteriores conservadas**, mismas columnas previas, filas e
  importes por huellas completas; las columnas nuevas no ocultan cambios.
- **29 triggers anteriores intactos**, más el nuevo control de marca/producto.
- Nueva marca_catalogo vacía y producto.marca_catalogo_id nulo para los productos
  existentes: ninguna asignación inventada ni producto duplicado.
- Dos índices nuevos válidos;146 tablas al terminar.

No se cambian archivos de imágenes, inventario, permisos, documentos o pagos
anteriores. No hay datos ficticios ni mensajes de prueba en producción, no se
regenera Prisma ni se ejecuta limpieza semanal.

## Verificación

- Suite completa sobre clon local separado: **239 archivos,2941 pruebas
  correctas,0fallos,3 omisiones históricas**; no se cambia el inventario para
  activar auditoría/corte que requieren cero provisional.
- **28 pruebas dirigidas sobre la restauración del respaldo**, con10casos de
  marca, clasificación, traslados, imagen, limpieza/reversión y SQL repetible.
- **30 comprobaciones Chromium390/700/1440**, cero erroresJS: crear/asignar
  marca y subir foto por UI, permisos401/403, lista de presentaciones,
  individuales/sueltos, búsqueda, fotografía32mm correcta sin petición API,
  Escape y posición conservada, recarga offline con ambas fotos decodificadas.
  Capturas revisadas con la nueva tipografía.
- Build y lint del ajuste correctos. El lint global tiene9errores/25avisos
  anteriores, documentados y reproducidos sin el cambio en7ab6e1c. No se
  silencian ni se tocan pantallas ajenas para este ajuste.
- Grafo/estructura verificados; vista5173/3000 conserva el clon limpio con064.

Evidencia privada: /private/tmp/codex-marcas-main-20261022/. Los clones de ensayo
se retiran al cerrar; la vista local permanece. El estado final de Render y quién
publicó cada commit se registran en la memoria compartida permiso-subir-a-main.md.
