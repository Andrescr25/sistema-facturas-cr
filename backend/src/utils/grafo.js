const fs = require('fs');
const path = require('path');

/**
 * Lee el grafo de conocimiento (`docs/grafo/`) y lo deja como datos.
 *
 * NO HAY LIBRERÍA DE YAML DISPONIBLE, Y NO SE INSTALA UNA. `node_modules` en
 * esta rama es un enlace al árbol de `developer`; un `npm install` le
 * cambiaría las dependencias a esa rama, y su `postinstall` corre
 * `prisma generate`, que es justo lo que no se puede hacer desde acá.
 *
 * Por eso el frontmatter de cada nodo usa un subconjunto de YAML deliberado
 * y chico, no YAML completo: escalares de una línea, una lista simple
 * (`archivos:`) y un mapa de una sola profundidad con arrays en línea
 * (`aristas:`). Se parsea a mano porque ese subconjunto es trivial de
 * parsear a mano, y porque el día que haga falta más, el error de forma lo
 * va a decir el propio validador (`grafo.test.js`), no un traceback de una
 * librería.
 */

const RAIZ_GRAFO = path.join(__dirname, '..', '..', '..', 'docs', 'grafo');
const RAIZ_REPO = path.join(__dirname, '..', '..', '..');

const TIPOS_VALIDOS = new Set(['modulo', 'tabla', 'decision', 'leccion', 'bloqueo']);
const ARISTAS_VALIDAS = new Set(['vive_en', 'depende_de', 'bloqueado_por', 'reemplaza', 'relacionado']);
const ESTADOS_VALIDOS = new Set(['vigente', 'pospuesto', 'retirado']);

/** Separa el bloque `---\n...\n---` del resto del archivo. */
function extraerFrontmatter(contenido) {
  const m = contenido.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return m[1];
}

/**
 * Parsea el subconjunto de YAML descrito arriba. Lanza si encuentra algo que
 * no sabe leer, a propósito: silenciar una línea rara dejaría un nodo a
 * medio cargar sin que nadie se entere.
 */
function parsearFrontmatter(bloque, rutaParaError) {
  const lineas = bloque.split(/\r?\n/);
  const nodo = { archivos: [], aristas: {} };
  let seccion = null; // null | 'archivos'

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.trim() === '') continue;

    // Ítem de lista: "  - algo"
    const itemLista = linea.match(/^\s{2}-\s+(.+)$/);
    if (itemLista) {
      if (seccion !== 'archivos') {
        throw new Error(`${rutaParaError}: ítem de lista fuera de "archivos:" → "${linea}"`);
      }
      nodo.archivos.push(itemLista[1].trim());
      continue;
    }

    // Clave de arista: "  vive_en: [a, b]" (dentro de "aristas:")
    const claveArista = linea.match(/^\s{2}(\w+):\s*\[(.*)\]\s*$/);
    if (claveArista && seccion === 'aristas') {
      const [, nombre, contenido] = claveArista;
      const destinos = contenido.trim() === ''
        ? []
        : contenido.split(',').map((s) => s.trim()).filter(Boolean);
      nodo.aristas[nombre] = destinos;
      continue;
    }

    // Clave de nivel superior: "archivos:", "aristas:", o "clave: valor"
    const claveTope = linea.match(/^(\w+):\s*(.*)$/);
    if (claveTope) {
      const [, clave, valor] = claveTope;
      if (valor.trim() === '' && (clave === 'archivos' || clave === 'aristas')) {
        seccion = clave;
        continue;
      }
      seccion = null;
      nodo[clave] = valor.trim();
      continue;
    }

    throw new Error(`${rutaParaError}: línea de frontmatter no reconocida → "${linea}"`);
  }

  return nodo;
}

/** Todos los `.md` bajo `docs/grafo/`, con su tipo tomado de la carpeta. */
function listarArchivosDeNodos() {
  if (!fs.existsSync(RAIZ_GRAFO)) return [];
  const salida = [];
  for (const tipo of fs.readdirSync(RAIZ_GRAFO)) {
    const dirTipo = path.join(RAIZ_GRAFO, tipo);
    if (!fs.statSync(dirTipo).isDirectory()) continue;
    for (const archivo of fs.readdirSync(dirTipo)) {
      if (!archivo.endsWith('.md')) continue;
      salida.push({ tipoCarpeta: tipo, nombre: archivo.replace(/\.md$/, ''), ruta: path.join(dirTipo, archivo) });
    }
  }
  return salida;
}

/**
 * Carga todos los nodos del grafo.
 * Devuelve `{ nodos: Map<id, nodo>, errores: string[] }` — los errores de
 * parseo no detienen la carga del resto, para que el validador pueda
 * reportarlos todos juntos en vez de uno por corrida.
 */
function cargarGrafo() {
  const nodos = new Map();
  const errores = [];

  for (const { tipoCarpeta, nombre, ruta } of listarArchivosDeNodos()) {
    const rutaRelativa = path.relative(RAIZ_REPO, ruta);
    try {
      const contenido = fs.readFileSync(ruta, 'utf8');
      const bloque = extraerFrontmatter(contenido);
      if (!bloque) {
        errores.push(`${rutaRelativa}: no tiene bloque de frontmatter (---...---)`);
        continue;
      }
      const nodo = parsearFrontmatter(bloque, rutaRelativa);
      nodo._archivoNodo = rutaRelativa;
      nodo._tipoCarpeta = tipoCarpeta;
      nodo._nombreArchivo = nombre;

      if (!nodo.id) {
        errores.push(`${rutaRelativa}: sin campo "id"`);
        continue;
      }
      if (nodos.has(nodo.id)) {
        errores.push(`id duplicado "${nodo.id}": ${nodos.get(nodo.id)._archivoNodo} y ${rutaRelativa}`);
        continue;
      }
      nodos.set(nodo.id, nodo);
    } catch (e) {
      errores.push(e.message);
    }
  }

  return { nodos, errores };
}

const RUTA_MAPA = path.join(RAIZ_GRAFO, 'README.md');

/**
 * Los ids que enlaza el mapa de entrada (`docs/grafo/README.md`), leídos de
 * sus enlaces `](tipo/nombre.md)`. `null` si el mapa no existe.
 *
 * EL MAPA ES LA PUERTA. Quien llega sin contexto —otra persona, otro agente—
 * no sabe qué nodos hay sin listar la carpeta y abrirlos uno por uno. El
 * validador exige que el mapa nombre cada nodo y solo nodos que existen, así
 * que no puede quedarse atrás del grafo sin que falle una prueba.
 */
function idsDelMapa() {
  if (!fs.existsSync(RUTA_MAPA)) return null;
  const texto = fs.readFileSync(RUTA_MAPA, 'utf8');
  return [...texto.matchAll(/\]\(([a-z]+\/[a-z0-9-]+)\.md\)/g)].map((m) => m[1]);
}

/**
 * Nodos cuyo código cambió DESPUÉS de su fecha `medido`: candidatos a estar
 * describiendo algo que ya no es así. Compara contra la fecha del último
 * commit de cada archivo citado en `archivos:`.
 *
 * Es un AVISO, no una prueba que falla: casi cualquier cambio de código
 * tocaría algún nodo, y obligar a editarlo en el mismo commit terminaría en
 * fechas actualizadas sin haber releído nada. Lo que sí hace es que nadie
 * pueda decir que no sabía cuáles revisar. Sin git a mano devuelve [].
 */
function nodosDesactualizados(nodos) {
  const { execFileSync } = require('child_process');
  const fechaDe = (archivo) => execFileSync('git', ['log', '-1', '--format=%cs', '--', archivo], {
    cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();

  const salida = [];
  try {
    for (const nodo of nodos.values()) {
      if (!nodo.medido || nodo.estado === 'retirado') continue;
      let ultimo = '';
      for (const archivo of nodo.archivos || []) {
        const fecha = fechaDe(archivo);
        if (fecha > ultimo) ultimo = fecha;
      }
      if (ultimo && ultimo > nodo.medido) salida.push({ id: nodo.id, medido: nodo.medido, cambio: ultimo });
    }
  } catch {
    return [];
  }
  return salida;
}

module.exports = {
  RAIZ_GRAFO,
  RAIZ_REPO,
  RUTA_MAPA,
  TIPOS_VALIDOS,
  ARISTAS_VALIDAS,
  ESTADOS_VALIDOS,
  cargarGrafo,
  idsDelMapa,
  nodosDesactualizados,
  parsearFrontmatter,
  extraerFrontmatter
};
