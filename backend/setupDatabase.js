const { Pool } = require('pg');
require('dotenv').config();
// Rama independencia-alegra: crear tablas SOLO en la base local.
require('./config/aislado').asegurarBaseLocal();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Necesario para Render
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Iniciando configuración de la base de datos...');

    // Verificar conexión
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión exitosa:', result.rows[0].now);

    // Habilitar extensión para UUID si está disponible
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    // ============================================
    // 🗑️ ELIMINAR TODO (TEMPORAL)
    // ============================================
    console.log('🗑️ ELIMINANDO TODAS LAS TABLAS...');

    // Eliminar en orden correcto (por dependencias)
    await client.query('DROP TABLE IF EXISTS costo_historico CASCADE');
    await client.query('DROP TABLE IF EXISTS producto_rotacion CASCADE');
    await client.query('DROP TABLE IF EXISTS config_precios CASCADE');
    await client.query('DROP TABLE IF EXISTS precio_historico CASCADE');
    await client.query('DROP TABLE IF EXISTS competencia_mapping CASCADE');
    await client.query('DROP TABLE IF EXISTS precio_competencia CASCADE');
    await client.query('DROP TABLE IF EXISTS competencia_rechazo CASCADE');
    await client.query('DROP TABLE IF EXISTS pago_recurrente CASCADE');
    await client.query('DROP TABLE IF EXISTS gasto_recurrente CASCADE');
    await client.query('DROP TABLE IF EXISTS duplicado_electronica CASCADE');
    await client.query('DROP TABLE IF EXISTS margen_snapshot CASCADE');
    await client.query('DROP TABLE IF EXISTS reporte_contador_contacto CASCADE');
    await client.query('DROP TABLE IF EXISTS reporte_contador_linea CASCADE');
    await client.query('DROP TABLE IF EXISTS reporte_contador_periodo CASCADE');
    await client.query('DROP TABLE IF EXISTS venta_historico CASCADE');
    await client.query('DROP TABLE IF EXISTS abonos_cobro CASCADE');
    await client.query('DROP TABLE IF EXISTS cuentas_por_cobrar CASCADE');
    await client.query('DROP TABLE IF EXISTS cuentas_por_pagar CASCADE');
    await client.query('DROP TABLE IF EXISTS rotacion_productos CASCADE');
    await client.query('DROP TABLE IF EXISTS orden_compra_temporal CASCADE');
    await client.query('DROP TABLE IF EXISTS faltantes_ajustes CASCADE');
    await client.query('DROP TABLE IF EXISTS facturas_reimpresion CASCADE');
    await client.query('DROP TABLE IF EXISTS procesamientos CASCADE');
    await client.query('DROP TABLE IF EXISTS configuracion_semanal CASCADE');
    await client.query('DROP TABLE IF EXISTS faltantes CASCADE');
    await client.query('DROP TABLE IF EXISTS factura_items CASCADE');
    await client.query('DROP TABLE IF EXISTS facturas CASCADE');
    await client.query('DROP TABLE IF EXISTS productos CASCADE');
    await client.query('DROP TABLE IF EXISTS proveedores CASCADE');

    // Eliminar función si existe
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

    console.log('✅ Todas las tablas eliminadas');

    // ============================================
    // 📋 CREAR TABLAS DESDE CERO
    // ============================================

    // Crear tabla de proveedores
    console.log('📋 Creando tabla proveedores...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          contacto VARCHAR(255),
          telefono VARCHAR(50),
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de productos
    console.log('📋 Creando tabla productos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS productos (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          codigo VARCHAR(100),
          descripcion TEXT,
          proveedor_id INTEGER REFERENCES proveedores(id),
          precio_unitario DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de facturas
    console.log('📋 Creando tabla facturas...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas (
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
          estado_bodega VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_bodega IN ('pendiente', 'procesado', 'anulada')),
          -- Cuándo salió de bodega. Alimenta la línea de tiempo que ve el
          -- cliente en el portal (ver portal-clientes/seguimiento.js).
          bodega_procesado_en TIMESTAMP,
          estado_procesamiento VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_procesamiento IN ('pendiente', 'procesado')),
          observaciones_adicionales TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de items de factura
    console.log('📋 Creando tabla factura_items...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS factura_items (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          producto_id INTEGER REFERENCES productos(id),
          cantidad_original INTEGER NOT NULL,
          cantidad_entregada INTEGER DEFAULT 0,
          precio_unitario DECIMAL(10,2),
          subtotal DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de faltantes
    console.log('📋 Creando tabla faltantes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS faltantes (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          producto_id INTEGER REFERENCES productos(id),
          cantidad_faltante INTEGER NOT NULL DEFAULT 0,
          tipo_faltante VARCHAR(20) NOT NULL CHECK (tipo_faltante IN ('total', 'parcial', 'completo')),
          observaciones TEXT,
          registrado_por VARCHAR(100),
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesado', 'en_reimpresion')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de configuración semanal
    console.log('📋 Creando tabla configuracion_semanal...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracion_semanal (
          id SERIAL PRIMARY KEY,
          semana INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          fecha_inicio DATE NOT NULL,
          fecha_fin DATE NOT NULL,
          activa BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de procesamientos
    console.log('📋 Creando tabla procesamientos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS procesamientos (
          id SERIAL PRIMARY KEY,
          fecha_procesamiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          total_facturas INTEGER NOT NULL,
          facturas_para_historial INTEGER NOT NULL,
          facturas_para_reimpresion INTEGER NOT NULL,
          procesado_por VARCHAR(100),
          detalles JSONB
      )
    `);

    // Crear tabla de facturas_reimpresion
    console.log('📋 Creando tabla facturas_reimpresion...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_reimpresion (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          ajustes_realizados JSONB NOT NULL,
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesada')),
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_procesamiento TIMESTAMP
      )
    `);

    // Crear tabla de ajustes temporales para faltantes
    console.log('📋 Creando tabla faltantes_ajustes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS faltantes_ajustes (
          id SERIAL PRIMARY KEY,
          faltante_id INTEGER REFERENCES faltantes(id) UNIQUE,
          cantidad_entregada INTEGER NOT NULL,
          estado VARCHAR(20) NOT NULL CHECK (estado IN ('completo', 'parcial', 'no_llego')),
          requiere_actualizacion BOOLEAN DEFAULT FALSE,
          revisado BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para facturas marcadas como pendientes manualmente
    console.log('📋 Creando tabla facturas_pendientes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_pendientes (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id) UNIQUE,
          alegra_id INTEGER NOT NULL,
          motivo TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para cuentas por pagar (facturas de proveedores)
    console.log('📋 Creando tabla cuentas_por_pagar...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          factura_id UUID UNIQUE REFERENCES facturas_proveedores(id) ON DELETE CASCADE,
          proveedor_nombre VARCHAR(255) NOT NULL,
          proveedor_cedula VARCHAR(50) NOT NULL,
          numero_consecutivo VARCHAR(150),
          condicion_venta VARCHAR(10),
          plazo_credito INTEGER DEFAULT 0,
          fecha_emision TIMESTAMP NOT NULL,
          fecha_vencimiento TIMESTAMP NOT NULL,
          monto_total NUMERIC(14,2) NOT NULL,
          saldo_pendiente NUMERIC(14,2) NOT NULL,
          estado VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADA','VENCIDA')),
          liberada BOOLEAN DEFAULT FALSE,
          notas TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para cuentas por cobrar (espejo local de facturas de venta
    // con saldo pendiente en Alegra — Alegra es la fuente de verdad, esto
    // solo evita tener que recorrer /invoices en vivo en cada carga)
    console.log('📋 Creando tabla cuentas_por_cobrar...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          alegra_invoice_id VARCHAR(50) UNIQUE NOT NULL,
          numero_factura VARCHAR(150) NOT NULL,
          cliente_id VARCHAR(50) NOT NULL,
          cliente_nombre VARCHAR(255) NOT NULL,
          fecha_emision TIMESTAMP NOT NULL,
          fecha_vencimiento TIMESTAMP NOT NULL,
          total NUMERIC(14,2) NOT NULL,
          total_pagado NUMERIC(14,2) NOT NULL,
          saldo NUMERIC(14,2) NOT NULL,
          condicion_venta VARCHAR(20),
          plazo VARCHAR(50),
          estado_alegra VARCHAR(20) NOT NULL,
          synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para bitácora de abonos (NO es la fuente del saldo, eso es
    // Alegra — es auditoría de quién/cuándo/cómo se cobró)
    console.log('📋 Creando tabla abonos_cobro...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS abonos_cobro (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          alegra_invoice_id VARCHAR(50) NOT NULL,
          alegra_payment_id VARCHAR(50),
          cliente_id VARCHAR(50),
          cliente_nombre VARCHAR(255) NOT NULL,
          numero_factura VARCHAR(150) NOT NULL,
          monto NUMERIC(14,2) NOT NULL,
          fecha TIMESTAMP NOT NULL,
          metodo_pago VARCHAR(30) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para el histórico de compras por cliente (Catálogo
    // Público personalizado). Ledger crudo, histórico completo sin poda —
    // a propósito separada de venta_items, que tiene ventana móvil de 120
    // días para la detección de excesos.
    console.log('📋 Creando tabla venta_historico...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS venta_historico (
          id SERIAL PRIMARY KEY,
          alegra_invoice_id INTEGER NOT NULL,
          alegra_item_id VARCHAR(100) NOT NULL,
          cliente_id VARCHAR(50) NOT NULL,
          cliente_nombre VARCHAR(255),
          cantidad NUMERIC(12,2) NOT NULL DEFAULT 0,
          precio_unitario NUMERIC(12,2) DEFAULT 0,
          fecha_emision DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (alegra_invoice_id, alegra_item_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_venta_historico_cliente ON venta_historico(cliente_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_venta_historico_fecha ON venta_historico(fecha_emision)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_venta_historico_item ON venta_historico(alegra_item_id)');

    // Crear tabla para la serie histórica de costo real por producto,
    // derivada de productos_factura_proveedor (que ya tiene el dato pero
    // solo como líneas de factura, no como serie consultable). El cache de
    // Alegra (alegra_products_cache.cost) se pisa cada 6h y solo guarda el
    // último valor — esta tabla es lo que permite calcular márgenes contra
    // el costo vigente en la fecha real de cada venta.
    console.log('📋 Creando tabla costo_historico...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS costo_historico (
          id SERIAL PRIMARY KEY,
          alegra_item_id VARCHAR(50) NOT NULL,
          producto_factura_id UUID,
          proveedor_cedula VARCHAR(50),
          proveedor_nombre VARCHAR(255),
          fecha DATE NOT NULL,
          costo_unitario NUMERIC(14,4) NOT NULL,
          factor_conversion NUMERIC(14,6) NOT NULL DEFAULT 1,
          origen VARCHAR(30) NOT NULL DEFAULT 'factura_proveedor',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (producto_factura_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_costo_historico_item ON costo_historico(alegra_item_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_costo_historico_fecha ON costo_historico(fecha)');

    // Crear tabla de clasificación ABC de rotación por producto (Alegra).
    // A propósito NO es rotacion_productos (abajo): esa es de grano semanal
    // atada a faltantes, con FK dura a la tabla legacy "productos" — no
    // encaja con esto y sigue completamente muerta, sin tocar.
    console.log('📋 Creando tabla producto_rotacion...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS producto_rotacion (
          id SERIAL PRIMARY KEY,
          alegra_item_id VARCHAR(50) UNIQUE NOT NULL,
          unidades_mes NUMERIC(14,2) NOT NULL DEFAULT 0,
          clientes_distintos INTEGER NOT NULL DEFAULT 0,
          facturacion_12m NUMERIC(14,2) NOT NULL DEFAULT 0,
          meses_sin_venta INTEGER,
          clase CHAR(1) NOT NULL,
          calculado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_producto_rotacion_clase ON producto_rotacion(clase)');

    // Configuración del motor de precios: margen meta y margen mínimo por
    // categoría, editable desde una pantalla — reemplaza el 20% que antes
    // vivía hardcodeado en el frontend. La fila '__default__' cubre
    // categorías sin config propia. Sembrado real en
    // backend/migrations/add_precios_fase2.sql (NO se repite acá el INSERT
    // para no pisar valores que el usuario ya haya editado desde la UI).
    console.log('📋 Creando tabla config_precios...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS config_precios (
          id SERIAL PRIMARY KEY,
          categoria VARCHAR(255) UNIQUE NOT NULL,
          margen_meta NUMERIC(5,2) NOT NULL,
          margen_minimo NUMERIC(5,2) NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bitácora de cada cambio de precio aplicado — antes no quedaba ningún
    // registro de qué precio se aplicó, cuándo, ni con qué margen resultó.
    console.log('📋 Creando tabla precio_historico...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS precio_historico (
          id SERIAL PRIMARY KEY,
          alegra_item_id VARCHAR(50) NOT NULL,
          precio_anterior NUMERIC(14,2),
          precio_nuevo NUMERIC(14,2) NOT NULL,
          costo_al_momento NUMERIC(14,4),
          margen_resultante NUMERIC(6,2),
          origen VARCHAR(30) NOT NULL DEFAULT 'revision_precios',
          factura_id UUID,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_precio_historico_item ON precio_historico(alegra_item_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_precio_historico_factura ON precio_historico(factura_id)');

    // Precios de competencia (EPA, Walmart, Mas x Menos, carga manual) —
    // mismo patrón que supplier_product_mapping + productos_factura_proveedor:
    // competencia_mapping es el vínculo estable producto propio ↔ producto
    // de la competencia; precio_competencia es la captura cruda de cada
    // sincronización (append-only, queda histórico de precios en el tiempo).
    console.log('📋 Creando tabla competencia_mapping...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS competencia_mapping (
          id SERIAL PRIMARY KEY,
          fuente VARCHAR(30) NOT NULL,
          sku_externo VARCHAR(150) NOT NULL,
          nombre_externo VARCHAR(500) NOT NULL,
          alegra_item_id VARCHAR(50) NOT NULL,
          confianza NUMERIC(5,2),
          origen VARCHAR(20) NOT NULL DEFAULT 'automatico',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (fuente, sku_externo)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_competencia_mapping_item ON competencia_mapping(alegra_item_id)');

    console.log('📋 Creando tabla precio_competencia...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS precio_competencia (
          id SERIAL PRIMARY KEY,
          fuente VARCHAR(30) NOT NULL,
          sku_externo VARCHAR(150) NOT NULL,
          nombre_externo VARCHAR(500) NOT NULL,
          precio NUMERIC(14,2) NOT NULL,
          -- Foto y ficha del producto de la competencia: emparejar por
          -- nombre no alcanza para decidir "¿es el mismo producto?"
          -- ("TOALLA P/ MANOS 180 MTS" vs "Porta toallas de manos" da score
          -- alto y son cosas distintas). Vienen en la misma respuesta que
          -- ya consultamos, sin petición extra.
          imagen_url TEXT,
          url_producto TEXT,
          fecha_captura DATE NOT NULL DEFAULT CURRENT_DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (fuente, sku_externo, fecha_captura)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_precio_competencia_fuente_sku ON precio_competencia(fuente, sku_externo)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_precio_competencia_fecha ON precio_competencia(fecha_captura)');

    // Recuerda qué sugerencias de emparejamiento de competencia se
    // rechazaron a mano, para que no vuelvan a aparecer en "pendientes".
    console.log('📋 Creando tabla competencia_rechazo...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS competencia_rechazo (
          id SERIAL PRIMARY KEY,
          fuente VARCHAR(30) NOT NULL,
          sku_externo VARCHAR(150) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (fuente, sku_externo)
      )
    `);

    // Pagos recurrentes: gastos fijos del negocio (luz, agua, internet,
    // alquiler, insumos, planilla). La plantilla describe el gasto y
    // pago_recurrente guarda una fila por período — es lo que permite ver
    // cuánto sale cada mes y cómo viene variando cada servicio.
    console.log('📋 Creando tabla gasto_recurrente...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS gasto_recurrente (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(200) NOT NULL,
          categoria VARCHAR(50) NOT NULL DEFAULT 'servicios',
          proveedor VARCHAR(200),
          monto_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
          frecuencia VARCHAR(20) NOT NULL DEFAULT 'mensual',
          mes_referencia INTEGER,
          dia_vencimiento INTEGER,
          notas TEXT,
          activo BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('📋 Creando tabla pago_recurrente...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pago_recurrente (
          id SERIAL PRIMARY KEY,
          gasto_id INTEGER NOT NULL REFERENCES gasto_recurrente(id) ON DELETE CASCADE,
          periodo VARCHAR(10) NOT NULL,
          monto NUMERIC(12,2) NOT NULL DEFAULT 0,
          fecha_vencimiento DATE,
          fecha_pago DATE,
          estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          metodo VARCHAR(50),
          notas TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Un gasto puede recibir varios recibos en el mismo mes (Liberty factura
    // internet y cada línea móvil por separado). El COALESCE es necesario:
    // dos NULL no colisionan en Postgres, así que sin él los gastos manuales
    // —sin documento— dejarían de deduplicarse.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_pago_recurrente_gasto_periodo_doc
      ON pago_recurrente (gasto_id, periodo, (COALESCE(documento_externo, '')))`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_pago_recurrente_periodo ON pago_recurrente(periodo)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pago_recurrente_estado ON pago_recurrente(estado)');

    // Bitácora de las copias que deja Alegra al convertir una factura a
    // electrónica: conserva el registro original (id bajo, timbrado) y deja
    // atrás una copia no electrónica con id nuevo, que aparece duplicando el
    // monto en Cuentas por Cobrar y como segunda orden en Bodega. Queda
    // registro porque anular una factura de venta es irreversible desde acá.
    console.log('📋 Creando tabla duplicado_electronica...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS duplicado_electronica (
          id SERIAL PRIMARY KEY,
          duplicado_alegra_id VARCHAR(20) NOT NULL UNIQUE,
          duplicado_numero VARCHAR(60),
          electronica_alegra_id VARCHAR(20) NOT NULL,
          electronica_numero VARCHAR(60),
          cliente_id VARCHAR(20),
          cliente_nombre VARCHAR(255),
          fecha_emision DATE,
          total NUMERIC(14,2) NOT NULL DEFAULT 0,
          estado VARCHAR(20) NOT NULL DEFAULT 'requiere_revision',
          motivo TEXT,
          pago_en_duplicado NUMERIC(14,2) NOT NULL DEFAULT 0,
          pago_en_electronica NUMERIC(14,2) NOT NULL DEFAULT 0,
          detectado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          anulado_en TIMESTAMP
      )`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_duplicado_electronica_estado ON duplicado_electronica(estado)');

    // Reporte Contador: control interno mensual de ventas/compras a partir
    // de los Excel que exporta Alegra. Se guarda línea por línea porque la
    // detección de duplicados necesita comparar factura contra factura.
    console.log('📋 Creando tabla margen_snapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS margen_snapshot (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          fecha DATE NOT NULL,
          alegra_item_id VARCHAR(20) NOT NULL,
          categoria VARCHAR(120),
          precio NUMERIC(14,2),
          costo NUMERIC(14,2),
          origen_costo VARCHAR(12),
          margen NUMERIC(7,2),
          clasificacion VARCHAR(20) NOT NULL,
          unidades_mes NUMERIC(12,2),
          facturacion_12m NUMERIC(14,2),
          creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (fecha, alegra_item_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_margen_snapshot_fecha ON margen_snapshot(fecha DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_margen_snapshot_item ON margen_snapshot(alegra_item_id, fecha DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_margen_snapshot_categoria ON margen_snapshot(categoria, fecha DESC)');

    console.log('📋 Creando tabla reporte_contador_periodo...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reporte_contador_periodo (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          anio INTEGER NOT NULL,
          mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
          tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ventas', 'compras')),
          nombre_archivo VARCHAR(255),
          base_gravable_original NUMERIC(14,2) NOT NULL DEFAULT 0,
          impuesto_original NUMERIC(14,2) NOT NULL DEFAULT 0,
          -- Las devoluciones (notas de crédito) van aparte, NO restadas de la
          -- base gravable — así las presenta el resumen oficial de Alegra.
          base_devoluciones_original NUMERIC(14,2) NOT NULL DEFAULT 0,
          impuesto_devoluciones_original NUMERIC(14,2) NOT NULL DEFAULT 0,
          fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (anio, mes, tipo)
      )
    `);

    console.log('📋 Creando tabla reporte_contador_linea...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reporte_contador_linea (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          periodo_id UUID NOT NULL REFERENCES reporte_contador_periodo(id) ON DELETE CASCADE,
          orden INTEGER NOT NULL,
          tipo_documento VARCHAR(50),
          fecha DATE,
          numero VARCHAR(30) NOT NULL,
          -- Solo en notas de crédito: la factura a la que hacen referencia.
          documento_asociado VARCHAR(30),
          es_emitida BOOLEAN NOT NULL,
          contraparte VARCHAR(255),
          actividad_economica VARCHAR(255),
          concepto VARCHAR(500),
          cantidad NUMERIC(14,4),
          precio_unitario NUMERIC(14,4),
          precio_total NUMERIC(14,2),
          descuento NUMERIC(14,2) DEFAULT 0,
          nombre_impuesto VARCHAR(50),
          tipo_impuesto VARCHAR(50),
          tarifa VARCHAR(20),
          tipo_tarifa VARCHAR(30),
          acreditable VARCHAR(10),
          base_gravable NUMERIC(14,2) DEFAULT 0,
          impuesto NUMERIC(14,2) DEFAULT 0,
          excluido BOOLEAN NOT NULL DEFAULT FALSE,
          duplicado_confianza VARCHAR(10),
          duplicado_de VARCHAR(30)
      )
    `);
    console.log('📋 Creando tabla reporte_contador_contacto...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reporte_contador_contacto (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          nombre VARCHAR(120) NOT NULL,
          -- El correo identifica al contacto: evita agregar dos veces al mismo.
          email VARCHAR(255) NOT NULL UNIQUE,
          -- Se sella en cada envío; sirve para preseleccionar el último usado.
          ultimo_envio TIMESTAMP,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_reporte_contador_contacto_uso ON reporte_contador_contacto(ultimo_envio DESC NULLS LAST)');

    await client.query('CREATE INDEX IF NOT EXISTS idx_reporte_contador_linea_periodo ON reporte_contador_linea(periodo_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reporte_contador_linea_numero ON reporte_contador_linea(periodo_id, numero)');

    // Crear tabla para cantidades modificadas de órdenes de compra
    console.log('📋 Creando tabla orden_compra_temporal...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS orden_compra_temporal (
          id SERIAL PRIMARY KEY,
          proveedor_nombre VARCHAR(255) NOT NULL,
          producto_codigo VARCHAR(100) NOT NULL,
          producto_nombre VARCHAR(255) NOT NULL,
          cantidad_original INTEGER NOT NULL,
          cantidad_modificada INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(proveedor_nombre, producto_codigo)
      )
    `);

    // Crear tabla para rotación histórica de productos
    console.log('📋 Creando tabla rotacion_productos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rotacion_productos (
          id SERIAL PRIMARY KEY,
          producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
          producto_codigo VARCHAR(100) NOT NULL,
          producto_nombre VARCHAR(255) NOT NULL,
          proveedor_id INTEGER REFERENCES proveedores(id),
          proveedor_nombre VARCHAR(255),
          semana INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          fecha_inicio_semana DATE NOT NULL,
          faltantes_registrados INTEGER DEFAULT 0,
          cantidad_faltante_total INTEGER DEFAULT 0,
          costo_total NUMERIC(18,2) DEFAULT 0,
          venta_total NUMERIC(18,2) DEFAULT 0,
          margen_total NUMERIC(18,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (producto_id, semana, ano)
      )
    `);

    // Registro de lo que sale por WhatsApp. Ver
    // migrations/add_envio_whatsapp.sql para el porqué.
    console.log('📋 Creando tabla envio_whatsapp...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS envio_whatsapp (
          id                SERIAL PRIMARY KEY,
          tipo              VARCHAR(30) NOT NULL,
          referencia        VARCHAR(60),
          alegra_contact_id VARCHAR(20),
          telefono          VARCHAR(20) NOT NULL,
          enviado_por       INTEGER REFERENCES usuario(id),
          exito             BOOLEAN NOT NULL,
          error             TEXT,
          creado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_ref ON envio_whatsapp (tipo, referencia)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_contacto ON envio_whatsapp (alegra_contact_id, creado_en DESC)`);

    // Crear función para actualizar updated_at automáticamente
    // Rama independencia-alegra · migrations/independencia/001_bitacora_cambio.sql
    // Quién cambió qué y cuándo: el historial que hoy lleva Alegra.
    // usuario_id sin llave foránea acá: la tabla usuario la crea migrations/add_usuarios.sql,
    // que corre aparte. En la migración de la rama sí lleva REFERENCES usuario(id).
    console.log('📋 Creando tabla bitacora_cambio...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bitacora_cambio (
        id          BIGSERIAL    PRIMARY KEY,
        entidad     VARCHAR(40)  NOT NULL,
        entidad_id  VARCHAR(60)  NOT NULL,
        accion      VARCHAR(20)  NOT NULL,
        antes       JSONB,
        despues     JSONB,
        cambios     JSONB,
        usuario_id  INTEGER,
        motivo      TEXT,
        creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora_cambio (entidad, entidad_id, creado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bitacora_usuario ON bitacora_cambio (usuario_id, creado_en DESC)');

    // Rama independencia-alegra · migrations/independencia/002_configuracion.sql
    console.log('📋 Creando tabla empresa...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS empresa (
        id                   SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        nombre               VARCHAR(160) NOT NULL,
        nombre_comercial     VARCHAR(160),
        tipo_identificacion  VARCHAR(10)  NOT NULL CHECK (tipo_identificacion IN ('CF', 'CJ', 'DIMEX', 'NITE')),
        identificacion       VARCHAR(20)  NOT NULL,
        actividad_economica  VARCHAR(10),
        regimen              VARCHAR(40),
        telefono             VARCHAR(30),
        correo               VARCHAR(160),
        provincia            VARCHAR(40),
        canton               VARCHAR(60),
        distrito             VARCHAR(60),
        barrio               VARCHAR(80),
        otras_senas          TEXT,
        logo_url             TEXT,
        decimales            SMALLINT     NOT NULL DEFAULT 0 CHECK (decimales BETWEEN 0 AND 5),
        actualizado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('📋 Creando tabla impuesto...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS impuesto (
        id                      SERIAL       PRIMARY KEY,
        nombre                  VARCHAR(80)  NOT NULL,
        tarifa                  NUMERIC(5,2) NOT NULL CHECK (tarifa >= 0 AND tarifa <= 100),
        tipo                    VARCHAR(20)  NOT NULL CHECK (tipo IN ('general', 'reducido', 'transitorio', 'exento', 'sin_credito', 'bienes_usados')),
        codigo_tarifa_hacienda  VARCHAR(4),
        activo                  BOOLEAN      NOT NULL DEFAULT TRUE,
        alegra_id               VARCHAR(20)  UNIQUE,
        creado_en               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('📋 Creando tabla metodo_pago...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS metodo_pago (
        id                          SERIAL      PRIMARY KEY,
        clave                       VARCHAR(30) NOT NULL UNIQUE,
        nombre                      VARCHAR(60) NOT NULL,
        pide_referencia             BOOLEAN     NOT NULL DEFAULT FALSE,
        codigo_medio_pago_hacienda  VARCHAR(4),
        alegra_clave                VARCHAR(30),
        orden                       SMALLINT    NOT NULL DEFAULT 0,
        activo                      BOOLEAN     NOT NULL DEFAULT TRUE
      )
    `);
    console.log('📋 Creando tabla plazo_credito...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS plazo_credito (
        id         SERIAL      PRIMARY KEY,
        nombre     VARCHAR(40) NOT NULL,
        dias       SMALLINT    NOT NULL UNIQUE CHECK (dias >= 0),
        activo     BOOLEAN     NOT NULL DEFAULT TRUE,
        alegra_id  VARCHAR(20) UNIQUE
      )
    `);
    console.log('📋 Creando tabla cuenta_dinero...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cuenta_dinero (
        id             SERIAL        PRIMARY KEY,
        nombre         VARCHAR(80)   NOT NULL,
        tipo           VARCHAR(20)   NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'tarjeta_credito')),
        numero         VARCHAR(60),
        descripcion    TEXT,
        saldo_inicial  NUMERIC(14,2) NOT NULL DEFAULT 0,
        activo         BOOLEAN       NOT NULL DEFAULT TRUE,
        alegra_id      VARCHAR(20)   UNIQUE,
        creado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('📋 Creando tabla serie_consecutivo...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS serie_consecutivo (
        id              SERIAL      PRIMARY KEY,
        tipo_documento  VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('factura', 'tiquete', 'nota_credito', 'nota_debito', 'cotizacion', 'recibo')),
        sucursal        CHAR(3)     NOT NULL DEFAULT '001' CHECK (sucursal ~ '^[0-9]{3}$'),
        terminal        CHAR(5)     NOT NULL CHECK (terminal ~ '^[0-9]{5}$'),
        siguiente       BIGINT      NOT NULL DEFAULT 1 CHECK (siguiente > 0),
        activo          BOOLEAN     NOT NULL DEFAULT TRUE,
        UNIQUE (tipo_documento, sucursal, terminal)
      )
    `);

    console.log('📋 Creando función para updated_at...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
         NEW.updated_at = CURRENT_TIMESTAMP;
         RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Crear triggers para updated_at
    console.log('📋 Creando triggers para updated_at...');
    await client.query(`
      CREATE TRIGGER update_faltantes_updated_at 
        BEFORE UPDATE ON faltantes 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_faltantes_ajustes_updated_at 
        BEFORE UPDATE ON faltantes_ajustes 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_facturas_pendientes_updated_at
        BEFORE UPDATE ON facturas_pendientes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_orden_compra_temporal_updated_at 
        BEFORE UPDATE ON orden_compra_temporal 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await client.query(`
      CREATE TRIGGER update_rotacion_productos_updated_at
        BEFORE UPDATE ON rotacion_productos
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await client.query(`
      CREATE TRIGGER update_cuentas_por_pagar_updated_at 
        BEFORE UPDATE ON cuentas_por_pagar 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Crear índices
    console.log('📋 Creando índices...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_semana_mes_ano ON facturas(semana, mes, ano)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(numero_factura)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_nombre)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_factura ON faltantes(factura_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_producto ON faltantes(producto_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_ajustes_faltante ON faltantes_ajustes(faltante_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orden_compra_proveedor ON orden_compra_temporal(proveedor_nombre)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orden_compra_producto ON orden_compra_temporal(producto_codigo)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_pendientes_factura ON facturas_pendientes(factura_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_pendientes_alegra ON facturas_pendientes(alegra_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rotacion_productos_producto ON rotacion_productos(producto_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rotacion_productos_semana ON rotacion_productos(ano, semana)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_proveedor ON cuentas_por_pagar(proveedor_cedula)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_estado ON cuentas_por_pagar(estado)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_vencimiento ON cuentas_por_pagar(fecha_vencimiento)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_cliente ON cuentas_por_cobrar(cliente_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_vencimiento ON cuentas_por_cobrar(fecha_vencimiento)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_saldo ON cuentas_por_cobrar(saldo)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_abonos_cobro_factura ON abonos_cobro(alegra_invoice_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_abonos_cobro_cliente ON abonos_cobro(cliente_id)
    `);

    // Insertar datos de ejemplo
    console.log('📋 Insertando datos de ejemplo...');

    // Proveedores de ejemplo
    await client.query(`
      INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES
      ('Proveedor A', 'Juan Pérez', '555-0001', 'juan@proveedora.com'),
      ('Proveedor B', 'María González', '555-0002', 'maria@proveedorb.com'),
      ('Proveedor C', 'Carlos Rodríguez', '555-0003', 'carlos@proveedorc.com')
    `);

    // Productos de ejemplo
    await client.query(`
      INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario) VALUES
      ('Producto 1', 'P001', 'Descripción del producto 1', 1, 10.50),
      ('Producto 2', 'P002', 'Descripción del producto 2', 1, 15.75),
      ('Producto 3', 'P003', 'Descripción del producto 3', 2, 8.25),
      ('Producto 4', 'P004', 'Descripción del producto 4', 2, 12.00),
      ('Producto 5', 'P005', 'Descripción del producto 5', 3, 20.00)
    `);

    console.log('✅ Datos de ejemplo insertados');

    // Verificar que todo esté bien
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Tablas creadas:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('🎉 ¡Base de datos reiniciada y configurada exitosamente!');

  } catch (error) {
    console.error('❌ Error configurando la base de datos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar el setup
setupDatabase()
  .then(() => {
    console.log('✅ Setup completado - BD completamente limpia');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en setup:', error);
    process.exit(1);
  });