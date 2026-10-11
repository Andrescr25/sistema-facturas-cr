"use strict";
function error(codigo, mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { code: codigo, status });
}
module.exports = { error };
