/**
 * Configuración de ESLint.
 *
 * POR QUÉ APARECE RECIÉN AHORA
 * El proyecto ya tenía `npm run lint` en package.json y los plugins
 * instalados, pero NUNCA existió el archivo de configuración: el comando
 * fallaba con "couldn't find a configuration file". O sea que en todo este
 * tiempo nadie pudo correrlo.
 *
 * QUÉ VIGILA, Y QUÉ NO
 * Solo errores que rompen la aplicación de verdad. Nada de estilo: comillas,
 * punto y coma o sangría no se tocan, porque un linter que grita por cosas
 * que no importan termina apagado.
 *
 * Lo que sí importa acá, por experiencia de este mismo sistema:
 *
 *   no-undef        Una variable que no existe. Es un ReferenceError que
 *                   TUMBA la pantalla, y `vite build` no lo detecta: pasó
 *                   dos veces (`porId is not defined`,
 *                   `pareceMedicamento is not defined`), las dos en
 *                   producción y encontradas por el usuario.
 *
 *   rules-of-hooks  Un hook dentro de un `if` o después de un `return`
 *                   rompe React de formas difíciles de rastrear.
 *
 *   jsx-key         Una lista sin `key` hace que React reordene mal las
 *                   filas: se ve como datos que "saltan" de una fila a otra.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  // dist es la compilación; los scripts de Node tienen sus propias reglas.
  ignorePatterns: ['dist', 'node_modules', 'public', '*.config.js', '*.cjs'],
  rules: {
    // --- Lo que de verdad rompe ---
    'no-undef': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'react/jsx-key': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-const-assign': 'error',

    // --- Ruido que apagaría el linter ---
    // Con el JSX moderno no hace falta importar React.
    'react/react-in-jsx-scope': 'off',
    // Este proyecto no usa PropTypes; validarlas sería cientos de avisos.
    'react/prop-types': 'off',
    // Comillas dentro del texto en español (por ejemplo: no se puede "editar").
    'react/no-unescaped-entities': 'off',
    // Aviso, no error: hay variables sin usar que no rompen nada.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Aviso: las dependencias de useEffect requieren criterio caso por caso.
    'react-hooks/exhaustive-deps': 'warn',
  },
}
