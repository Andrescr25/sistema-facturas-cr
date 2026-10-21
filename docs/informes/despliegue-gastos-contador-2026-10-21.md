# Publicación de Gastos y Contador — 2026-10-21

Usuario: «ok subelo a main», después de revisar ambos módulos y conocer que
faltaba aplicar SQL061. Responsable: Codex. Se revisa origin/main..developer:
sólo c321c09 (Gastos) y 87a8d35 (Contador mensual), ambos de Codex. Este
registro también es de Codex; no viajan cambios nuevos de Claude.

## Migración antes del código

SQL061 aplicada en producción el **21/10 a las 17:20:18 CR (23:20:18 UTC)**.
Transacción REPEATABLE READ, bloqueo asesor de despliegue, lock_timeout 5 s,
statement_timeout 45 s. COMMIT sólo tras las comprobaciones:

- Las 144 tablas anteriores conservan filas y huella de todas sus columnas
  originales. La comparación ordena por nombre de tabla, independientemente
  del orden en que el planificador ejecutó los agregados.
- Se conservan las definiciones de los 27 triggers anteriores.
- Cuatro índices nuevos válidos; guardas sin catálogo instaladas.
- Proveedores y facturas existentes comerciales por omisión. PDF y claves de
  idempotencia nuevos en NULL, sin reescribir sus datos previos.
- Tabla de gastos inicialmente vacía; no se convierten facturas antiguas,
  se crean pagos ni se cambian costos/inventario/datos fiscales.

Respaldo completo privado de public, PostgreSQL17: **20.280.980 bytes** y
SHA256 registrada fuera de Git. Restauración local completa con salida 0.
La misma SQL ensayada sobre el respaldo conserva también las 144 tablas.
Pruebas sólo sobre ese clon, nunca sobre producción.

## Verificación vigente

- Suite completa del código publicado: 235 archivos, 2918 casos; 2915
  correctos, tres ensayos históricos que exigen inventario cero omitidos.
- Copia restaurada del respaldo previo a producción: **27 pruebas dirigidas
  correctas, sin omisiones**: recepción/clasificación de gastos, concurrencia,
  stock/costos intactos, CxP/pagos, revisión fiscal, XML/XSD firmado con
  transporte simulado, mes del contador, Excel/ZIP y correo simulado.
- Chromium móvil/tableta/escritorio de ambos módulos: 32 comprobaciones de
  Gastos y 21 de Contador; sin errores JavaScript ni desbordamientos.
- Build, ESLint del cambio y estructura/grafo correctos. Los reportes
  anteriores siguen descargables sin reemplazarse.

Sin limpieza semanal, mensajes/comprobantes reales de prueba, regeneración
Prisma o dependencias instaladas. No se habilitan usuarios/canales ni cambian
credenciales. La copia desechable se retira tras verificar; la vista limpia
5173/3000 se conserva.

## Publicación y comprobación de Render

Avance sin fusión desde developer a main, con SQL aplicada previamente.
Tras el push, lectura de la página/asset y GET autenticados de Gastos y mes
Contador para confirmar despliegue, sin crear registros de prueba. El resultado
final y el commit publicado se registran en la memoria compartida
permiso-subir-a-main.md. Recargar la página y las tablets después de actualizar.

Evidencia/respaldo privados fuera del repositorio:
`/private/tmp/codex-despliegue-gastos-20261021/`.
