/**
 * Piezas compartidas por los adaptadores de precios de competencia — Fase 3
 * de la estrategia de precios. Reglas de convivencia, no negociables (son
 * servidores ajenos que no nos deben nada):
 *   - User-Agent honesto: quién es, para qué, cómo contactarnos.
 *   - Máximo 1 petición cada RATE_LIMIT_MS.
 *   - Ante el primer 403/429, se detiene — no se reintenta agresivo contra
 *     un bloqueo (eso sería indistinguible de un intento de evadirlo).
 */

const USER_AGENT = 'TachiDistribuidora-InvestigacionPrecios/1.0 (uso interno, no comercial; contacto: javargas360@gmail.com)';
const TIMEOUT_MS = 15000;
const RATE_LIMIT_MS = 2000;

class BloqueoDetectado extends Error {
  constructor(fuente, status) {
    super(`${fuente} respondió ${status} — deteniendo la sincronización con esta fuente`);
    this.name = 'BloqueoDetectado';
    this.fuente = fuente;
    this.status = status;
  }
}

function esperar(ms = RATE_LIMIT_MS) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { USER_AGENT, TIMEOUT_MS, RATE_LIMIT_MS, BloqueoDetectado, esperar };
