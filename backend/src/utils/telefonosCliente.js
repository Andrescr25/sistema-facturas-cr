/**
 * Saca los teléfonos utilizables de la ficha de un cliente en Alegra.
 *
 * POR QUÉ NO ALCANZA CON QUITARLE LO QUE NO SEA DÍGITO
 * Los teléfonos de la cuenta real no son teléfonos: son notas. De 120 fichas
 * revisadas, 19 tenían algo distinto de 8 dígitos limpios:
 *
 *   "88272453 GABRIEL"     el nombre de quien contesta
 *   "+506 89703626"        con código de país
 *   "60301550 63409692"    DOS números en el mismo campo
 *   "+506 8770053"         siete dígitos: no es un número
 *   "ENRIQUE"              ningún número
 *
 * El normalizador de las órdenes de compra descarta lo que no sea dígito y
 * pega lo que queda. Con "60301550 63409692" eso produce 6030155063409692
 * —dieciséis dígitos que no son de nadie— y con "+506 8770053" produce un
 * número al que le falta una cifra. Para una orden de compra el peor caso es
 * que no llegue. Acá el peor caso es que llegue: el enlace de invitación deja
 * crear la cuenta del cliente y ver sus facturas, así que mandárselo a un
 * número equivocado es entregarle esa cuenta a un desconocido.
 *
 * Por eso este módulo no adivina: devuelve TODOS los candidatos para que sea
 * una persona la que elija, y lo que no reconoce lo devuelve aparte para
 * poder explicar por qué no hay nada que ofrecer.
 *
 * Vive fuera del servicio para poder probarlo sin base ni red.
 */

// En Costa Rica los fijos empiezan con 2 y el VoIP con 4; los celulares con
// 5, 6, 7 u 8. En la práctica solo un celular tiene WhatsApp, pero el fijo se
// ofrece igual marcado como tal: quien manda sabe mejor que nosotros si ese
// número recibe mensajes.
const PREFIJO_FIJO = ['2', '4'];

/** Los grupos de dígitos de un texto, en orden. */
function gruposDeDigitos(texto) {
  return String(texto ?? '').match(/\d+/g) || [];
}

/**
 * Un grupo de dígitos a número nacional de 8 cifras, o null.
 *
 * Acepta el 506 pegado adelante (+50688776655) porque así lo guarda mucha
 * ficha, pero no acepta 7 ni 9 dígitos: a un número al que le sobra o le
 * falta una cifra es de otra persona, no del cliente.
 */
function aNumeroNacional(grupo) {
  if (grupo.length === 8) return grupo;
  if (grupo.length === 11 && grupo.startsWith('506')) return grupo.slice(3);
  return null;
}

/** ¿Es celular? Los fijos casi nunca tienen WhatsApp. */
function esMovil(numeroNacional) {
  return !PREFIJO_FIJO.includes(numeroNacional[0]);
}

/** 88272453 -> "8827 2453", que es como se lee un teléfono acá. */
function formatear(numeroNacional) {
  return `${numeroNacional.slice(0, 4)} ${numeroNacional.slice(4)}`;
}

/**
 * Los teléfonos que contiene un campo, más lo que sobró sin interpretarse.
 *
 * EL PROBLEMA ESTÁ EN LOS DOS EXTREMOS, Y SON OPUESTOS.
 * "2453 1122" es UN teléfono partido por un espacio, así que hay que unir.
 * "60301550 63409692" son DOS teléfonos separados por un espacio, así que
 * unir daría un número de 16 dígitos que no es de nadie. La diferencia está
 * en que en el segundo cada mitad ya mide 8 por su cuenta.
 *
 * De ahí la regla: un grupo que ya es un teléfono válido se toma solo; los
 * demás se van juntando con los siguientes hasta llegar a 8 dígitos exactos.
 * Si se pasan, no se inventa nada: se devuelve como no reconocido.
 */
function extraerDeCampo(texto) {
  const grupos = gruposDeDigitos(texto);
  const numeros = [];
  const sobras = [];

  let acumulado = '';
  const soltarAcumulado = () => {
    if (acumulado) sobras.push(acumulado);
    acumulado = '';
  };

  for (const grupo of grupos) {
    const solo = aNumeroNacional(grupo);
    if (solo) {
      // Ya es un teléfono por su cuenta: lo que se venía juntando era otra
      // cosa y se descarta, no se le pega a este.
      soltarAcumulado();
      numeros.push(solo);
      continue;
    }

    // El código de país suelto pertenece al número que viene después.
    if (grupo === '506' && !acumulado) continue;

    acumulado += grupo;
    if (acumulado.length === 8) {
      numeros.push(acumulado);
      acumulado = '';
    } else if (acumulado.length > 8) {
      soltarAcumulado();
    }
  }
  soltarAcumulado();

  return { numeros, sobras };
}

/**
 * Los teléfonos que se le pueden ofrecer a quien manda la invitación.
 *
 * @param {{phonePrimary?, mobile?, phoneSecondary?}} contacto ficha de Alegra
 * @returns {{ candidatos: Array, sinReconocer: string[] }}
 *   candidatos    [{ numero: '50688272453', nacional, formateado, esMovil, origen }]
 *   sinReconocer  lo que había escrito y no era un teléfono, para poder
 *                 explicar por qué no hay ninguno
 */
function telefonosDe(contacto = {}) {
  // El celular primero: es el campo donde más veces está el WhatsApp.
  const campos = [
    ['mobile', contacto.mobile],
    ['phonePrimary', contacto.phonePrimary],
    ['phoneSecondary', contacto.phoneSecondary]
  ];

  const candidatos = [];
  const vistos = new Set();
  const sinReconocer = [];

  for (const [origen, valor] of campos) {
    const texto = String(valor ?? '').trim();
    if (!texto) continue;

    const { numeros, sobras } = extraerDeCampo(texto);

    for (const nacional of numeros) {
      if (vistos.has(nacional)) continue;
      vistos.add(nacional);
      candidatos.push({
        numero: `506${nacional}`,      // como lo quiere WhatsApp
        nacional,
        formateado: formatear(nacional),
        esMovil: esMovil(nacional),
        origen
      });
    }

    // Se avisa de lo que no se pudo leer aunque el campo traiga otro número:
    // en "8827 2453 / 22 33" hay algo que alguien quiso escribir.
    if (sobras.length > 0 || numeros.length === 0) sinReconocer.push(texto);
  }

  // Los celulares antes que los fijos: es lo que casi siempre se busca.
  candidatos.sort((a, b) => Number(b.esMovil) - Number(a.esMovil));

  return { candidatos, sinReconocer };
}

/**
 * Valida un número escrito a mano en la pantalla.
 *
 * Se usa cuando la ficha no traía nada utilizable y alguien lo teclea. Es
 * deliberadamente estricta: acá un dígito de más no es un número mal escrito,
 * es el teléfono de otra persona.
 */
function validarTelefonoEscrito(texto) {
  const { numeros, sobras } = extraerDeCampo(texto);

  if (numeros.length === 0) {
    const digitos = gruposDeDigitos(texto).join('');
    return {
      valido: false,
      motivo: digitos.length === 0
        ? 'Escribí el número de teléfono.'
        : `"${String(texto).trim()}" tiene ${digitos.length} dígito(s) y un teléfono de Costa Rica tiene 8.`
    };
  }
  if (numeros.length > 1 || sobras.length > 0) {
    return { valido: false, motivo: 'Escribí un solo número, sin nombres ni anotaciones.' };
  }

  const nacional = numeros[0];
  return {
    valido: true,
    numero: `506${nacional}`,
    nacional,
    formateado: formatear(nacional),
    esMovil: esMovil(nacional)
  };
}

module.exports = { telefonosDe, validarTelefonoEscrito, formatear };
