# Despliegue completo a main — 2026-10-13

Usuario: «perfecto, despliega todo a main», seguido de «continua».
Responsable de la publicación: Codex. Se revisa developer e0b2225 frente a
main e5b1cd2; no hay cambios locales ajenos ni commits sin verificar.

## Contenido preparado para producción

- Claude: 201d07b, frecuencia individual y próxima visita en Clientes;
  integrado y revisado por Codex sobre la acumulación de órdenes.
- Codex: 5a2cedd, relevo de rotación y anulación con crédito completo.
- Codex: ebd7ac9, Reporte de clientes por ruta actual y próxima visita.
- Codex: 630589c, agenda de Preventa por ruta y rotación individual.
- Codex: 7b156b4, Carga/entregas con todas las facturas pendientes de la ruta.
- Codex: e0b2225, Proveedores con solo Faltantes y fichas; una enviada
  permanece igual y los nuevos faltantes generan otra orden independiente.

Esta actualización documental registra el despliegue y las migraciones; no
cambia lógica ni incorpora trabajo pendiente. ROT-06/07 (impresos tras 24 h
SIN MOVIMIENTO) y el resto de ROT-08 continúan abiertos.

## Migraciones aplicadas en producción por Codex

Se confirma que 056 ya estaba aplicada: columna cliente.rotacion_dias.
Faltaban 057/058 y la 055 de imágenes de categoría, aunque su código estaba
en main. La ausencia de 055 explicaba el 503 de subida; se incluye para
completar el despliegue autorizado.

055, 057 y 058 aplicadas **el 13 de octubre a las 19:31, Costa Rica**, en
una transacción, con lock_timeout 5 s y statement_timeout 45 s. No se
regenera Prisma ni se instalan dependencias compartidas.

- 055 agrega categoria_config.imagen nullable JSONB, sin cambiar categorías.
- 057 permite recorrido_id NULL en entrega_evento, mantiene FK y eventos
  previos; instala ruta operativa, vigencia, firma y guardas físicas por ruta.
- 058 retira solo la igualdad de ciclo al reservar un faltante en la orden;
  conserva identidad, cobertura, capacidad y protección tras envío.

Respaldo completo previo del esquema public: dump privado de PostgreSQL 17,
18.005.380 bytes, SHA-256 guardada; lectura/restauración comprobada. Se
capturan definiciones originales antes de mutar. 144 tablas con la misma
huella antes/después; para categoria_config se comparan todas las columnas
anteriores y se exige imagen NULL. Se comprueban los seis cuerpos de función
contra los SQL exactos y los tipos/nullabilidad esperados. Sin backfill,
ningún registro de negocio reescrito ni envío/recepción/stock inventados.

La intervención en producción se limita a este despliegue autorizado.
Desarrollo y pruebas que escriben siguen en copias locales; ninguna llamada
de envío ni limpieza semanal. Evidencia/respaldo con permisos privados fuera
del repositorio: /private/tmp/codex-despliegue-main-20261013/.

## Validación antes de publicar

El mismo respaldo de producción se restaura en una base local desechable;
las tres migraciones conservan allí también las 144 tablas. 200 pruebas
específicas con PostgreSQL aprobadas, sin omisiones/fallos: imágenes, rotación,
Reporte Clientes, Preventa, Carga/entregas, Proveedores, órdenes, envío,
permisos, unidades y cadena histórica. Mensajes simulados y ROLLBACK; los
fixtures confirmados para concurrencia quedan únicamente en esa copia.

Suite completa vigente de e0b2225: 2.776 casos, 2.431 aprobados y 345
condicionales omitidos, cero fallos. Navegador 390/700/1440 con API local y
transporte simulado correcto; informes de cada parte conservan el detalle.
Build adicional con VITE_API_URL de producción aprobado. Esta actualización
documental verifica grafo y estructura antes de publicar.

## Publicación y comprobación

Destino autorizado: main por avance sin fusión desde developer; las SQL ya
están aplicadas antes del push. Se informa qué commits son de cada agente
arriba y en el registro compartido permiso-subir-a-main.md. Tras el push se
comprueba GitHub y la actualización de web/API de Render mediante lecturas,
sin crear registros de prueba ni mandar mensajes en producción. El resultado
y el commit final publicado quedan registrados en el relevo de despliegue.
