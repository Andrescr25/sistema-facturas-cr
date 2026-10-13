# Rotación por cliente: cierre del relevo de Claude

El usuario pidió continuar el trabajo que Claude dejó a medias. Su último
pedido guardado era aplicar la migración autorizada, subir esta parte a
`developer` y devolver el pendiente; se respeta esa rama de destino.

## Resultado

Claude implementó ROT-01/02 en `479ffb2`: frecuencia de 1 a 365 días en la
ficha, valores frecuentes a un toque y próxima visita calculada desde la
última factura. No asigna una frecuencia a los clientes que no la tienen.
Codex lo integró en su propia copia sobre `e5b1cd2` (órdenes automáticas),
preservando la firma de Claude; el commit integrado es `201d07b`.

La revisión encontró que una anulación con nota completa conservaba
`estado = 'emitida'` y seguía contando como última atención. Se excluye con
el mismo predicado de Facturación/Bodega, ahora centralizado en
`facturacion/saldo.sql.js`. Notas parciales, cobros completos y facturas
gratuitas sin créditos siguen contando; anular la nota restaura la visita.
La frecuencia es lo único guardado; ninguna tarea recalcula fechas.

Claude dejó dos documentos sin commit que registran la aplicación autorizada
de la 056 en producción, el 2026-10-13 a las 12:37, conservando 250 clientes.
Codex recuperó ese relevo documental y no repitió la conexión/migración de
producción. La publicación se completa en `developer`, junto al arreglo y
este estado del relevo; `main` conserva `e5b1cd2`.

## Verificación

- Suite completa: 2.761 pruebas; 2.416 aprobadas, 345 condicionales omitidas,
  cero fallos o cancelaciones. Incluye grafo y estructura.
- 41 pruebas específicas: rotación, fechas y Bodega, todas aprobadas y sin
  omisiones. PostgreSQL real en una copia desechable de la base local,
  con BEGIN/ROLLBACK para clientes, facturas, créditos y cobros de prueba.
- Build del frontend aprobado, sin instalar dependencias ni generar Prisma.
- Chromium: crear con 22 días y actividad `4752.1`, ver 1 de noviembre desde
  el 10 de octubre, editar a 7, bloquear 400, quitar la frecuencia, facturar
  y anular con nota completa. Ficha y formulario a 390/700/1440 píxeles, sin
  errores JavaScript ni desbordes. Controladores/servicios reales contra la
  copia local, sesión simulada, salidas bloqueadas y rollback final.

La copia desechable se elimina al cerrar. Los registros de prueba no se
insertan en la base de vista previa ni en producción. No se ejecuta limpieza
semanal ni se envían mensajes reales. La base de vista previa recibe solo
la columna 056, sin asignar frecuencias ni cambiar filas de clientes.

## Sigue pendiente

ROT-03 (Reporte de clientes solo por ruta) es el siguiente paso. Después,
ROT-04 (agenda Preventa), ROT-05 (Carga/entrega), ROT-06/07 (impresos 24 horas
e historial) y ROT-08 (retiro restante de ciclos). Los recorridos y documentos
históricos se conservan. Antes de Carga/entrega hay que definir qué facturas
componen la carga; antes del historial, si próxima visita es foto del momento
o cálculo actual. El detalle vive en la decisión del grafo y el checklist.
