---
id: modulo/reporte-proveedores
tipo: modulo
titulo: Reporte de Proveedores — áreas claras, compras por secciones y fichas
estado: vigente
archivos:
  - frontend/src/pages/ReporteProveedores.jsx
  - frontend/src/components/ui/NavegacionSecciones.jsx
  - frontend/src/components/ui/PanelSeccion.jsx
  - frontend/src/components/ui/Boton.jsx
  - frontend/src/components/ui/Insignia.jsx
  - frontend/src/components/pagos/TarjetasResumen.jsx
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/reporte-proveedores/NecesidadesPorCiclo.jsx
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - frontend/src/components/reporte-proveedores/FaltantesPorCiclo.jsx
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/components/reporte-proveedores/OrdenesCompraCiclo.jsx
  - frontend/src/components/reporte-proveedores/ListaFichasProveedor.jsx
  - frontend/src/hooks/useReporteProveedores.js
  - docs/informes/proveedores-redisenados-2026-10-07.md
aristas:
  depende_de: [modulo/necesidades-por-ciclo, modulo/faltantes, modulo/ordenes-compra-por-ciclo, modulo/permisos]
  relacionado: [modulo/rutas-clientes, modulo/facturas-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/cierre-ordenes-compra, modulo/archivo-ordenes-compra, decision/ciclo-de-ruta-como-contexto]
medido: 2026-10-07
---

Entrada de UI para mantener el reporte: Necesidades, Faltantes, Órdenes y
Proveedores. Necesidades sigue por defecto y exige semana o Sin ciclo explícitos.
Ruta/semana permanece visible en operaciones; fichas administra identidad/contacto
sin atribuirlos a una semana. No cambiar nombres de vistas ni condiciones de
activación para que un cambio visual dispare el GET legado de faltantes: puede
asignar proveedores. El hook solo está activo al abrir Faltantes.

Mantener el diseño del sistema: título simple, tarjetas grandes, encabezados
neutros, botones/estados existentes. `NavegacionSecciones` se comparte con
Clientes (su envoltorio conserva accesos/contador de pedidos), con modo compacto
para las secciones de una orden. `PanelSeccion`, `Boton`, `Insignia` y
`TarjetasResumen` evitan duplicar estilos. El título de `FiltroCicloOperacion`
es opcional; no cambiar sus reglas ni el aspecto de otras pantallas por accidente.

Orden → Productos / PDF y envío / Factura del proveedor / Recepción / Cerrar
orden, según estado. **Ocultar paneles sin desmontarlos** conserva PDF/adjuntos,
mensaje, cantidades/notas de recepción, búsqueda de factura y motivo sin guardar.
No usar un render condicional por sección que reinicie los hooks. Cambiar de
orden inicia Productos; navegación se bloquea durante una operación. Servicios,
copias de envío, unidades, cobertura y controles de estado conservados.

Productos enviados no se editan; factura no equivale a recepción y archivo no
borra historia. Resumen de Faltantes cubre el reporte completo de la selección,
contador de lista sigue la búsqueda visible. Desaparecer del reporte solo se
evalúa tras una consulta válida en Faltantes: error o área inactiva no prueban
que el proveedor dejó de tener pendientes.

Verificación visual local: 28 escenarios 1440/390, incluidos historial, errores,
formularios sin guardar, lectura de PDF simulado, consulta general y Clientes.
Sin errores/desbordes/escrituras/salidas; build/grafo12. Las respuestas operativas
se interceptan en el navegador, no se crean demos. Auditoría106 tablas/80
secuencias idénticas, stock0; sin backend/SQL. Ver informe para evidencia y límites.
Operativo96/3 e independencia133/14: revisiones humanas y fuente LOCAL Maps abiertas.
Migración/corte siguen aplazados; no se acredita aceptación fiscal real.
