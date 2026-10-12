const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * La estructura del proyecto, cuidada por una prueba.
 *
 * POR QUÉ EXISTE (2026-10-11). El usuario pidió revisar si los agentes
 * habían respetado la estructura. Las reglas del negocio sí; la forma, a
 * medias: un servicio que pasó de 786 a 1.218 líneas en un día, una pantalla
 * de 790 con las cuentas adentro, componentes llamando al servidor por su
 * cuenta, un gancho fuera de `src/hooks`, la misma función de fecha copiada
 * cinco veces y hojas de estilo con colores escritos a mano. Nada de eso
 * rompía una prueba, y por eso pasó. Su respuesta: «sé más estricto con el
 * mantenimiento de la estructura, es de suma importancia».
 *
 * CÓMO SE LEE UN FALLO DE ESTA PRUEBA. No dice "no se puede": dice "esto se
 * decide a propósito". Lo normal es acomodar el cambio al molde:
 *   · reglas y cuentas → `frontend/src/utils/` (sin React, con su prueba);
 *   · estado y llamadas al servidor → `frontend/src/hooks/`;
 *   · cada sección de una pantalla → `frontend/src/components/<pantalla>/`;
 *   · en el backend, otro archivo dentro del módulo.
 * Si de verdad corresponde una excepción, se agrega ACÁ, en el mismo commit,
 * con el porqué. Las listas de "deuda" son lo que ya estaba cuando se
 * escribió esto: pueden achicarse, no crecer.
 */

const RAIZ = path.join(__dirname, '..', '..');
const FRONT = path.join(RAIZ, 'frontend', 'src');
const BACK = path.join(RAIZ, 'backend', 'src');

function archivos(dir, filtro, lista = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) archivos(ruta, filtro, lista);
    else if (filtro.test(e.name)) lista.push(ruta);
  }
  return lista;
}
const rel = (base, ruta) => path.relative(base, ruta).split(path.sep).join('/');
const lineas = (ruta) => fs.readFileSync(ruta, 'utf8').split('\n').length - 1;
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('cada cosa en su carpeta', () => {
  test('los ganchos viven en frontend/src/hooks', () => {
    const fuera = archivos(FRONT, /^use[A-Z].*\.jsx?$/).map(r => rel(FRONT, r)).filter(r => !r.startsWith('hooks/'));
    assert.deepEqual(fuera, [], 'un gancho quedó fuera de src/hooks');
  });

  test('las reglas puras de utils no importan React ni el servidor', () => {
    // Lo que una prueba importa "tal cual" tiene que seguir pudiéndose importar.
    for (const util of ['emisionPasos.js', 'numeracionTexto.js', 'notaCreditoTexto.js', 'facturaVista.js', 'asignacionRuta.js']) {
      const fuente = sinComentarios(fs.readFileSync(path.join(FRONT, 'utils', util), 'utf8'));
      assert.doesNotMatch(fuente, /^\s*import /m, `utils/${util} dejó de ser puro: ya no se puede probar sin navegador`);
    }
  });
});

describe('los componentes dibujan; con el servidor habla un gancho o un servicio', () => {
  // DEUDA: lo que ya llamaba a `api` directo cuando se escribió esta prueba.
  // Sacar uno de la lista al arreglarlo; no agregar.
  const DEUDA = [
    'components/clientes/DispositivosAgente.jsx', 'components/clientes/ModalInvitacion.jsx',
    'components/clientes/ModalPreventa.jsx', 'components/cotizaciones/ModalCotizacion.jsx',
    'components/cuentas-por-cobrar/ClienteDetalle.jsx', 'components/entregas/RegistroFisico.jsx',
    'components/relacionar-productos/ModalCrearProducto.jsx', 'components/reporte-proveedores/CierreOrdenCiclo.jsx',
    'components/reporte-proveedores/EnvioOrdenCiclo.jsx', 'components/reporte-proveedores/FacturaOrdenCiclo.jsx',
    'components/reporte-proveedores/OrdenesCompraCiclo.jsx', 'components/reporte-proveedores/RecepcionOrdenCiclo.jsx',
    'components/whatsapp/ModalEnviarWhatsApp.jsx', 'pages/Clientes.jsx', 'pages/CotizacionPublica.jsx',
    'pages/Cotizaciones.jsx', 'pages/Dashboard.jsx'
  ];
  const directos = [...archivos(path.join(FRONT, 'components'), /\.jsx?$/), ...archivos(path.join(FRONT, 'pages'), /\.jsx?$/)]
    .filter(r => /\bapi\.(get|post|put|patch|delete)\(/.test(fs.readFileSync(r, 'utf8')))
    .map(r => rel(FRONT, r));

  test('ningún componente ni página NUEVO llama a la API por su cuenta', () => {
    assert.deepEqual(directos.filter(r => !DEUDA.includes(r)), [],
      'mové la llamada a un gancho de src/hooks (o a un servicio) y dejá que el componente solo dibuje');
  });

  test('la lista de deuda no guarda archivos que ya se arreglaron', () => {
    assert.deepEqual(DEUDA.filter(r => !directos.includes(r)), [], 'ya no llaman a la API: sacalos de DEUDA');
  });

  test('las pantallas de Facturación, Rutas y Hacienda no importan servicios desde sus componentes', () => {
    // Las que se ordenaron en la revisión del 2026-10-11: que no vuelvan.
    for (const r of ['components/facturacion/VistaFactura.jsx', 'components/facturacion/PanelEmisionFactura.jsx',
      'components/facturacion/BotonEmitirFactura.jsx', 'components/facturacion/DatosPendientesEmision.jsx',
      'components/facturacion/NotasCreditoFactura.jsx', 'components/facturacion/CobrosFactura.jsx',
      'components/clientes/AsignarClientesRuta.jsx', 'components/configuracion/NumeracionHacienda.jsx']) {
      const fuente = sinComentarios(fs.readFileSync(path.join(FRONT, r), 'utf8'));
      assert.doesNotMatch(fuente, /from '[^']*(services\/|integrations\/hacienda\/api)/, `${r} volvió a hablar con el servidor por su cuenta`);
    }
  });
});

describe('el diseño sale de la paleta del sistema', () => {
  const COLOR_CRUDO = /(bg|text|border|ring|from|to|via|divide|placeholder)-(gray|slate|zinc|blue|red|green|yellow|indigo|purple|pink|orange|amber|emerald|teal|cyan|sky|rose)-[0-9]{2,3}/g;

  test('no entran colores crudos de Tailwind: se elige por rol (primario, neutro, exito, alerta, peligro, nota)', () => {
    // DEUDA: 50 usos que ya estaban. El número solo puede bajar.
    const TOPE = 50;
    const usos = archivos(FRONT, /\.jsx?$/).reduce((n, r) => n + (fs.readFileSync(r, 'utf8').match(COLOR_CRUDO) || []).length, 0);
    assert.ok(usos <= TOPE, `hay ${usos} colores crudos (tope ${TOPE}): usá la paleta de tailwind.config.js`);
  });

  test('no aparecen hojas de estilo nuevas con colores escritos a mano', () => {
    // El proyecto se dibuja con Tailwind y `index.css`. Una hoja propia solo
    // se justifica por animaciones o consultas de medios que Tailwind no
    // cubre, y sus colores tienen que salir de la paleta (`theme('colors.…')`).
    // El catálogo también usa theme(): ya no quedan hojas exceptuadas.
    const A_MANO = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const nuevas = archivos(FRONT, /\.css$/).map(r => rel(FRONT, r))
      .filter(r => r !== 'index.css')
      .filter(r => A_MANO.test(sinComentarios(fs.readFileSync(path.join(FRONT, r), 'utf8'))));
    assert.deepEqual(nuevas, [], 'esa hoja escribe colores a mano: tomalos de la paleta con theme(\'colors.…\')');
  });
});

describe('una sola copia de lo que es de todos', () => {
  test('la fecha corta se escribe una vez, en utils/fechaCR.js', () => {
    const copias = archivos(FRONT, /\.jsx?$/)
      .filter(r => /slice\(0, ?10\)\.split\('-'\)\.reverse\(\)/.test(fs.readFileSync(r, 'utf8')))
      .map(r => rel(FRONT, r));
    assert.deepEqual(copias, ['utils/fechaCR.js'], 'usá fechaCorta() en vez de copiar la cuenta');
  });
});

describe('ningún archivo crece sin que alguien lo decida', () => {
  // Topes generales, y debajo los archivos que YA los pasaban, cada uno con
  // el tamaño que tenía: no pueden crecer más. Achicar uno y bajarle el tope
  // (o sacarlo de la lista) es siempre bienvenido.
  const TOPE_FRONT = 500;
  const TOPE_BACK = 700;
  const DEUDA_FRONT = {
    'hooks/useFacturacion.js': 1452, 'services/facturacionService.js': 1425, 'services/indexedDBService.js': 950,
    'utils/formasFarmaceuticas.js': 917, 'hooks/useInventarioAuditoria.js': 877, 'hooks/useRelacionarProductos.js': 668,
    'hooks/useReporteProveedores.js': 659, 'components/relacionar-productos/ModalCrearProducto.jsx': 555
  };
  const DEUDA_BACK = {
    'modules/reporte-contador/reporte-contador.service.js': 975, 'modules/orders-whatsapp/orders-whatsapp.service.js': 844,
    'modules/facturacion/facturaPropia.service.js': 835, 'modules/productos-revision/productos-revision.service.js': 831,
    // El camino fiscal: preparar, enviar y consultar. Lo que el botón de un
    // clic decide solo vive aparte, en unClic.service.js.
    'integrations/hacienda/emision.service.js': 768, 'modules/pagos-recurrentes/pagos-recurrentes.service.js': 767
  };

  const pasados = (base, filtro, tope, deuda) => archivos(base, filtro)
    .map(r => [rel(base, r), lineas(r)])
    .filter(([r, n]) => n > (deuda[r] ?? tope))
    .map(([r, n]) => `${r}: ${n} líneas (tope ${deuda[r] ?? tope})`);

  test(`frontend: ningún archivo pasa de ${TOPE_FRONT} líneas, y los que ya pasaban no crecen`, () => {
    assert.deepEqual(pasados(FRONT, /\.jsx?$/, TOPE_FRONT, DEUDA_FRONT), [],
      'partilo: reglas a utils, estado a un gancho, secciones a componentes');
  });

  test(`backend: ningún archivo pasa de ${TOPE_BACK} líneas, y los que ya pasaban no crecen`, () => {
    assert.deepEqual(pasados(BACK, /\.js$/, TOPE_BACK, DEUDA_BACK), [],
      'partilo en otro archivo del mismo módulo');
  });

  test('las listas de deuda no guardan archivos que ya bajaron del tope', () => {
    for (const [base, tope, deuda] of [[FRONT, TOPE_FRONT, DEUDA_FRONT], [BACK, TOPE_BACK, DEUDA_BACK]]) {
      for (const r of Object.keys(deuda)) {
        assert.ok(fs.existsSync(path.join(base, r)), `${r} ya no existe: sacalo de la lista`);
        assert.ok(lineas(path.join(base, r)) > tope, `${r} ya bajó de ${tope} líneas: sacalo de la lista`);
      }
    }
  });
});
