/**
 * Cerrar la ficha de un cliente con cambios sin guardar pregunta antes.
 *
 * 2026-10-19, el usuario: «el descuento global que le pongo a x cliente, no
 * se le aplica cuando lo factura, tampoco veo el descuento en el pdf —
 * ejemplo real: Buen Precio». En producción SUPER BUEN PRECIO seguía en 0 %
 * y el servidor no había recibido ni un intento de guardar su ficha; ningún
 * cliente tenía descuento. Con el descuento guardado, factura y PDF lo
 * llevaban bien (comprobado en una copia). Lo que se encontró: escribir el
 * descuento y cerrar la hoja con la X, «Cancelar» o Escape lo descartaba en
 * silencio. Ahora pregunta.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

/** El gancho sin React: useCallback y useRef de mentira, que alcanzan para su lógica. */
function gancho({ cambios, respuesta = true }) {
  const fuente = fs.readFileSync(path.join(FRONT, 'hooks', 'useSalirSinGuardar.js'), 'utf8')
    .replace(/^import .*$/m, '').replace(/^export /m, '');
  const useSalirSinGuardar = new Function('useCallback', 'useRef', `${fuente}\nreturn useSalirSinGuardar;`)(
    (fn) => fn, () => ({ current: false }));
  const registro = { cerrado: 0, preguntas: [] };
  let responder;
  const confirm = (mensaje, opciones) => { registro.preguntas.push({ mensaje, opciones }); return new Promise((r) => { responder = r; }); };
  const cerrar = useSalirSinGuardar({ cambios, confirm, onCerrar: () => { registro.cerrado++; } });
  return { cerrar, registro, responder: (v = respuesta) => responder(v) };
}

test('sin cambios, cerrar sale directo, sin preguntar', async () => {
  const g = gancho({ cambios: 0 });
  await g.cerrar();
  assert.deepEqual([g.registro.cerrado, g.registro.preguntas.length], [1, 0]);
});

test('con cambios pregunta, y «Seguir editando» no cierra', async () => {
  const g = gancho({ cambios: 1 });
  const pendiente = g.cerrar();
  assert.equal(g.registro.preguntas.length, 1);
  assert.equal(g.registro.preguntas[0].mensaje, 'Hay 1 cambio sin guardar. Si salís ahora, se pierden.');
  assert.deepEqual(g.registro.preguntas[0].opciones, { title: '¿Salir sin guardar?', confirmLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando', variant: 'danger' });
  g.responder(false); await pendiente;
  assert.equal(g.registro.cerrado, 0, 'el descuento escrito sigue en la ficha');
});

test('«Salir sin guardar» cierra, y un segundo Escape no repite la pregunta', async () => {
  const g = gancho({ cambios: 3 });
  const primera = g.cerrar();
  await g.cerrar();
  assert.equal(g.registro.preguntas.length, 1, 'una sola pregunta aunque se apriete Escape dos veces');
  assert.match(g.registro.preguntas[0].mensaje, /^Hay 3 cambios sin guardar/);
  g.responder(true); await primera;
  assert.equal(g.registro.cerrado, 1);
});

test('la ficha del cliente cierra por el gancho en la X, «Cancelar» y Escape', () => {
  const modal = leer('components', 'clientes', 'ModalCliente.jsx');
  assert.match(modal, /const cerrar = useSalirSinGuardar\(\{ cambios: Object\.keys\(cambios\)\.length, confirm, onCerrar \}\)/);
  assert.match(modal, /<HojaModal[\s\S]*?onCerrar=\{cerrar\}/, 'la X y Escape de la hoja');
  assert.match(modal, /onClick=\{cerrar\}>Cancelar</);
  // Guardar sí cierra directo: lo guardado no se pregunta.
  assert.match(modal, /if \(await onGuardar\(datos\)\) onCerrar\(\)/);
  assert.match(leer('pages', 'Clientes.jsx'), /onCerrar=\{\(\) => fichas\.setEditando\(null\)\}\n\s+confirm=\{confirm\}/);
});
