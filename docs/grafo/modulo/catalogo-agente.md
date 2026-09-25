---
id: modulo/catalogo-agente
tipo: modulo
titulo: Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar
estado: vigente
archivos:
  - frontend/src/pages/CatalogoAgente.jsx
  - frontend/src/utils/catalogoAgentePersonalizacion.js
  - frontend/src/utils/buscarCatalogoAgente.js
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - backend/tests/subgruposCatalogoAgente.test.js
  - backend/tests/busquedaCatalogoAgente.test.js
  - backend/tests/catalogoClienteNuevo.test.js
  - frontend/src/components/catalogo-agente/SelectorCliente.jsx
  - backend/tests/liquidacionSinStock.test.js
  - backend/src/modules/ventas/rotacion.js
aristas:
  depende_de: [tabla/alegra-products-cache, tabla/subcategoria, tabla/categoria-config, tabla/venta-historico]
  relacionado: [modulo/gestion-catalogo, decision/orden-canonico-compartido, leccion/dos-clases-de-oferta]
medido: 2026-09-25
---

El catálogo que el agente le muestra al cliente. Es de solo mirar: el
pedido se toma en Facturación. Cada categoría se parte en familias (sus
subcategorías), en el orden de `categoria_config.orden` y `subcategoria.orden`
— el mismo que ve Gestión de Catálogo, porque las dos pantallas usan las
mismas funciones ([[decision/orden-canonico-compartido]]). El agente recibe
ese orden de `GET /catalogo-agente/config-catalogo`; sin él (no sincronizó o
falló) todo sale alfabético.

Con un cliente elegido, el orden se personaliza (`ordenarCatalogoParaCliente`:
lo que suele comprar primero). Al quitar el cliente, vuelve al orden normal y
arriba de todo.

La búsqueda (`buscarCatalogoAgente.js`) descarta el agrupado y devuelve una
lista plana; Gestión de Catálogo hace lo mismo al buscar.

"Bajamos el precio" también va en el orden del catálogo (2026-09-24): un
bloque por categoría y, dentro, por subcategoría (`enOrdenDelCatalogo`, que
es `ordenarCatalogoParaCliente` sin cliente). Antes iba por porcentaje de
rebaja y los productos salían revueltos. "Liquidación" sigue por porcentaje.

CLIENTE NUEVO (2026-09-25). En el selector de clientes, "Cliente nuevo" va
siempre arriba y aparece al buscarlo. No existe en Alegra: es un id fijo
(`CLIENTE_NUEVO_ID`) sin compras. Con él elegido, en vez del catálogo
completo se ve `catalogoClienteNuevo`: OFERTA (las rebajas, con la etiqueta
"OFERTA" en vez del porcentaje), LIQUIDACIÓN (los excesos, con su
descuento), después rotación A ("Lo más vendido") y después B ("También se
vende bien"), cada una por categoría y subcategoría. Ningún producto sale dos
veces: la liquidación gana (su descuento se cobra encima del precio rebajado,
así que es el precio real), y lo de oferta no se repite en A/B. La C no se
muestra, y el buscador sigue viendo todo el catálogo. La rotación baja al sincronizar de
`GET /catalogo-agente/rotacion` (solo ids, pide sesión) y se guarda en la
tablet como las rebajas. Es la rotación EN EL MOMENTO de
`ventas/rotacion.js` (unidades de los últimos 3 meses, la misma de
[[modulo/rentabilidad]]); la foto a mano de `producto_rotacion` ya no se usa.

Las ofertas en la tarjeta son DOS cosas distintas — ver
[[leccion/dos-clases-de-oferta]].

LA TARJETA NO DICE NADA DEL STOCK (2026-09-25, decisión del usuario): el
negocio es intermediario, casi nunca tiene existencias y vende con el stock
del proveedor. "Agotado" y "Quedan N" se quitaron, y un producto en cero sale
en su lugar como cualquier otro. La única excepción es Liquidación, que sí es
mercadería física (sale sola cuando se acaba: `liquidacionSinStock.test.js`).
