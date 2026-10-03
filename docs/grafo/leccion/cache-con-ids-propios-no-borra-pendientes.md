---
id: leccion/cache-con-ids-propios-no-borra-pendientes
tipo: leccion
titulo: Cambiar los ids del catálogo invalida la consulta, pero conserva pedidos pendientes
estado: vigente
archivos:
  - frontend/src/utils/catalogoAgenteDb.js
  - frontend/src/hooks/useCatalogoAgente.js
  - frontend/src/pages/CatalogoAgente.jsx
  - frontend/src/services/indexedDBService.js
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/tests/catalogoAgenteIdsPropios.test.js
aristas:
  relacionado: [modulo/catalogo-agente, modulo/portal-clientes, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fotos-del-catalogo-en-la-tablet]
medido: 2026-10-03
---

SECCIÓN 12, PARTE 3. `AlegraCatalogReactDB` conserva su nombre y pasa a
versión 3. Cambiar el nombre abandonaría la copia instalada sin migrarla.
Antes, `id="12"` era el ítem de Alegra; ahora es `producto.id=12`, que puede
ser otra ficha. Los endpoints compactos llevan `versionIds: propios-v1`.
`productoId` identifica la ficha; `id` es su representación como texto para
los mapas y las tarjetas existentes. El historial usa `cliente.id`.

LA INVALIDACIÓN ES CONJUNTA. Al abrir v1/v2 se borran productos, clientes,
historial, ofertas, rebajas, nuevos, rotación, cliente elegido y fecha de
actualización. Se conserva el orden de categorías y las fotos por URL:
no usan aquellos ids. La pantalla pide actualizar con internet antes de salir.
Si otra pestaña bloquea la migración, se pide cerrarla; no se usa el caché viejo.

EL TRABAJO PENDIENTE VIVE EN OTRA BASE. `SistemaFacturasCR` contiene
`pedidos_agente` y `facturas_pendientes`. La migración del catálogo no la abre
ni la borra. La pantalla sigue siendo de consulta: no se restauran controles
para armar pedidos. La ruta del agente conserva la cola histórica: los campos
explícitos `alegraContactId`/`alegraItemId` se traducen SOLO por `alegra_id`.
El contrato propio usa `clienteId`/`productoId`; mezclarlos devuelve 400.
La clave de idempotencia se conserva. Cabecera y líneas son una transacción;
ON CONFLICT reconoce envíos simultáneos sin dejar un pedido incompleto.

LA COPIA ANTERIOR SOLO SE REEMPLAZA COMPLETA. Una página fallida se reintenta
hasta tres veces al mismo offset; si no llega, no se avanza ni se confirma.
Se verifica el marcador, los ids propios y su unicidad. Productos, clientes
y metadatos se guardan en una sola transacción IndexedDB, incluidos errores
sincrónicos de `put()`. Las fotos se guardan después. Un 401 de orden o
rotación conserva su última copia y se avisa, conforme a la decisión de sesión.

VERIFICADO EN CHROMIUM: migración v2→v3 con un número antiguo que coincide
con uno propio; borrado conjunto de consulta y conservación del orden,
fotos y pendientes; descarga paginada desde PostgreSQL; CRUD de la lista
manual; cliente sin compras; consulta sin señal y tras recargar. Un 503
provocado en el offset 30 recibe tres intentos y conserva productos y fecha;
un `QuotaExceededError` provocado revierte también el clear. Tablet de
700 px y escritorio de 1440 px. Un 401 provocado de orden y rotación conserva
ambos valores y muestra el aviso sin redirigir al ingreso. Los datos escritos viven solo en una copia
desechable, sin mensajes reales ni limpieza semanal.
