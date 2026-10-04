/**
 * Enrutador adaptador de /api/alegra.
 *
 * YA NO LE HABLA A ALEGRA. Lo que queda acá son módulos PROPIOS —Bodega,
 * reportes, faltantes y órdenes de compra— que conservan el prefijo
 * `/alegra` porque las pantallas los llaman así. El prefijo se va cuando esas
 * pantallas cambien de dirección (sección 16 del checklist), no antes: mover
 * la ruta y la pantalla en dos pasos dejaría a alguien sin pantalla en el medio.
 *
 * Por eso este archivo no importa `integrations/alegra`. Si una ruta nueva
 * necesita hablarle a Alegra, no va acá: `inventarioDeAlegra.test.js` falla.
 *
 * Retirado el 2026-10-04, todo sin pantalla que lo llamara:
 *  · `/catalog`, la Gestión de Catálogo vieja (el catálogo es `/api/maestro`);
 *  · `/facturas`, las facturas de Alegra (son `/api/facturacion/facturas`);
 *  · `/productos`, `/sincronizar/*` y `/estadisticas/sincronizacion`: el
 *    módulo viejo de productos, que copiaba el catálogo de Alegra a la tabla
 *    `productos` — distinta de `producto`, el maestro. Nadie la actualizaba
 *    desde el 2026-09-09;
 *  · `/categorias`, `/contactos` y `/proveedores`, que le preguntaban a Alegra
 *    en vivo (hoy son `categoria_producto`, `/api/clientes` y
 *    `/api/proveedores`);
 *  · `/debug/*`;
 *  · `/reimpresion`. Impresión ya vivía en `/api/reimpresion`, con su permiso,
 *    y es lo que llama la pantalla. Este segundo montaje quedaba debajo de un
 *    prefijo COMPARTIDO: cualquiera con sesión, sin el módulo, podía procesar
 *    una factura de la cola —que la edita— o vaciar el historial.
 *
 * ANTES DE MONTAR ALGO ACÁ: `/alegra` es compartido. Lo que cuelgue de este
 * archivo no pide permiso salvo que `usuarios/modulos.js` le dé dueño al
 * prefijo completo, como hace con `/alegra/bodega`.
 */

const express = require('express');
const router = express.Router();

const reportsRoutes = require('../src/modules/reports');
const ordersWhatsappRoutes = require('../src/modules/orders-whatsapp');
const warehouseRoutes = require('../src/modules/warehouse').routes;
const missingItemsRoutes = require('../src/modules/missing-items').routes;

// Facturas en Bodega: tiene su propio permiso (`facturas-bodega`), aunque
// viva debajo de un prefijo compartido.
router.use('/bodega', warehouseRoutes);

// Reporte de clientes y de proveedores, y el historial (`/reportes/historial`).
router.use('/reportes', reportsRoutes);

// Ajustes de faltantes.
router.use('/faltantes', missingItemsRoutes);

// Órdenes de compra y su envío por WhatsApp.
router.use('/orden-compra', ordersWhatsappRoutes);

// Facturación NO se monta acá: vive en /api/facturacion (ver server.js).
// Debajo de /alegra quedaba sin permiso, porque ese prefijo es compartido —
// cualquiera con sesión podía llamar hasta el POST que crea la factura.

module.exports = router;
