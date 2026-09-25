---
id: modulo/gestion-catalogo
tipo: modulo
titulo: Gestión de Catálogo — categorías, subcategorías y fotos, en el orden del agente
estado: vigente
archivos:
  - backend/src/modules/catalogo/catalogo.service.js
  - backend/src/modules/catalogo/catalogo.controller.js
  - backend/src/modules/catalogo/catalogo.routes.js
  - backend/src/modules/catalogo/categorias.service.js
  - backend/src/modules/catalogo/subcategorias.service.js
  - frontend/src/pages/GestionCatalogo.jsx
  - frontend/src/hooks/useTaxonomiaCatalogo.js
  - frontend/src/hooks/useListaCatalogo.js
  - frontend/src/hooks/useAccionesLote.js
  - backend/tests/arbolCatalogo.test.js
  - backend/tests/catalogoLote.test.js
aristas:
  depende_de: [tabla/alegra-products-cache, tabla/subcategoria, tabla/categoria-config, tabla/supplier-product-mapping]
  relacionado: [modulo/catalogo-agente, decision/orden-canonico-compartido, decision/cambio-de-categoria-en-segundo-plano, decision/permisos-por-prefijo-mas-especifico, leccion/precio-sin-iva-costo-con-iva, leccion/proveedor-por-cedula]
medido: 2026-09-25
---

QUÉ ES

`/gestion-catalogo`, con la forma del resto del sistema (Reporte
Proveedores, Cuentas por Cobrar): tarjetas de resumen que filtran, una
cuadrícula de categorías grandes y, al entrar a una, sus subcategorías como
secciones con los productos adentro. La categoría es de Alegra; la
subcategoría, el orden y el nombre visible son nuestros.

DE DÓNDE SALE CADA COSA

- `GET /alegra/catalog/arbol`: categorías con `total`, `sinClasificar`,
  `sinImagen` y sus subcategorías. Si Alegra no responde, cae a
  `categorias.service.listarDesdeCache()` y devuelve `sinAlegra: true`: se
  puede clasificar y poner fotos; mover de categoría y crear categorías no
  (esas escriben en Alegra, y sin su id no hay a dónde).
- `GET /productos-de-categoria`: TODOS los productos de una categoría (la más
  grande ronda 450), con margen, rotación y proveedor principal en una sola
  consulta. La rotación es la de `ventas/rotacion.js`, en el momento (ver
  [[modulo/rentabilidad]]).
- `GET /productos`: la búsqueda en todo el catálogo, por texto y/o por
  proveedor (cédula). Trae los mismos datos por fila que la vista de
  categoría.

EL MARGEN NO SE CALCULA ACÁ: sale de `clasificarProducto`
(`precios/auditoria.js`) con la tarifa de IVA real del producto — ver
[[leccion/precio-sin-iva-costo-con-iva]].

ACCIONES EN LOTE, CON COSTOS DISTINTOS A PROPÓSITO

- Mover a subcategoría: local, un solo `UPDATE`, instantáneo.
- Cambiar de categoría: escribe en Alegra, ~3 s por producto — va en segundo
  plano, ver [[decision/cambio-de-categoria-en-segundo-plano]].
- Arrastrar una subcategoría entera a otra categoría es el mismo trabajo de
  fondo, con un paso final que la fusiona si en el destino ya hay una con el
  mismo nombre.

PERMISOS: todo `/alegra/catalog` es del módulo `gestion-catalogo`, salvo tres
rutas de fotos que usan otras pantallas — ver
[[decision/permisos-por-prefijo-mas-especifico]].
