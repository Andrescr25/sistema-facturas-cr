/**
 * Cuentas por Cobrar - Routes
 * Montadas en /api/cuentas-por-cobrar (ver server.js)
 *
 * TODO SALE DE LA BASE PROPIA. Hasta acá convivían dos caminos: estas rutas y
 * las que leían `cuentas_por_cobrar`, el espejo que se copiaba de Alegra cada
 * 30 minutos. El espejo se retiró junto con su sincronización, así que las
 * rutas viejas se fueron con él: dejarlas habría sido peor que borrarlas —
 * seguirían respondiendo, pero con la última foto antes de apagar la copia, y
 * sin nada en la respuesta que dijera que está vieja.
 *
 * El prefijo `/propios` se conserva por ahora porque la pantalla llama así;
 * quitarlo es un cambio de nombres a los dos lados y va en el retiro de Alegra.
 */

const express = require('express');
const router = express.Router();
const cobros = require('./cobros.controller');

router.get('/propios/deudores', cobros.deudores);
router.get('/propios/facturas/:id/abonos', cobros.abonos);
router.post('/propios/abonos', cobros.registrar);
router.patch('/propios/abonos/:id/anular', cobros.anular);

// El recordatorio de saldo: el texto lo arma el SERVIDOR, con los mismos
// datos que muestra la pantalla.
router.get('/propios/clientes/:id/recordatorio', cobros.propuestaRecordatorio);
router.post('/propios/clientes/:id/recordatorio', cobros.enviarRecordatorio);

// El cierre de caja: lo cobrado en el día y si el efectivo cuadra.
router.get('/propios/caja', cobros.resumenCaja);
router.post('/propios/caja/cerrar', cobros.cerrarCaja);
router.post('/propios/caja/reabrir', cobros.reabrirCaja);

module.exports = router;
