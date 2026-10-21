---
id: modulo/preventa-agenda
tipo: modulo
titulo: Preventa — todos los clientes de la ruta por próxima visita
estado: vigente
archivos:
  - backend/src/modules/preventa/preventa.routes.js
  - backend/src/modules/preventa/preventa.controller.js
  - backend/src/modules/preventa/preventa.service.js
  - backend/src/modules/rutas/rutaActual.service.js
  - backend/src/modules/clientes/rotacion.js
  - backend/src/modules/usuarios/modulos.js
  - backend/server.js
  - frontend/src/pages/Preventa.jsx
  - frontend/src/hooks/useAgendaPreventa.js
  - frontend/src/hooks/useContextoConsulta.js
  - frontend/src/utils/agendaPreventa.js
  - frontend/src/utils/modulos.js
  - frontend/src/components/Layout.jsx
  - frontend/src/App.jsx
  - frontend/src/components/preventa/FiltrosAgenda.jsx
  - frontend/src/components/preventa/ListaAgenda.jsx
  - frontend/src/components/preventa/DetalleVisita.jsx
  - frontend/src/components/clientes/RotacionCliente.jsx
  - frontend/src/components/pagos/TarjetasResumen.jsx
  - backend/tests/agendaPreventa.test.js
  - backend/tests/dobles/agendaPreventa.js
  - docs/informes/preventa-agenda-2026-10-13.md
aristas:
  relacionado: [decision/rotacion-por-cliente-sin-ciclos, modulo/rutas-clientes, modulo/reporte-clientes, modulo/permisos, modulo/preventa-por-enlace, modulo/facturacion, leccion/fecha-utc-costa-rica]
medido: 2026-10-13
---

ROT-04: agenda interna **Preventa** en `/preventa`, menú Ventas. Se elige una
ruta actual de la ficha o «Clientes sin ruta». Incluye TODOS sus clientes
activos, tengan o no faltantes. No pide semana, ni crea documentos, visitas,
recordatorios o envíos. El catálogo por enlace y `preventa_anticipada`
conservan su funcionamiento y sus rutas.

## Datos y reglas compartidas

`GET /preventa/rutas`: solo id/nombre/activo; rutas activas sin ciclos e
inactivas con fichas asignadas. `GET /preventa/agenda?rutaId=…`: hoy de Costa
Rica y fichas activas, contacto/dirección, ruta actual y rotación. No expone
saldos, notas privadas ni XML fiscales. Falta de selección o id inválido
responde 400; ruta válida sin clientes devuelve vacío. Desde el 2026-10-20 un
`cicloId` de una pestaña vieja ya no se revisa: se ignora como cualquier otro
parámetro desconocido.

Una consulta de clientes, con `ULTIMA_ATENCION_SQL`, sin consultas por
producto ni llamadas a otras integraciones. Última factura emitida vigente
excluye anuladas y crédito total; parcial o cobro completo conserva atención.
`rotacionDe` y `ordenPorProximaVisita` son los mismos de Clientes/Reporte.
No se guarda próxima visita. Facturar, cambiar fecha, anular, cambiar
frecuencia o ruta se reflejan al leer; no se altera historia de documentos.

Filtro SQL y selector mínimo de ruta viven en `rutas/rutaActual.service.js`,
una sola copia compartida con Reporte Clientes. No se inventan frecuencias
ni fechas para fichas nuevas.

## Pantalla y permisos

Tarjetas y grupos Atrasados, Hoy, Próximos, Sin rotación, Sin facturas.
Dentro de cada grupo conserva orden por visita. Busca por palabras sin
tildes/mayúsculas, filtra estado y abre un detalle por id propio (homónimos
visualmente distinguidos por número de ficha). Volver conserva ruta,
búsqueda y estado. TarjetasResumen/Boton/Insignia y RotacionCliente reutilizados.

Permiso propio `preventa` en ambos registros. Administradores entran; para
personal se otorga desde Usuarios. No necesita Clientes ni Reporte Clientes,
y esos permisos solos tampoco conceden Preventa. RequireAuth/requirePermiso
protegen todo `/api/preventa`, incluidas mayúsculas/barra final. El portal
público no lo abre. Respuestas `Cache-Control: no-store`.

El hook invalida selección por identidad y revisión, cancela solicitudes y
rechaza respuestas viejas incluso A → B → A. Actualiza al volver a la pestaña,
al tocar Actualizar y al cambiar el día en Costa Rica; no se recarga cada
minuto sin motivo. Si la ficha salió de la ruta o se desactivó, cierra el
detalle y avisa. Reintentos independientes para rutas y agenda.

Pruebas, navegador y límites: [informe](../../informes/preventa-agenda-2026-10-13.md).
