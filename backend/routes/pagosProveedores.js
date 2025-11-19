const express = require('express');
const router = express.Router();
const pagosProveedoresService = require('../services/pagosProveedoresService');

router.get('/', async (req, res) => {
  try {
    const {
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas
    } = req.query;

    const result = await pagosProveedoresService.listarCuentas({
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas: soloVencidas === 'true'
    });

    res.json({
      success: true,
      data: result.data,
      resumen: result.resumen,
      filtros: result.filtros
    });
  } catch (error) {
    console.error('❌ Error obteniendo cuentas por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo cuentas por pagar',
      error: error.message
    });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { estado, saldoPendiente, notas } = req.body;
    if (!estado && saldoPendiente === undefined && notas === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Debe enviar al menos un campo para actualizar'
      });
    }

    const cuenta = await pagosProveedoresService.actualizarCuenta(req.params.id, {
      estado,
      saldoPendiente,
      notas
    });

    res.json({
      success: true,
      data: cuenta
    });
  } catch (error) {
    console.error('❌ Error actualizando cuenta por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando cuenta por pagar',
      error: error.message
    });
  }
});

module.exports = router;

