---
id: leccion/dos-helpers-texto
tipo: leccion
titulo: Dos funciones `texto` con firmas opuestas — al revés, guardan el código de la función en la columna
estado: vigente
archivos:
  - backend/src/utils/validacion.js
  - backend/src/modules/clientes/desdeAlegra.js
  - backend/src/modules/facturacion/facturaPropia.service.js
aristas:
  relacionado: [modulo/facturacion]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


En este backend conviven dos funciones llamadas `texto`:

- `src/utils/validacion.js`: **`texto(largo)(valor, etiqueta)`** — el primer
  paréntesis devuelve el validador. Se usa en las definiciones de campos
  (`validar: texto(200)`).
- Los archivos de traducción (`modules/*/desdeAlegra.js`, uno por módulo):
  **`texto(valor, largo)`** — recorta y devuelve el texto.

Llamar al del validador con el valor primero —`texto(valor, 40)`— no falla
ni avisa: devuelve la FUNCIÓN. Al guardarla se convierte en su propio código
fuente y revienta cualquier columna corta. Pasó en `facturaPropia.service.js`
con tres columnas a la vez, y costó seis intentos de diagnóstico porque
Postgres dice "value too long for type character varying(40)" sin decir cuál
columna. Los dobles de las pruebas aceptan cualquier valor: solo aparece
escribiendo contra una base de verdad.

CÓMO APLICARLO

- En un servicio que escribe, usar un `recortar(valor, largo)` local y
  explícito en vez de importar `texto`; si se importa, siempre
  `texto(40)(valor, 'Etiqueta')`.
- Al armar un INSERT con columnas y valores paralelos, envolverlo para que el
  error nombre las columnas con más texto (`explicarDatoLargo` en
  `facturaPropia.service.js`).
