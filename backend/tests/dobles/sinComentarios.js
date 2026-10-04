/**
 * El código de un archivo sin sus comentarios, para las pruebas que afirman
 * que algo YA NO ESTÁ ("nadie llama a esta ruta", "nadie importa esto").
 *
 * POR QUÉ NO DOS EXPRESIONES REGULARES. Lo que había era
 * `texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')`, y
 * quitar primero los bloques tiene una trampa: un `/*` adentro de un
 * comentario de línea o de un texto —"// las rutas `/alegra/facturas/*`",
 * `'/api/proveedores/*'`— abre un "bloque" que se traga todo hasta el próximo
 * cierre de bloque, código incluido. La prueba pasaba sin haber mirado ese
 * código: en
 * `alegraService.js` se comía dos llamadas de verdad. Para una prueba de
 * ausencia, eso es el peor error posible — un visto bueno sobre lo no leído.
 *
 * Acá se recorre el texto sabiendo cuándo se está dentro de una cadena. Si se
 * equivoca, se equivoca hacia el lado seguro: deja texto de más (y la prueba
 * falla a la vista), nunca de menos.
 */
function sinComentarios(texto) {
  let salida = '';
  let cadena = null;   // la comilla que abrió la cadena en curso
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];
    const d = texto[i + 1];

    if (cadena) {
      salida += c;
      if (c === '\\' && d !== undefined) { salida += d; i += 2; continue; }
      // Una cadena de comilla simple o doble no cruza líneas: si llega el
      // salto, era un apóstrofo suelto (texto de JSX, una expresión regular).
      if (c === cadena || (c === '\n' && cadena !== '`')) cadena = null;
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') { cadena = c; salida += c; i++; continue; }

    if (c === '/' && d === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const fin = texto.indexOf('*/', i + 2);
      i = fin === -1 ? texto.length : fin + 2;
      continue;
    }

    salida += c;
    i++;
  }
  return salida;
}

module.exports = { sinComentarios };
