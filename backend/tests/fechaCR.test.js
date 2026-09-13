const { test, describe } = require('node:test');
const assert = require('node:assert');
const { hoyEnCostaRica, diaEnCostaRica } = require('../src/utils/fechaCR');

/**
 * El día del calendario en Costa Rica.
 *
 * El bug que esto corrige: `toISOString()` da la fecha en UTC y el país está
 * en UTC−6, así que después de las 6 de la tarde devolvía el día siguiente.
 * Un abono registrado a las 7 p.m. del viernes se guardaba como del sábado.
 */

describe('después de las 6 de la tarde', () => {
  test('sigue siendo el mismo día en Costa Rica', () => {
    // 01:21 UTC del 13 = 19:21 del 12 en Costa Rica.
    assert.equal(hoyEnCostaRica(new Date('2026-09-13T01:21:00Z')), '2026-09-12');
    // Justo antes de la medianoche local.
    assert.equal(hoyEnCostaRica(new Date('2026-09-13T05:59:00Z')), '2026-09-12');
    // Y un minuto después ya es el día siguiente.
    assert.equal(hoyEnCostaRica(new Date('2026-09-13T06:00:00Z')), '2026-09-13');
  });

  test('lo que toISOString habría dicho', () => {
    // Deja escrito el error que se corrigió: el mismo instante, dos días.
    const instante = new Date('2026-09-13T01:21:00Z');
    assert.equal(instante.toISOString().slice(0, 10), '2026-09-13');
    assert.equal(hoyEnCostaRica(instante), '2026-09-12');
  });
});

describe('de día no cambia nada', () => {
  test('una mañana cualquiera', () => {
    assert.equal(hoyEnCostaRica(new Date('2026-09-12T15:00:00Z')), '2026-09-12');
  });
});

describe('convertir una fecha guardada', () => {
  test('acepta un Date o un texto', () => {
    assert.equal(diaEnCostaRica(new Date('2026-03-05T18:00:00Z')), '2026-03-05');
    assert.equal(diaEnCostaRica('2026-03-05T18:00:00Z'), '2026-03-05');
  });

  test('una fecha inválida no inventa un día', () => {
    assert.equal(diaEnCostaRica('no es una fecha'), null);
    assert.equal(diaEnCostaRica(new Date('x')), null);
  });
});

test('Costa Rica no tiene horario de verano, así que vale todo el año', () => {
  // Si el país cambiara la hora, este par dejaría de dar lo mismo y habría
  // que revisar todo lo que dependa de esto.
  assert.equal(hoyEnCostaRica(new Date('2026-01-15T05:30:00Z')), '2026-01-14');
  assert.equal(hoyEnCostaRica(new Date('2026-07-15T05:30:00Z')), '2026-07-14');
});

test('nadie vuelve a sacar el día del calendario en UTC', () => {
  // `new Date().toISOString()` a secas es un instante y está bien. Lo que no
  // puede volver es recortarlo a "AAAA-MM-DD": eso es un día, y en UTC−6
  // después de las 6 de la tarde es el día equivocado.
  const fs = require('fs');
  const path = require('path');

  const revisar = (dir) => {
    const malos = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) { malos.push(...revisar(completo)); continue; }
      if (!entrada.name.endsWith('.js')) continue;
      const texto = fs.readFileSync(completo, 'utf8');
      texto.split('\n').forEach((linea, i) => {
        // Los comentarios no cuentan: el propio helper explica el error que
        // corrige, y esa explicación tiene que poder escribirse.
        const esComentario = /^\s*(\*|\/\/|\/\*)/.test(linea);
        if (!esComentario && /new Date\(\)\.toISOString\(\)\.(split|slice)/.test(linea)) {
          malos.push(`${path.relative(dir, completo)}:${i + 1}`);
        }
      });
    }
    return malos;
  };

  const encontrados = revisar(path.join(__dirname, '..', 'src'));
  assert.deepEqual(encontrados, [],
    `usan el día en UTC en vez de hoyEnCostaRica(): ${encontrados.join(', ')}`);
});

describe('un día de calendario ya escrito', () => {
  test('se devuelve tal cual, no se "convierte"', () => {
    // JavaScript parsea "2026-09-08" como medianoche UTC; formatearlo en
    // UTC−6 devolvía el día anterior. Con un Date sí hay que convertir,
    // porque eso es un instante; con un día de calendario no hay nada que
    // convertir.
    assert.equal(diaEnCostaRica('2026-09-08'), '2026-09-08');
    assert.equal(diaEnCostaRica('2026-01-01'), '2026-01-01');
  });

  test('un instante con hora sí se convierte', () => {
    assert.equal(diaEnCostaRica('2026-09-13T01:21:00Z'), '2026-09-12');
  });
});
