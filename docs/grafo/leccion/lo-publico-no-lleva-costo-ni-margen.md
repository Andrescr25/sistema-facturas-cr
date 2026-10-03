---
id: leccion/lo-publico-no-lleva-costo-ni-margen
tipo: leccion
titulo: Una ruta pública entrega una lista de campos, nunca el objeto entero — salían el costo y los márgenes
estado: vigente
archivos:
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/src/modules/precios/ofertasPorBaja.js
  - backend/src/modules/auth/auth.middleware.js
  - backend/tests/catalogoAgenteSinCosto.test.js
  - backend/tests/ofertasPorBaja.test.js
aristas:
  relacionado: [modulo/catalogo-agente, leccion/dos-clases-de-oferta, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-10-03
---

Las rutas del catálogo del agente y del catálogo de clientes se abren SIN
sesión (`PUBLICAS` y `PUBLICAS_EXACTAS` en `auth.middleware.js`): fue una
decisión consciente, para que el agente trabaje sin señal y el cliente abra un
enlace. Lo que no se había mirado es QUÉ viajaba por ellas.

Medido el 2026-10-03, recorriendo las once rutas públicas y listando los
nombres de campo de cada respuesta:

- `/catalogo-agente/productos` devolvía el producto de Alegra ENTERO, tal como
  llega de `/items`. Ahí va `inventory.unitCost`: el costo de compra de cada
  producto, más existencias, cuentas contables y todas las listas de precios.
- `/catalogo-agente/ofertas-baja` y `/catalogo-clientes/ofertas-baja` devolvían
  `margenAntes` y `margenAhora` de cada producto rebajado. Con el precio al
  lado, el costo se despeja.

Ninguna pantalla usaba esos campos. Salían porque nadie los había quitado.

**La regla:** lo que sale por una ruta pública se arma como una lista de lo
que SÍ pasa (`aFormaDeTablet` en el catálogo del agente), no reenviando lo
que devuelve Alegra o la base y quitando lo que molesta. Con una lista de lo
que se quita, el campo sensible que aparezca mañana sale solo; con una lista
de lo que pasa, hay que agregarlo a propósito. El margen puede seguir
decidiendo qué es una oferta —vive en el `WHERE`— sin viajar en la respuesta.

Las dos pruebas fijan los campos exactos de cada respuesta: agregar uno las
rompe hasta que alguien decida que tiene que salir.

**Cómo volver a medirlo:** pedir cada ruta de `PUBLICAS` sin token y buscar,
a cualquier profundidad, nombres de campo con `cost`, `margen`, `utilidad`,
`proveedor` o `inventory`. La tablet se probó con la respuesta recortada
contra la de antes: mismas categorías, mismos precios, mismas fotos y la
búsqueda igual.
