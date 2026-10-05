---
id: modulo/hacienda
tipo: modulo
titulo: Hacienda — integración fiscal separada, XML 4.4 y estados duraderos
estado: vigente
archivos:
  - backend/src/integrations/hacienda/README.md
  - backend/src/integrations/hacienda/package.json
  - backend/src/integrations/hacienda/rutas.js
  - backend/src/integrations/hacienda/configuracion.service.js
  - backend/src/integrations/hacienda/emision.service.js
  - backend/src/integrations/hacienda/lectura.service.js
  - backend/src/integrations/hacienda/trabajador.js
  - backend/src/integrations/hacienda/transporte/cliente.js
  - backend/src/integrations/hacienda/seguridad/almacen.js
  - backend/src/integrations/hacienda/firma/xades.js
  - backend/src/integrations/hacienda/firma/certificado.js
  - backend/src/integrations/hacienda/xml/v4.4.js
  - backend/src/integrations/hacienda/xml/validar.js
  - backend/src/integrations/hacienda/esquemas/v4.4/fuentes.json
  - backend/migrations/independencia/043_hacienda.sql
  - frontend/src/integrations/hacienda/ConfiguracionHacienda.jsx
  - frontend/src/integrations/hacienda/DocumentoFiscal.jsx
  - frontend/src/integrations/hacienda/catalogos.js
  - backend/tests/haciendaFiscal.test.js
  - backend/tests/haciendaTransporte.test.js
  - backend/tests/haciendaPg.test.js
  - docs/plan-integracion-hacienda.md
  - docs/informes/hacienda-2026-10-05.md
aristas:
  relacionado: [modulo/facturacion, modulo/compras, modulo/correo-facturas, modulo/permisos, modulo/ensayo-corte, modulo/archivo-ventas-electronicas, bloqueo/carga-electronica-historica, decision/la-ruta-no-el-contenido, bloqueo/prisma-no-se-regenera]
medido: 2026-10-05
---

El usuario autorizó desarrollar Hacienda sin pedir nuevas confirmaciones,
dentro del mismo proyecto pero en carpetas propias. Sustituye la instrucción
anterior de posponerla. Revisiones manuales de fichas y conteo: usuario.

La **4.4** es la versión publicada en OVi el 2026-10-05, con ajustes de abril
2026. Se conservaron esquemas actuales, fuentes y huellas, incluida la
importación XMLDSig local. El API es v1; su número no es la versión del XML.

Implementados FE, TE y NC en CRC, mensajes receptor, certificado .p12 + PIN,
OAuth por ambiente y firma XAdES-EPES verificable. Configuración → Hacienda
recibe el certificado y las credenciales; nunca vuelven en GET o bitácora.
Configuración → Impuestos/Métodos de pago permite completar códigos fiscales.
No inferir tarifa exenta del porcentaje cero ni actividad/ubicación del nombre.

Migración 043 crea configuración, numerador y comprobantes con id propio.
Preparar bloquea documento y serie; conserva XML firmado y clave. Repetir la
preparación devuelve la misma reserva. Timeout produce `incierta`: consultar
la misma clave antes de reenviar los mismos bytes. 201 solo es `recibida`.
Aceptar exige respuesta autenticada, XML/XSD/firma y clave/emisor coincidentes.
Sandbox conserva la venta comercial y numeración de producción intactas.

Reserva de producción bloquea cambios de cabecera y líneas, incluso inserts
y traslados. Un rechazo se conserva y permite sustitución explícita con
referencia tipo 10/código 16 y nuevo consecutivo. Aceptados se corrigen con
nota, nunca borrando. Emitir ante Hacienda no vuelve a mover inventario,
cobros, aplicaciones ni saldos. El indicador `anulada_por_nota` sigue siendo
una derivación del negocio, no una edición del original fiscal.

PDF de aceptadas propias usa número fiscal y emisor del XML firmado. El
correo manual incorpora PDF + XML + respuesta, con las guardas existentes.
La compra usa su id propio; desde el buzón se resuelve primero el UUID. Sin
XML original no se fabrica mensaje receptor. Cargarlo exige correspondencia
de clave, proveedor, receptor y total. La aceptación comercial y fiscal son
estados distintos; la fiscal vive en los comprobantes.

`HACIENDA_PERMITIR_PRUEBAS` abre exclusivamente sandbox. Producción conserva
`salidasBloqueadas()`. El seguimiento automático es optativo mediante
`HACIENDA_TRABAJADOR`; consulta, no envía. Dependencias de firma separadas del
Prisma compartido, instalación exclusivamente en el paquete anidado.

**Pendiente externo:** cargar certificados/credenciales reales, aceptación
real en pruebas, recepción de adjuntos, infraestructura persistente y corte.
Los tests usan firma de prueba y transporte simulado; no son homologación.
Alcance no implementado (REP, ND, FEE, FEC, exoneraciones, moneda extranjera,
IVA especial): README del módulo. No declararlo terminado por tener sus XSD.

Respaldar base + llave de cifrado + XML privados juntos. 0700/0600, fuera de
Git y de rutas públicas. No copiar secretos a memoria/grafo ni ejecutar
limpieza semanal. Detalle operativo y plan: archivos citados arriba.

NUMERACIÓN HISTÓRICA: las plantillas de Alegra pueden compartir prefijo y
número entre venta comercial y electrónica. El adaptador conserva el número
impreso, usa la serie/consecutivo de la clave y guarda plantilla de origen.
La recarga normaliza series abreviadas sin inventar aceptación. La reserva
fiscal relee también las claves del emisor para no reutilizar números.
