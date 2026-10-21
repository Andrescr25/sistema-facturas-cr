---
id: decision/portal-en-su-propio-sitio
tipo: decision
titulo: El portal de clientes se publica en su propio sitio, sin el sistema interno adentro
estado: vigente
archivos:
  - frontend/src/AppPortal.jsx
  - frontend/src/mainPortal.jsx
  - frontend/src/arranque.jsx
  - frontend/src/main.jsx
  - frontend/src/App.jsx
  - frontend/src/components/IrAlPortal.jsx
  - frontend/src/utils/urlPortal.js
  - frontend/src/services/apiPortal.js
  - frontend/vite.config.js
  - frontend/package.json
  - frontend/public/manifest-portal.json
  - frontend/src/hooks/useClientesPortal.js
  - frontend/src/pages/Clientes.jsx
  - frontend/src/pages/Dashboard.jsx
  - frontend/src/pages/Ingresar.jsx
  - backend/src/modules/cotizaciones/enlacePublico.js
  - backend/tests/portalAparte.test.js
  - backend/tests/enlaceCotizacion.test.js
  - docs/instrucciones-vigentes-usuario.md
aristas:
  relacionado: [modulo/portal-clientes, modulo/catalogo-agente, modulo/cotizaciones, modulo/dashboard]
medido: 2026-10-20
---

**Pedido del usuario, 2026-10-20:** «hay que separar los sistemas, no quiero
que los clientes puedan llegar al sistema interno / puedo subir otra img a
render».

ANTES. Un solo sitio servía el sistema interno y las páginas del cliente
(`/catalogo`, `/portal/*`, `/cotizacion/:token`). Un cliente que borraba la
dirección caía en el ingreso del personal, y su teléfono descargaba el
paquete entero (1,48 MB) con todas las pantallas internas.

AHORA. El mismo código arma dos sitios:

- `npm run build` → el sistema interno (`main.jsx` → `App.jsx`), como siempre.
- `npm run build:portal` → el portal (`mainPortal.jsx` → `AppPortal.jsx`):
  solo catálogo, cotización y `/portal/*`; cualquier otra dirección va al
  catálogo. Pesa 277 KB. `htmlDelPortal` (vite.config.js) cambia la entrada,
  el título y el manifiesto del mismo index.html, y se detiene si ese archivo
  cambia de forma que el reemplazo no ocurra. El manifiesto del sistema (con
  atajos a Facturación) se borra de la salida del portal.
- `arranque.jsx` es lo que hacen los dos al abrir (gestos, service worker,
  router): una sola copia.

ENLACES. Lo que se le manda al cliente sale de `urlPortal()`
(`VITE_PORTAL_URL` en el frontend interno) y, en el backend, de
`PORTAL_URL` (enlace de la cotización). En el sitio interno, una dirección
del cliente redirige al portal con `location.replace` (IrAlPortal), así los
enlaces ya enviados por WhatsApp siguen sirviendo y Atrás no vuelve al
sistema. El Catálogo del agente (`/catalogo-agente`) se queda en el interno:
es del personal y las tablets tienen esa dirección guardada.

LA SESIÓN SE MUDA CON EL CLIENTE (pedido del usuario: «esto es importante»).
El navegador guarda la sesión por sitio: sin esto, el cliente de un enlace
viejo llegaba al portal «afuera» y tenía que volver a ingresar. IrAlPortal
saca la sesión del sitio de siempre (se muda, no se copia: si no, «Salir» en
el portal no cerraría nada) y la lleva en el fragmento `#sesion=…`, que no
llega a ningún servidor. `recibirSesionTraspasada` (apiPortal.js) la guarda
antes de dibujar y borra el fragmento de la barra y del historial. Solo la
acepta si `document.referrer` es el sitio de siempre (`VITE_SISTEMA_URL`, por
omisión sistema-facturas-cr.onrender.com), para que nadie arme un enlace que
meta a un cliente en una cuenta ajena, y no pisa una sesión que el portal ya
tenga. Si algo falla, el cliente ingresa con su usuario como siempre.

POR ETAPAS. Primero se publicó con las páginas del cliente todavía en el
sistema interno (sin `VITE_PORTAL_URL` nada cambiaba). El 2026-10-20, con el
portal ya en línea en https://distribuidora-tachi-portal-clientes.onrender.com,
el usuario pidió «quites el acceso al portal clientes desde el sistema
normal»: el ingreso del personal y el Dashboard ya no ofrecen el catálogo de
clientes, `App.jsx` no importa ninguna página del cliente (solo IrAlPortal en
`/catalogo`, `/cotizacion/:token` y `/portal/*`) y `main.jsx` no monta la
sesión del cliente. La dirección del portal va escrita en `urlPortal.js`
(`VITE_PORTAL_URL` la reemplaza si hace falta; en localhost, el portal local
5183): poner la variable en Render ya no es necesario.

LO QUE CUIDA LA PRUEBA. `portalAparte.test.js` recorre los imports desde
`mainPortal.jsx` y falla si alcanza una pantalla del personal; desde
`main.jsx`, si alcanza una página o la sesión del cliente; `App.jsx`,
`AuthContext`, `Layout` o `RequiereSesion`; revisa el index.html que el
armado reemplaza, el manifiesto del portal sin atajos y que los enlaces al
cliente no se armen con el origen interno.

CONFIGURAR EN RENDER (lo hace el usuario). Son TRES servicios y cada uno
tiene sus variables: las `VITE_*` del frontend se graban al armar el sitio
estático, así que puestas en la API no hacen nada (pasó el 2026-10-20 con
`VITE_PORTAL_URL`). El armado del portal se detiene si falta `VITE_API_URL`:
sin ella pedía /api a su propia dirección y publicaba un catálogo vacío.
1. Nuevo *Static Site* del mismo repositorio, rama `main`, raíz `frontend`.
   Build: `npm install && npm run build:portal`. Publicar: `dist`.
   Variable: `VITE_API_URL` igual que el sitio interno. Regla de reescritura
   `/*` → `/index.html` (Rewrite), igual que el sitio interno.
2. En el sitio interno: `VITE_PORTAL_URL=https://<portal>` y volver a
   desplegar (las variables del frontend se fijan al armar).
3. En la API: `PORTAL_URL=https://<portal>`. CORS ya acepta `*.onrender.com`;
   un dominio propio habría que sumarlo en `backend/server.js`.
