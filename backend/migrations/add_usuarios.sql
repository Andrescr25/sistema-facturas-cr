-- Usuarios del sistema.
--
-- Hasta ahora el sistema no tenía autenticación de ningún tipo: cualquiera
-- con la URL de Render entraba a /cuentas-por-cobrar y veía la deuda de cada
-- cliente, a /reporte-contador, o a /facturacion y emitía facturas. Eso pasó
-- de ser un riesgo latente a uno concreto al abrir un catálogo para mandarle
-- a los clientes en el mismo dominio: basta con borrar la ruta de la barra
-- de direcciones.
--
-- La contraseña se guarda como hash bcrypt, nunca en claro. `activo` permite
-- revocarle el acceso a alguien sin borrar el usuario, para no perder de
-- vista quién hizo qué si más adelante se registran acciones por usuario.

CREATE TABLE IF NOT EXISTS usuario (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(60) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_ingreso TIMESTAMP,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuario_activo ON usuario(activo);
