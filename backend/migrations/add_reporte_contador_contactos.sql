-- Contactos a los que se les pueden enviar los reportes del mes.
--
-- Reemplaza a reporte_contador_destinatario, que guardaba UN solo correo sin
-- nombre. Con varios contactos guardados se puede cambiar de contador sin
-- perder el anterior ni tener que buscar la dirección cada vez.

CREATE TABLE IF NOT EXISTS reporte_contador_contacto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120) NOT NULL,
    -- El correo identifica al contacto: evita agregar dos veces al mismo.
    email VARCHAR(255) NOT NULL UNIQUE,
    -- Se sella en cada envío; sirve para preseleccionar el último usado.
    ultimo_envio TIMESTAMP,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reporte_contador_contacto_uso
    ON reporte_contador_contacto(ultimo_envio DESC NULLS LAST);

-- Arrastra el correo que hubiera guardado la versión anterior, si esa tabla
-- todavía existe. El guard de to_regclass permite correr esta migración en
-- una base que nunca tuvo la tabla vieja.
DO $$
BEGIN
    IF to_regclass('public.reporte_contador_destinatario') IS NOT NULL THEN
        INSERT INTO reporte_contador_contacto (nombre, email)
        SELECT 'Contador', email FROM reporte_contador_destinatario
        ON CONFLICT (email) DO NOTHING;

        DROP TABLE reporte_contador_destinatario;
    END IF;
END $$;
