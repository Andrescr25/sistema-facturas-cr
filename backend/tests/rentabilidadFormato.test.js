/**
 * Los textos y cifras de Rentabilidad (frontend/src/utils/rentabilidadFormato.js).
 *
 * Se carga el archivo del frontend con `new Function`, igual que
 * catalogoClienteNuevo.test.js: por eso ese archivo no puede tener imports.
 *
 * LO QUE SE CUIDA
 *  - Las fechas AAAA-MM-DD se leen sin pasar por la zona del dispositivo: un
 *    `new Date('2026-09-01')` en Costa Rica es el 31 de agosto.
 *  - Los ejes dicen "₡3 M", no "₡3,00 M".
 *  - Un año a medias dice desde y hasta cuándo hay datos.
 *  - "Se vende más los días 2, 15 y 30" sale en el orden del calendario.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'rentabilidadFormato.js'), 'utf8'
);

test('el archivo no tiene imports (lo rompería este test)', () => {
  assert.doesNotMatch(FUENTE, /^import /m);
});

const f = new Function(`${FUENTE.replace(/^export /gm, '')}
  return { colonesCorto, colonesExactos, unidades, porcentaje, etiquetaSemana, tituloSemana,
           etiquetaMes, tituloMes, tituloAnio, lasMasAltas };`)();

// Los separadores de es-CR dependen del ICU de Node: se comparan sin ellos.
const plano = (s) => s.replace(/[\s  .]/g, '');

describe('cifras', () => {
  test('colones cortos, sin ceros de relleno', () => {
    assert.equal(f.colonesCorto(3000000), '₡3 M');
    assert.equal(f.colonesCorto(2500000), '₡2,5 M');
    assert.equal(f.colonesCorto(18396269.93), '₡18,4 M');
    assert.equal(f.colonesCorto(850000), '₡850 mil');
    assert.equal(f.colonesCorto(63700), '₡63,7 mil');
    assert.equal(plano(f.colonesCorto(-4500)), '₡-4,5mil');
  });

  test('unidades: enteras sin decimales, promedios con uno', () => {
    assert.equal(f.unidades(12), '12');
    assert.equal(f.unidades(94.73), '94,7');
    assert.equal(f.unidades(null), '0');
  });

  test('un margen desconocido se muestra como raya, no como 0 %', () => {
    assert.equal(f.porcentaje(null), '—');
    assert.equal(f.porcentaje(24.44), '24,4 %');
  });
});

describe('fechas', () => {
  test('las semanas y los meses no se corren de día', () => {
    assert.equal(f.etiquetaSemana('2026-09-01'), '1 set');
    assert.equal(f.tituloSemana('2026-08-17'), 'Semana del 17 al 23 de agosto');
    assert.equal(f.tituloSemana('2026-08-31'), 'Semana del 31 de agosto al 6 de setiembre');
    assert.equal(f.etiquetaMes('2026-09-01'), 'set 26');
    assert.equal(f.tituloMes('2026-01-01'), 'Enero 2026');
  });

  test('un año a medias dice desde y hasta cuándo', () => {
    assert.equal(f.tituloAnio({ anio: 2025, desde: '2025-01-02', hasta: '2025-12-30' }), '2025');
    assert.equal(f.tituloAnio({ anio: 2024, desde: '2024-06-03', hasta: '2024-12-30' }), '2024 (del 3 jun al 30 dic)');
    assert.equal(f.tituloAnio({ anio: 2026, desde: '2026-01-02', hasta: '2026-09-24' }), '2026 (del 2 ene al 24 set)');
  });
});

describe('la respuesta de cada gráfico', () => {
  const dias = [2, 15, 30, 7].map((d, i) => ({ dia: d, valor: [50, 80, 70, 10][i] }));

  test('las más altas, en el orden del calendario', () => {
    const ordenados = [...dias].sort((a, b) => a.dia - b.dia);
    assert.equal(f.lasMasAltas(ordenados, 3, (d) => d.dia), '2, 15 y 30');
  });

  test('sin ventas no hay frase', () => {
    assert.equal(f.lasMasAltas([{ valor: 0 }, { valor: 0 }], 3, () => 'x'), null);
  });
});
