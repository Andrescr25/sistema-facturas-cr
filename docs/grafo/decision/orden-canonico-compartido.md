---
id: decision/orden-canonico-compartido
tipo: decision
titulo: El orden del catálogo vive en UN archivo del frontend, y ese archivo no puede importar nada
estado: vigente
archivos:
  - frontend/src/utils/catalogoAgentePersonalizacion.js
  - backend/tests/ordenCanonicoGestion.test.js
  - backend/tests/subgruposCatalogoAgente.test.js
aristas:
  relacionado: [modulo/gestion-catalogo, modulo/catalogo-agente, tabla/categoria-config, tabla/subcategoria]
medido: 2026-10-07
---

Gestión de Catálogo tiene que mostrar las categorías y familias en el MISMO
orden que el catálogo del agente — es la forma de saber de un vistazo dónde
va a aparecer un producto. Por eso las dos pantallas usan las mismas
funciones de `catalogoAgentePersonalizacion.js`: `ordenDeCategorias`,
`partirPorSubcategoria` y `compararSubcategorias`. Gestión pasa
`{ sinClasificarSiempre: true }` para que el bloque "Sin clasificar" aparezca
aunque la categoría no tenga ninguna subcategoría (es justo donde hay que
crear la primera); el agente no. Los bloques que no son el catálogo entero
—"Bajamos el precio" (`enOrdenDelCatalogo`) y las secciones de Cliente nuevo
(`catalogoClienteNuevo`)— se ordenan con las mismas funciones.

2026-10-07: el agente recorre las familias seguidas en una cuadrícula por
categoría y dice la subcategoría en cada tarjeta. Compartir fila no modifica
el orden manual ni la prioridad del cliente. Gestión conserva sus bloques
de administración y este helper mantiene su contrato sin imports.

LA TRAMPA: ESE ARCHIVO NO PUEDE TENER NI UNA LÍNEA `import`.

Las pruebas del backend (CommonJS) cargan este módulo ESM leyendo el texto
del archivo, quitándole los `export` y evaluándolo con `new Function`
(`subgruposCatalogoAgente.test.js`, `ordenCanonicoGestion.test.js`; lo mismo
hace `busquedaCatalogoAgente.test.js` con `buscarCatalogoAgente.js`). Un
`import` ahí adentro revienta esas pruebas. Por eso el orden compartido se
quedó en este archivo en vez de mudarse a uno nuevo, y por eso cualquier
ayuda que necesite se escribe adentro, no se importa.
