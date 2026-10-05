---
id: modulo/lectura-migracion-alegra
tipo: modulo
titulo: Lectura histórica para migración — GET sin capacidad de escritura
estado: vigente
archivos:
  - backend/scripts/independencia/lib/lectura-alegra.js
  - backend/scripts/independencia/cargar-configuracion.js
  - backend/scripts/independencia/cargar-productos.js
  - backend/scripts/independencia/cargar-contactos.js
  - backend/scripts/independencia/cargar-facturas.js
  - backend/scripts/independencia/cargar-pagos.js
  - backend/scripts/independencia/cargar-notas-credito.js
  - backend/scripts/independencia/cargar-cotizaciones.js
  - backend/scripts/exportar-cartera-abierta.js
  - backend/tests/reintentoSeguro.test.js
  - backend/tests/inventarioDeAlegra.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/inventario, modulo/conciliacion-ventas, modulo/archivo-ventas-electronicas, leccion/la-db-local-es-produccion]
medido: 2026-10-05
---

La aplicación ya no importa `src/integrations/alegra`: esa carpeta se retiró
con todos sus servicios de escritura y sincronización. Solo los guiones de
carga, conciliación y archivo necesitan leer la fuente antes del corte.
`inventarioDeAlegra.test.js` impide importar el lector CLI desde la aplicación
o introducir llamadas directas al dominio de Alegra.

El lector expone `get`, `request('GET', ...)` y la compatibilidad `api.get`.
Ningún POST, PUT, PATCH, DELETE, HEAD u OPTIONS puede alcanzar el transporte,
incluso con `PERMITIR_SALIDAS=true`. La instancia Axios y la autenticación son
privadas. El destino es fijo, con rutas relativas simples y redirecciones
apagadas; el llamador no puede cambiar host, autenticación ni método.

Hay como máximo tres intentos por GET ante timeout, corte de red, 502–504 o
límite HTTP 429/400 con código 429. El reset del límite son segundos restantes,
con tope de un minuto. Errores definitivos abortan; no se presentan como una
página vacía. No se imprime ni entrega el objeto Axios, su causa, credenciales,
enlaces firmados ni cuerpo de error remoto. Los datos exitosos sí se devuelven
para cargar o archivar; sus informes siguen siendo privados fuera de Git.

No arranca servidor, limpieza, buzón ni mensajes. Los cargadores escriben
solo en la base local protegida; conciliadores leen SQL READ ONLY. La última
carga se repite con Alegra congelado y después se verifica la 041 y numeradores.
No se migra stock: la apertura provisional propia sigue en cero por decisión
del usuario. No usar los guiones antiguos de costos/contactos/cierre de pagos:
se retiraron de esta rama, aunque sigan existiendo en producción.
