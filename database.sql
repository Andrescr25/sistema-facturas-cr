-- Crear base de datos faltantes
CREATE DATABASE faltantes_db;
\c faltantes_db;

-- Tabla de proveedores
CREATE TABLE proveedores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    contacto VARCHAR(255),
    telefono VARCHAR(50),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    codigo VARCHAR(100),
    descripcion TEXT,
    proveedor_id INTEGER REFERENCES proveedores(id),
    precio_unitario DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de facturas (cache local de facturas de Alegra)
CREATE TABLE facturas (
    id SERIAL PRIMARY KEY,
    numero_factura VARCHAR(100) NOT NULL UNIQUE,
    alegra_id INTEGER NOT NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    cliente_email VARCHAR(100),
    fecha_emision DATE NOT NULL,
    semana INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    total DECIMAL(10,2),
    procesada BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items de factura
CREATE TABLE factura_items (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas(id),
    producto_id INTEGER REFERENCES productos(id),
    cantidad_original INTEGER NOT NULL,
    cantidad_entregada INTEGER DEFAULT 0,
    precio_unitario DECIMAL(10,2),
    subtotal DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de faltantes registrados
CREATE TABLE faltantes (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas(id),
    producto_id INTEGER REFERENCES productos(id),
    cantidad_faltante INTEGER NOT NULL,
    tipo_faltante VARCHAR(20) NOT NULL CHECK (tipo_faltante IN ('total', 'parcial')),
    observaciones TEXT,
    registrado_por VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de configuración semanal
CREATE TABLE configuracion_semanal (
    id SERIAL PRIMARY KEY,
    semana INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE faltantes ADD COLUMN estado VARCHAR(20) DEFAULT 'pendiente' 
CHECK (estado IN ('pendiente', 'procesado', 'en_reimpresion'));

CREATE TABLE procesamientos (
    id SERIAL PRIMARY KEY,
    fecha_procesamiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_facturas INTEGER NOT NULL,
    facturas_para_historial INTEGER NOT NULL,
    facturas_para_reimpresion INTEGER NOT NULL,
    procesado_por VARCHAR(100),
    detalles JSONB
);

CREATE TABLE facturas_reimpresion (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas(id),
    ajustes_realizados JSONB NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesada')),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_procesamiento TIMESTAMP,
    categoria VARCHAR(32) DEFAULT 'requiere_cambios',
    total_ajustes INTEGER DEFAULT 0
);

-- Índices para optimizar consultas
CREATE INDEX idx_facturas_semana_mes_ano ON facturas(semana, mes, ano);
CREATE INDEX idx_facturas_numero ON facturas(numero_factura);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_nombre);
CREATE INDEX idx_productos_proveedor ON productos(proveedor_id);
CREATE INDEX idx_faltantes_factura ON faltantes(factura_id);
CREATE INDEX idx_faltantes_producto ON faltantes(producto_id);

-- Datos de ejemplo para proveedores
INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES
('Proveedor A', 'Juan Pérez', '555-0001', 'juan@proveedora.com'),
('Proveedor B', 'María González', '555-0002', 'maria@proveedorb.com'),
('Proveedor C', 'Carlos Rodríguez', '555-0003', 'carlos@proveedorc.com');

-- Datos de ejemplo para productos
INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario) VALUES
('Producto 1', 'P001', 'Descripción del producto 1', 1, 10.50),
('Producto 2', 'P002', 'Descripción del producto 2', 1, 15.75),
('Producto 3', 'P003', 'Descripción del producto 3', 2, 8.25),
('Producto 4', 'P004', 'Descripción del producto 4', 2, 12.00),
('Producto 5', 'P005', 'Descripción del producto 5', 3, 20.00);
