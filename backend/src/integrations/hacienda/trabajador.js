"use strict";
// Seguimiento exclusivo de Hacienda. No importa ni arranca limpieza semanal,
// correo, WhatsApp ni el servidor HTTP. Puede ejecutarse en otro proceso.
function iniciar(servicio, { intervalo = 60000 } = {}) {
  let ocupado = false;
  const timer = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await servicio.pendientes();
    } catch {
    } finally {
      ocupado = false;
    }
  }, intervalo);
  timer.unref();
  return () => clearInterval(timer);
}
if (require.main === module) {
  require("../../../config/aislado");
  const { pool } = require("../../../config/database");
  const { crearServicio } = require("./emision.service");
  crearServicio(pool)
    .pendientes()
    .then(() => pool.end())
    .catch(async () => {
      await pool.end();
      process.exitCode = 1;
    });
}
module.exports = { iniciar };
