-- Caja General deja de ser un tab de CxC. Conservar el acceso que ya tenía
-- cada persona, sin abrir cobros/cierres al nuevo permiso independiente.
BEGIN;
INSERT INTO usuario_modulo (usuario_id, modulo, otorgado_por)
  SELECT usuario_id, 'caja-general', otorgado_por
  FROM usuario_modulo WHERE modulo='cuentas-por-cobrar'
ON CONFLICT (usuario_id, modulo) DO NOTHING;
COMMIT;
