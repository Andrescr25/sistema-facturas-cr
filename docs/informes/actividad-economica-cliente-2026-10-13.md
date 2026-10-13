# Actividad económica del cliente con punto

Corrección solicitada por el usuario y realizada por Codex, 2026-10-13.
La ficha de Clientes validaba actividad económica con `soloDigitos(10)`;
rechazaba `4752.1` tanto escrito a mano como elegido de la consulta de
Hacienda. La integración fiscal ya admite esta forma desde el 2026-10-10.

Crear y editar guardan el código como texto y conservan su punto. Se admiten
los códigos numéricos anteriores y el vacío opcional, con el límite existente
de diez caracteres. Se rechazan letras, coma, punto inicial/final, puntos
repetidos y exceso de longitud. La limpieza de identificación y teléfonos
conserva sus reglas. Hacienda mantiene su validación fiscal independiente.

El campo del formulario usa texto para que el teléfono permita el punto;
ofrece `4752.1 o 523402` como ejemplo y aclara que es opcional.

Validación: pruebas del servicio para creación, edición y entradas inválidas;
persistencia real y rollback en PostgreSQL desechable; regresión del XML/XSD
en `haciendaFiscal.test.js`; build y formulario real en Chromium.
Suite completa, grafo y estructura comprobados. Evidencia privada fuera del
repositorio; sin datos ZZ persistidos, mensajes reales ni pruebas en producción.

Trabajo en una copia propia sobre `developer`. Claude trabaja en
`tmp/claude-editar-cliente-20261013`; sus archivos y procesos no se tocaron.
No modifica Facturación, archivos fiscales ni su configuración. No necesita
migración ni regenerar Prisma.
