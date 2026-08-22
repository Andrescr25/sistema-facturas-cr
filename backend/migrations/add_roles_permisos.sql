-- Roles y permisos por módulo.
--
-- Hasta ahora todo el que entraba al sistema veía todo: quien alista pedidos
-- en bodega tenía enfrente Rentabilidad, Reporte Contador y la deuda de cada
-- cliente. Con la autenticación ya puesta, esto es lo que faltaba para que
-- cada quien vea su trabajo y nada más.
--
-- DOS NIVELES, a propósito:
--   es_admin = TRUE   ve todo y además gestiona usuarios y permisos.
--   es_admin = FALSE  ve solo los módulos que tenga en usuario_modulo.
--
-- No hay una tabla de "roles" con nombre (vendedor, bodeguero) porque serían
-- tres o cuatro nombres que igual habría que editar uno por uno cuando
-- alguien necesite una pantalla de más. Con 17 módulos y un puñado de
-- usuarios, marcar casillas es más simple de entender y de auditar.

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Un permiso por (usuario, módulo). La clave primaria compuesta hace que
-- otorgar dos veces el mismo módulo sea imposible, no algo que haya que
-- recordar comprobar.
--
-- ON DELETE CASCADE: borrar un usuario se lleva sus permisos. Dejarlos
-- huérfanos haría que un id reutilizado heredara permisos ajenos.
CREATE TABLE IF NOT EXISTS usuario_modulo (
    usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    modulo VARCHAR(60) NOT NULL,
    otorgado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    otorgado_por INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
    PRIMARY KEY (usuario_id, modulo)
);

CREATE INDEX IF NOT EXISTS idx_usuario_modulo_usuario ON usuario_modulo(usuario_id);
