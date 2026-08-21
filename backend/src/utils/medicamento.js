/**
 * Si un CABYS corresponde a un medicamento.
 *
 * El grupo de productos farmacéuticos es 352. Antes esto comparaba contra
 * '35', que es la división entera de "otros productos químicos": ahí adentro
 * están las pinturas (351), jabones y cosméticos (353), pegamentos y aceites
 * (354) y los venenos (356). Sobre este catálogo, 276 productos caían en esa
 * regla y NINGUNO era un medicamento.
 *
 * Vive en utils y no dentro del módulo porque la misma regla la aplica el
 * frontend (frontend/src/utils/relacionarProductosUtils.js). Las dos copias
 * tienen que decir lo mismo: si difieren, el usuario desmarca la casilla en
 * pantalla y el servidor se la vuelve a marcar — que es exactamente lo que
 * pasaba.
 */
const CABYS_MEDICAMENTOS = '352';

function cabysPareceMedicamento(codigoCabys) {
  return String(codigoCabys || '').trim().startsWith(CABYS_MEDICAMENTOS);
}

module.exports = { cabysPareceMedicamento, CABYS_MEDICAMENTOS };
