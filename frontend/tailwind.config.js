import colores from 'tailwindcss/colors'

/**
 * PALETA DEL SISTEMA
 *
 * Antes de esto había tres colores compitiendo por el mismo papel —azul en
 * 516 lugares, emerald en 344, green en 168— repartidos según CUÁNDO se
 * escribió cada módulo, no según qué hacen. Lo mismo con los neutros (gray
 * 2059 vs slate 166), el peligro (red vs rose) y las alertas (amber vs
 * yellow vs orange). Y los colores del logo eran los MENOS usados: 13 veces
 * cada uno, solo en las pantallas de acceso.
 *
 * La causa no era que hubiera muchos colores, sino que no había vocabulario:
 * al escribir una pantalla nueva uno copiaba el archivo de al lado.
 *
 * Ahora se elige por ROL, no por color: `bg-primario-600` en vez de decidir
 * entre blue y emerald. Cambiar la marca entera es cambiar este archivo.
 */

// --- Escalas de marca -------------------------------------------------------
// Ancladas en los valores ya publicados en las pantallas de acceso (azul 100,
// 600, 800, 900, 950 y naranja 300, 500, 600): mover esos tonos cambiaría un
// diseño que ya está en producción. Los pasos intermedios se completaron
// alrededor de ellos.

// Azul marino. Reemplaza al gris del camión del logo en el mismo papel de
// "color serio de marca", con bastante más contraste sobre fondo claro.
const azul = {
  50: '#f0f4f9',
  100: '#dce3ed',
  200: '#bccbde',
  300: '#92abc7',
  400: '#628aae',
  500: '#3f6d97',
  600: '#1e3a5f',
  700: '#17304e',
  800: '#12263f',
  900: '#0b1b30',
  950: '#060f1d',
}

// Naranja del wordmark del logo, muestreado del PNG: #e9501c.
const naranja = {
  50: '#fdf1ea',
  100: '#fbdfcc',
  200: '#f7c4a3',
  300: '#f2a878',
  400: '#ee7a45',
  500: '#e9501c',
  600: '#c43f13',
  700: '#9c3310',
  800: '#7b2a11',
  900: '#642411',
  950: '#370f06',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Marca, por si hace falta nombrarla directo ---
        azul,
        naranja,

        // --- ROLES: esto es lo que se usa al escribir pantallas ---

        // La acción principal del sistema interno. Azul marino de la marca.
        primario: azul,

        // Realce: enlaces, foco, lo que debe saltar a la vista. El naranja
        // del logo. Se usa con cuentagotas — si todo resalta, nada resalta.
        acento: naranja,

        // Lo que el CLIENTE ve (catálogo y portal) conserva su verde a
        // propósito: es lo único que miran personas de afuera, ya está
        // aprobado, y ayuda a saber de un vistazo si uno está en la
        // herramienta interna o en lo que ve el cliente.
        cliente: colores.emerald,

        // --- Estados. Un solo color por significado. ---
        peligro: colores.red,      // antes: red (303) y rose (47)
        alerta: colores.amber,     // antes: amber (138), yellow (71), orange (94)
        exito: colores.emerald,    // antes: emerald y green mezclados
        neutro: colores.gray,      // antes: gray (2059) y slate (166)

        // Notas de crédito y rectificaciones. Ya se marcaban en morado de
        // forma consistente en 24 archivos; no era decoración sino un
        // significado propio, así que se le da nombre en vez de borrarlo.
        nota: colores.purple,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'indeterminate-bar': {
          '0%': { left: '-40%' },
          '60%': { left: '100%' },
          '100%': { left: '100%' },
        },
      },
      animation: {
        'indeterminate-bar': 'indeterminate-bar 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
