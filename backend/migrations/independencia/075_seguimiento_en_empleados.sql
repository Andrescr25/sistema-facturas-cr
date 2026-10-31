-- 075 · «Seguimiento de agentes» pasa a estar dentro de «Empleados» (2026-10-30).
--
-- El usuario: «el seguimiento de agente, pónmelo dentro de empleados». El día
-- del agente (recorrido, ventas, GPS, jornada) se abre desde la ficha de cada
-- empleado y lo protege el permiso `empleados`. El módulo aparte
-- `seguimiento-agentes` (2026-10-29) deja de existir: su permiso se borra.
--
-- Sin borrarlo, quien lo tuviera quedaría con una clave que ya no existe y
-- Usuarios no le dejaría guardar nada más (`limpiarModulos` la rechaza). No se
-- reparte «Empleados» en su lugar: ese permiso también paga y corrige horas;
-- lo da el administrador a quien corresponda.
--
-- Se puede correr dos veces: la segunda no hace nada.

DELETE FROM usuario_modulo WHERE modulo = 'seguimiento-agentes';
