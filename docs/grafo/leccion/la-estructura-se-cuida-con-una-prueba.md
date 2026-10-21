---
id: leccion/la-estructura-se-cuida-con-una-prueba
tipo: leccion
titulo: La estructura no se cuida sola — el molde del proyecto, y la prueba que lo hace cumplir
estado: vigente
archivos:
  - backend/tests/estructura.test.js
  - backend/src/integrations/hacienda/emision.service.js
  - backend/src/integrations/hacienda/unClic.service.js
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/utils/facturaVista.js
  - frontend/src/hooks/useEdicionFactura.js
  - frontend/src/hooks/useEmisionFactura.js
  - frontend/src/hooks/useAsignarClientesRuta.js
  - frontend/src/hooks/useNumeracionHacienda.js
  - frontend/src/hooks/useImagenCategoria.js
  - frontend/src/utils/fechaCR.js
  - backend/tests/facturaVista.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/hacienda, modulo/rutas-clientes]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


LO QUE PASÓ. El 2026-10-11 el usuario pidió revisar si los agentes habían
respetado «la estructura de lógica y diseño». Las reglas del negocio sí, las
dos. La forma, a medias, y casi todos los desvíos eran de Claude, hechos en
un solo día de trabajo sobre Hacienda y Facturación:

- `emision.service.js` pasó de 786 a 1.218 líneas: todo lo del botón de un
  clic se fue sumando al mismo archivo;
- `VistaFactura.jsx` llegó a 790, con las cuentas, la copia que se edita y el
  cobro que se anula adentro del componente;
- dos componentes llamaban al servidor por su cuenta, sin gancho;
- un gancho quedó fuera de `src/hooks`;
- la misma función de fecha estaba copiada cinco veces;
- en una carpeta convivían dos formatos de código;
- un modal conservaba las partes que ya nadie usaba.

Del otro lado, Codex agregó tres hojas de estilo con colores escritos a mano
al catálogo del agente —las primeras del proyecto— y sus commits no llevan
firma.

NADA DE ESO ROMPÍA UNA PRUEBA, y por eso pasó. Cada cambio, mirado solo, era
razonable: "son treinta líneas más". La estructura se pierde así, de a poco y
con las pruebas en verde. La respuesta del usuario: «sé más estricto con el
mantenimiento de la estructura, es de suma importancia».

EL MOLDE (el mismo del refactor de julio; ver también `AGENTS.md`):

- **Frontend.** Las reglas y las cuentas, puras, en `src/utils/` (sin React
  ni servidor: se prueban de verdad). El estado y las llamadas al servidor,
  en un gancho de `src/hooks/`. Cada sección de una pantalla, en su
  componente dentro de `src/components/<pantalla>/`. La página solo arma. Un
  componente no importa `services/` ni el cliente de una integración.
- **Backend.** Rutas → controlador → servicio dentro de
  `src/modules/<módulo>/` (o `src/integrations/<servicio>/`). Cuando un
  servicio junta dos responsabilidades, la segunda va a otro archivo del
  mismo módulo.
- **Diseño.** La paleta por rol de `tailwind.config.js` (`primario`, `neutro`,
  `exito`, `alerta`, `peligro`, `nota`); nada de colores crudos ni a mano. Sin
  hojas `.css` nuevas salvo animaciones, y con `theme('colors.…')`.
- **Una sola copia** de cada ayudante, y lo que deja de usarse se borra en el
  mismo cambio.

LO QUE SE HIZO ESE DÍA, sin cambiar comportamiento:

- `emision.service.js` volvió a ser el camino fiscal (768 líneas); lo que el
  botón decide solo vive en `unClic.service.js`.
- `VistaFactura.jsx` quedó en 330 líneas: reglas en `utils/facturaVista.js`,
  la copia que se edita en `hooks/useEdicionFactura.js`, y las secciones en
  `ClienteFactura`, `LineasFactura`, `TotalesFactura` y `CobrosFactura`.
- El gancho, el botón, el panel y las reglas de la emisión se mudaron de
  `integrations/hacienda/` a `hooks/`, `components/facturacion/` y `utils/`;
  esa carpeta volvió a tener solo el cliente de la API y las dos pantallas
  originales, con un único formato.
- "Asignar clientes" y la numeración de Hacienda tienen su gancho; sus
  componentes ya no llaman al servidor.
- `DocumentoFiscal.jsx` quedó con lo de compras, que era lo único que lo
  usaba; se borró el 2026-10-12, cuando la compra pasó a aceptarse sola.
- `fechaCorta()` en `utils/fechaCR.js`; se quitaron las cinco copias.

Al mover las cuentas a un archivo puro aparecieron pruebas de verdad
(`facturaVista.test.js`) donde antes solo se podía buscar texto en el
componente. Y apareció un fallo viejo: al guardar bien, la pantalla salía de
edición sin desmontarse y "guardando" quedaba prendido, así que la SEGUNDA
corrección de la misma factura encontraba «Guardar cambios» apagado.

LA PRUEBA QUE LO HACE CUMPLIR: `backend/tests/estructura.test.js`. Falla si un
gancho queda fuera de su carpeta, si un componente o página nuevo llama a la
API, si entran colores crudos o una hoja de estilos con colores a mano, si se
vuelve a copiar la fecha, o si un archivo pasa del tope (500 líneas en el
frontend, 700 en el backend). Lo que ya estaba fuera del molde quedó listado
ahí como DEUDA, archivo por archivo: puede achicarse, no crecer.

Un fallo de esa prueba no dice "no se puede"; dice "esto se decide a
propósito". Lo normal es acomodar el cambio al molde. La excepción se anota
en la misma prueba, en el mismo commit, con su porqué.

**La regla que deja:** lo que no falla en ninguna prueba se degrada sin que
nadie lo decida. Si algo importa —y la estructura importa—, tiene que haber
algo que se ponga rojo cuando se pierde.

DEUDA QUE QUEDÓ ANOTADA AL HACER LA REVISIÓN: las tres hojas de estilo del catálogo
del agente (`introduccionCategoria.css`, `cuadricula.css`,
`transicionCategoria.css`), porque Codex estaba trabajando en esa carpeta; diecisiete componentes y páginas de
antes que llaman a la API directo; cincuenta colores crudos; y catorce
archivos que ya pasaban el tope de tamaño.

Al corregir las fotos de categoría, Codex pasó las tres hojas del catálogo a
`theme('colors.…')` y retiró su excepción de la prueba. El estado del modal de
imagen vive ahora en `hooks/useImagenCategoria.js`; el componente dibuja.
