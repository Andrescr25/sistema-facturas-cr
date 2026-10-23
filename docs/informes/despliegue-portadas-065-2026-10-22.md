# Portadas y retiro de productos de las compras — 2026-10-22

El usuario autoriza «dale a main y haz la migración pendiente». Codex publica
`ba1ca8a` (portadas sin franjas, propio), `1a62b95` (quitar productos de las
compras, de Claude, revisado) y este registro, propio de Codex. No viajan otros
cambios pendientes. SQL064 ya estaba aplicada y no se repite.

## Migración065 aplicada antes de main

Respaldo public de **20.447.432 bytes**, SHA256 comprobado y restauración local
completa verificada. Copia privada duradera fuera del repositorio en
`~/.local/share/sistema-facturas-cr/respaldos/20261022-migracion065/`.
Ensayo de SQL065 y de su repetición sobre la restauración, antes de producción.

Codex aplicó SQL065 en producción el **2026-10-22 a las23:53:47 CR** (inicio
de la transacción), con bloqueo de despliegue y límites de espera5s/consulta60s.
Comparación dentro de la misma instantánea antes y después:

- Las **146 tablas anteriores conservan sus datos**, por huellas completas.
- Los **30 triggers anteriores siguen intactos**.
- Sólo se agrega `faltante_sin_compra`, vacía, con id propio, faltante único,
  relaciones a faltante/usuario y dos índices válidos:147 tablas al terminar.

No se retiran productos ni faltantes existentes al migrar. La retirada ocurre
sólo al confirmar la acción de la interfaz. Se conservan facturas, inventario,
pagos e imágenes; no se ejecuta limpieza ni se envían mensajes de prueba.

## Verificación local

- Suite completa: **240 archivos,2955 pruebas correctas,0fallos,3omisiones
  históricas** por requisitos de cero provisional; el inventario no se altera.
  Cinco casos de Hacienda inicialmente rechazaron los secretos cifrados del
  respaldo, cuya llave no se lleva al ensayo. Se retiró esa configuración
  únicamente del clon desechable y se repitieron los cinco con sus credenciales
  simuladas: todos correctos. Ninguna configuración de producción se cambia.
- **38 comprobaciones de navegador con PostgreSQL y ROLLBACK**,390/700/1440px:
  confirmar/cancelar retirada, desaparición del producto y de la compra al
  quedar vacía, faltantes del cliente intactos, bitácora y nueva venta que
  vuelve a aparecer. Sin erroresJS ni desbordamientos.
- **171 comprobaciones de portadas**,390/700/1100/1440px: fotos verticales,
  cuadradas/horizontales,2/5/20presentaciones, imagen lenta sin salto de
  contenido, copia sin dimensiones, sin conexión y vista previa individual.
- Build correcto. Lint estricto de los componentes, página y utilidades
  tocadas correcto. Los hooks revisados arrojan13avisos de dependencias y
  argumentos sin uso,0errores; no se silencian avisos para publicar.
- Grafo y estructura verificados. Pruebas exclusivamente locales, sin
  regenerar Prisma ni instalar dependencias.

Evidencia privada: `/private/tmp/codex-despliegue-portadas-065-20261022/` y
`/private/tmp/codex-portadas-marcas-20261022/`. Los dos clones de prueba se
retiran al cerrar. La vista persistente5173/3000 se conserva sin cambios.
La comprobación pública de Render y la autoría de la publicación se registran
en la memoria compartida `permiso-subir-a-main.md`; no se afirma una sesión
autenticada remota ni se cambian claves para obtenerla.
