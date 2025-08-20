// js/precios.js - Revisión de precios para facturas 100% relacionadas
// Sistema de Facturas CR - Análisis de precios y costos OPTIMIZADO

let facturasCompletas = [];
let facturasFiltradas = [];
let proveedoresUnicos = [];
let facturaSeleccionada = null;
let productosRevision = [];
let filtroProductosActual = 'todos';

/**
 * INICIALIZACIÓN
 */
document.addEventListener('DOMContentLoaded', function () {
    console.log('💰 Iniciando revisión de precios optimizada...');

    const facturaId = obtenerParametroURL('id');

    if (facturaId) {
        // Cargar factura específica directamente en vista de revisión
        cargarFacturaEspecifica(facturaId);
    } else {
        // Cargar todas las facturas completas en vista lista
        cargarFacturasCompletas();
    }
});

/**
 * 🚀 OPTIMIZADO: Obtener datos de productos usando batch API
 */
async function obtenerDatosProductosBatch(productos) {
    try {
        // Extraer todos los alegraIds únicos
        const alegraIds = productos
            .map(p => p.alegraItemId || p.mapeo?.alegraItemId)
            .filter(Boolean)
            .filter((id, index, array) => array.indexOf(id) === index); // Únicos

        if (alegraIds.length === 0) {
            console.warn('⚠️ No hay productos con alegraId para analizar');
            return {};
        }

        console.log(`🚀 Obteniendo datos para ${alegraIds.length} productos en batch...`);

        // Llamar al endpoint batch
        const response = await fetch('http://localhost:3000/api/productos-alegra/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                alegraIds: alegraIds
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error obteniendo productos en batch');
        }

        console.log(`✅ Datos obtenidos en batch: ${data.total}/${data.solicitados} productos`);

        return data.productos;

    } catch (error) {
        console.error('❌ Error obteniendo datos en batch:', error);
        return {};
    }
}

/**
 * 🚀 OPTIMIZADO: Analizar producto usando datos pre-cargados
 */
function analizarProductoConDatos(producto, datosProducto = null) {
    let alertas = [];
    let tieneAlerta = false;

    try {
        // ✅ 1. Calcular costo actual desde IMAP (factura del proveedor)
        const costoActual = calcularCostoConIVA(producto);

        // ✅ 2. Usar datos pre-cargados o valores por defecto
        let costoAnterior = 0;
        let precioVentaActual = producto.precioUnitario * 1.25; // Fallback
        let nombreAlegra = producto.descripcion; // Fallback

        if (datosProducto) {
            costoAnterior = datosProducto.cost || 0;
            precioVentaActual = datosProducto.price || (producto.precioUnitario * 1.25);
            nombreAlegra = datosProducto.name || producto.descripcion;
        }

        // ✅ 3. Calcular margen: (precio_venta - costo_imap) / precio_venta
        const margen = precioVentaActual > 0 ?
            ((precioVentaActual - costoActual.costoConIVA) / precioVentaActual) * 100 : 0;

        // Alertas de cambio de costo
        if (costoAnterior > 0 && costoActual.costoConIVA > costoAnterior * 1.3) {
            const incremento = Math.round(((costoActual.costoConIVA - costoAnterior) / costoAnterior) * 100);
            alertas.push({
                tipo: 'precio-alto',
                icono: '📈',
                mensaje: `Costo ${incremento}% más alto`
            });
            tieneAlerta = true;
        }

        // Alertas de margen
        if (margen < 20) {
            alertas.push({
                tipo: 'margen-bajo',
                icono: '⚠️',
                mensaje: `Margen bajo: ${Math.round(margen)}%`
            });
            tieneAlerta = true;
        }

        // Determinar color del margen
        let margenColor = '#27ae60'; // Verde
        if (margen < 15) margenColor = '#e74c3c'; // Rojo
        else if (margen < 25) margenColor = '#f39c12'; // Naranja

        return {
            alertas,
            tieneAlerta,
            costoAnteriorConIVA: costoAnterior,
            costoNuevoConIVA: costoActual.costoConIVA,
            precioVentaActual: precioVentaActual,
            nombreAlegra: nombreAlegra,
            margenPorcentaje: Math.round(margen),
            margenColor: margenColor,
            margenTexto: margen < 15 ? 'Muy bajo' : margen < 25 ? 'Aceptable' : 'Bueno',
            impuestoPorcentaje: costoActual.impuestoPorcentaje
        };

    } catch (error) {
        console.error('❌ Error analizando producto:', producto.id, error);

        // Retornar análisis básico en caso de error
        return {
            alertas: [{
                tipo: 'error',
                icono: '❌',
                mensaje: 'Error obteniendo datos'
            }],
            tieneAlerta: true,
            costoAnteriorConIVA: 0,
            costoNuevoConIVA: calcularCostoConIVA(producto).costoConIVA,
            precioVentaActual: producto.precioUnitario * 1.25,
            nombreAlegra: producto.descripcion,
            margenPorcentaje: 0,
            margenColor: '#e74c3c',
            margenTexto: 'Error',
            impuestoPorcentaje: 0
        };
    }
}

/**
 * CARGAR FACTURAS COMPLETAS (100% relacionadas)
 */
async function cargarFacturasCompletas() {
    try {
        console.log('📊 Cargando facturas completas para análisis...');

        mostrarCargando('#listaFacturasPrecios');
        mostrarCargando('#estadisticasPrecios');

        // Obtener facturas relacionadas
        const response = await fetch('/api/facturas/RELACIONADA');
        const data = await response.json();

        if (data.success) {
            // Filtrar solo facturas 100% relacionadas
            facturasCompletas = data.facturas.filter(factura => {
                const total = factura.productos?.length || 0;
                const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO')?.length || 0;
                return total > 0 && relacionados === total;
            });

            facturasFiltradas = [...facturasCompletas];

            // Extraer proveedores únicos para filtros
            proveedoresUnicos = [...new Set(facturasCompletas.map(f => f.proveedorNombre))].sort();

            mostrarResumenAnalisis();
            llenarFiltroProveedores();
            await mostrarFacturasCompletas();

            console.log(`✅ ${facturasCompletas.length} facturas completas cargadas`);

        } else {
            throw new Error(data.error || 'Error cargando facturas');
        }

    } catch (error) {
        console.error('❌ Error cargando facturas completas:', error);
        mostrarError('Error cargando facturas para análisis de precios');
    }
}

/**
 * CARGAR FACTURA ESPECÍFICA
 */
async function cargarFacturaEspecifica(facturaId) {
    try {
        console.log(`💰 Cargando análisis de factura específica: ${facturaId}`);

        mostrarCargando('#listaProductosRevision');
        mostrarCargando('#infoFacturaRevision');

        // Primero intentar buscar en facturas RELACIONADA
        let response = await fetch('/api/facturas/RELACIONADA');
        let data = await response.json();
        let factura = null;

        if (data.success) {
            factura = data.facturas.find(f => f.id === facturaId);
        }

        // Si no se encuentra, buscar en facturas PROCESADA
        if (!factura) {
            console.log('📄 No encontrada en RELACIONADA, buscando en PROCESADA...');
            response = await fetch('/api/facturas/PROCESADA');
            data = await response.json();

            if (data.success) {
                factura = data.facturas.find(f => f.id === facturaId);

                // Verificar si está 100% relacionada
                if (factura) {
                    const total = factura.productos?.length || 0;
                    const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO')?.length || 0;
                    const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0;

                    if (porcentaje !== 100) {
                        throw new Error(`Esta factura no está 100% relacionada (${porcentaje}% completado). Completa el relacionado primero.`);
                    }

                    // Si está 100% relacionada pero en estado PROCESADA, actualizar estado
                    console.log('🔄 Factura 100% relacionada pero en estado PROCESADA, actualizando...');
                    await actualizarEstadoFactura(facturaId);
                }
            }
        }

        if (!factura) {
            throw new Error('Factura no encontrada o no está lista para análisis de precios');
        }

        // Verificar que la factura esté 100% relacionada
        const total = factura.productos?.length || 0;
        const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO')?.length || 0;
        const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0;

        if (porcentaje !== 100) {
            throw new Error(`Esta factura no está completamente relacionada (${porcentaje}% completado). Termina de relacionar todos los productos primero.`);
        }

        facturasCompletas = [factura];
        facturasFiltradas = [factura];
        facturaSeleccionada = factura;
        productosRevision = factura.productos.map(p => ({ ...p, estadoRevision: 'PENDIENTE' }));

        console.log(`✅ Factura cargada para análisis: ${factura.numeroConsecutivo} (${total} productos, 100% relacionados)`);

        // Mostrar vista de revisión individual
        mostrarVistaRevisionIndividual();
        await mostrarInfoFacturaRevision();
        mostrarProductosRevision();
        actualizarProgresoRevision();

    } catch (error) {
        console.error('❌ Error cargando factura específica:', error);
        mostrarError('Error cargando la factura para análisis: ' + error.message);
    }
}

/**
 * MOSTRAR VISTA REVISIÓN INDIVIDUAL
 */
function mostrarVistaRevisionIndividual() {
    document.getElementById('vistaListaFacturas').style.display = 'none';
    document.getElementById('vistaRevisionIndividual').style.display = 'block';
}

/**
 * VOLVER A LISTA DE FACTURAS
 */
function volverAListaFacturas() {
    document.getElementById('vistaListaFacturas').style.display = 'block';
    document.getElementById('vistaRevisionIndividual').style.display = 'none';
    facturaSeleccionada = null;
    productosRevision = [];
}

/**
 * MOSTRAR INFORMACIÓN DE FACTURA EN REVISIÓN
 */
async function mostrarInfoFacturaRevision() {
    const container = document.getElementById('infoFacturaRevision');
    if (!facturaSeleccionada) return;
    
    // ✅ CORREGIDO: Usar la función optimizada con datos batch
    const todosLosProductos = facturaSeleccionada.productos.map(producto => ({
        ...producto,
        alegraId: producto.alegraItemId || producto.mapeo?.alegraItemId
    })).filter(p => p.alegraId);
    
    // Obtener datos en batch para esta factura
    const datosProductos = await obtenerDatosProductosBatch(todosLosProductos);
    
    // Analizar con datos pre-cargados
    const analisis = analizarFacturaConDatos(facturaSeleccionada, datosProductos);

    container.innerHTML = `
        <div class="card-header">
            <h2>📄 Factura #${facturaSeleccionada.numeroConsecutivo}</h2>
            <div class="factura-estado ${facturaSeleccionada.estado.toLowerCase()}">
                ${facturaSeleccionada.estado}
            </div>
        </div>
        
        <div class="factura-info-grid">
            <div class="factura-info-group">
                <h3>📋 Información General</h3>
                <div class="info-item">
                    <span class="label">Proveedor:</span>
                    <span class="value">${facturaSeleccionada.proveedorNombre}</span>
                </div>
                <div class="info-item">
                    <span class="label">Fecha Emisión:</span>
                    <span class="value">${formatearFecha(facturaSeleccionada.fechaEmision)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Condición de Venta:</span>
                    <span class="value">${facturaSeleccionada.condicionVenta || 'No especificado'}</span>
                </div>
            </div>
            
            <div class="factura-info-group">
                <h3>💰 Totales</h3>
                <div class="info-item">
                    <span class="label">Subtotal:</span>
                    <span class="value">₡${formatearNumero(facturaSeleccionada.subTotal)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Impuestos:</span>
                    <span class="value">₡${formatearNumero(facturaSeleccionada.totalImpuestos)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Total Factura:</span>
                    <span class="value">₡${formatearNumero(facturaSeleccionada.totalFactura)}</span>
                </div>
            </div>
            
            <div class="factura-info-group">
                <h3>📦 Productos</h3>
                <div class="info-item">
                    <span class="label">Total Productos:</span>
                    <span class="value">${facturaSeleccionada.productos.length}</span>
                </div>
                <div class="info-item">
                    <span class="label">Alertas:</span>
                    <span class="value ${analisis.tieneAlertas ? 'text-warning' : ''}">
                        ${analisis.alertas.length} detectadas
                    </span>
                </div>
            </div>
        </div>
    `;
}

/**
 * MOSTRAR RESUMEN DE ANÁLISIS
 */
function mostrarResumenAnalisis() {
    const container = document.getElementById('estadisticasPrecios');

    // Calcular estadísticas
    const totalFacturas = facturasFiltradas.length;
    const totalMonto = facturasFiltradas.reduce((sum, f) => sum + f.totalFactura, 0);
    const totalProductos = facturasFiltradas.reduce((sum, f) => sum + f.productos.length, 0);

    // Detectar alertas
    const alertas = detectarAlertas(facturasFiltradas);

    const html = `
        <div class="stat-card">
            <div class="stat-icon">📋</div>
            <div class="stat-content">
                <h3>Facturas Completas</h3>
                <div class="stat-number">${totalFacturas}</div>
                <div class="stat-detail">100% relacionadas</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">💰</div>
            <div class="stat-content">
                <h3>Monto Total</h3>
                <div class="stat-number">₡${formatearNumero(totalMonto)}</div>
                <div class="stat-detail">En facturas analizadas</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">📦</div>
            <div class="stat-content">
                <h3>Productos</h3>
                <div class="stat-number">${totalProductos}</div>
                <div class="stat-detail">Todos relacionados</div>
            </div>
        </div>
        
        <div class="stat-card ${alertas.total > 0 ? 'stat-warning' : ''}">
            <div class="stat-icon">${alertas.total > 0 ? '⚠️' : '✅'}</div>
            <div class="stat-content">
                <h3>Alertas</h3>
                <div class="stat-number">${alertas.total}</div>
                <div class="stat-detail">${alertas.total > 0 ? 'Requieren atención' : 'Todo en orden'}</div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * DETECTAR ALERTAS DE PRECIOS
 */
function detectarAlertas(facturas) {
    let alertas = {
        precio_alto: 0,
        precio_bajo: 0,
        margen_bajo: 0,
        sin_costo: 0,
        total: 0
    };

    facturas.forEach(factura => {
        factura.productos.forEach(producto => {
            // Simular detección de alertas (necesitarías datos reales de Alegra)
            const precioFactura = producto.precioUnitario;
            const precioAlegra = Math.random() * precioFactura * 2; // Simulado

            // Precio muy alto comparado con último precio
            if (precioFactura > precioAlegra * 1.5) {
                alertas.precio_alto++;
            }

            // Precio muy bajo
            if (precioFactura < precioAlegra * 0.5) {
                alertas.precio_bajo++;
            }

            // Sin costo registrado (simulado)
            if (Math.random() < 0.1) {
                alertas.sin_costo++;
            }
        });
    });

    alertas.total = alertas.precio_alto + alertas.precio_bajo + alertas.margen_bajo + alertas.sin_costo;

    return alertas;
}

/**
 * LLENAR FILTRO DE PROVEEDORES
 */
function llenarFiltroProveedores() {
    const select = document.getElementById('filtroProveedorPrecios');

    const opciones = proveedoresUnicos.map(proveedor =>
        `<option value="${proveedor}">${proveedor}</option>`
    ).join('');

    select.innerHTML = `<option value="">Todos los proveedores</option>${opciones}`;
}

/**
 * MOSTRAR FACTURAS COMPLETAS
 */
async function mostrarFacturasCompletas() {
    const container = document.getElementById('listaFacturasPrecios');
    const contador = document.getElementById('contadorFacturasPrecios');

    if (facturasFiltradas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay facturas completas</h3>
                <p>Las facturas 100% relacionadas aparecerán aquí para análisis de precios.</p>
                <a href="facturas.html" class="btn">Ver Facturas Pendientes</a>
            </div>
        `;
        contador.textContent = 'No se encontraron facturas';
        return;
    }

    contador.textContent = `${facturasFiltradas.length} factura${facturasFiltradas.length === 1 ? '' : 's'} lista${facturasFiltradas.length === 1 ? '' : 's'} para revisión`;

    // Mostrar indicador de carga optimizado
    container.innerHTML = `
        <div class="loading-optimized" style="text-align: center; padding: 2rem;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <p style="color: #3498db; font-weight: bold;">🚀 Analizando ${facturasFiltradas.length} facturas (modo ultra-rápido)...</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Una sola llamada API para todo...</p>
        </div>
    `;

    const template = document.getElementById('templateFacturaRevision').innerHTML;

    try {
        console.log(`🚀 ANÁLISIS ULTRA-OPTIMIZADO: ${facturasFiltradas.length} facturas...`);
        const startTime = Date.now();

        // ✅ 1. EXTRAER TODOS los alegraIds de TODAS las facturas de una vez
        const todosLosProductos = [];
        facturasFiltradas.forEach(factura => {
            factura.productos.forEach(producto => {
                const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
                if (alegraId) {
                    todosLosProductos.push({ ...producto, alegraId, facturaId: factura.id });
                }
            });
        });

        console.log(`📦 Obteniendo datos para ${todosLosProductos.length} productos en UNA sola llamada...`);

        // ✅ 2. UNA SOLA llamada batch para TODOS los productos de TODAS las facturas
        const datosProductos = await obtenerDatosProductosBatch(todosLosProductos);

        // ✅ 3. Analizar TODAS las facturas síncronamente (sin await)
        const facturasConAnalisis = facturasFiltradas.map(factura => {
            // Analizar factura usando datos pre-cargados
            const analisis = analizarFacturaConDatos(factura, datosProductos);
            return { factura, analisis };
        });

        const endTime = Date.now();
        console.log(`⚡ ${facturasConAnalisis.length} facturas analizadas en ${endTime - startTime}ms (ultra-optimizado)`);

        // ✅ 4. Generar HTML de una vez
        const html = facturasConAnalisis.map(({ factura, analisis }) => {
            const productosAprobados = 0;
            const productosPendientes = factura.productos.length;

            // Generar alertas HTML
            let alertasHTML = '';
            if (analisis.alertas && analisis.alertas.length > 0) {
                alertasHTML = analisis.alertas.slice(0, 2).map(alerta => `
                    <div class="alerta-item ${alerta.tipo}">
                        ${alerta.icono} ${alerta.mensaje}
                    </div>
                `).join('');

                if (analisis.alertas.length > 2) {
                    alertasHTML += `<div class="alerta-item mas-alertas">+${analisis.alertas.length - 2} más</div>`;
                }
            }

            let estadoTexto = 'PENDIENTE';
            let estadoClass = 'pendiente';

            return template
                .replace(/{facturaId}/g, factura.id)
                .replace('{numeroConsecutivo}', factura.numeroConsecutivo)
                .replace('{fechaEmision}', formatearFecha(factura.fechaEmision))
                .replace('{estadoClass}', estadoClass)
                .replace('{estadoTexto}', estadoTexto)
                .replace('{proveedorNombre}', factura.proveedorNombre)
                .replace('{totalFactura}', formatearNumero(factura.totalFactura))
                .replace('{totalProductos}', factura.productos.length)
                .replace('{productosAprobados}', productosAprobados)
                .replace('{productosPendientes}', productosPendientes)
                .replace('{alertasHTML}', alertasHTML);
        }).join('');

        container.innerHTML = html;

        // Mostrar notificación de éxito con tiempo real
        mostrarNotificacion(`⚡ ${facturasConAnalisis.length} facturas analizadas en ${endTime - startTime}ms (ultra-optimizado)`, 'success');

    } catch (error) {
        console.error('❌ Error en análisis ultra-optimizado:', error);
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error</h3>
                <p>Error cargando análisis: ${error.message}</p>
                <button onclick="mostrarFacturasCompletas()" class="btn" style="margin-top: 1rem;">🔄 Reintentar</button>
            </div>
        `;
        mostrarNotificacion('❌ Error en análisis ultra-optimizado', 'error');
    }
}

/**
 * ⚡ NUEVO: Analizar factura usando datos pre-cargados (SIN API calls)
 */
function analizarFacturaConDatos(factura, datosProductos = {}) {
    let alertas = [];
    let tieneAlertas = false;

    factura.productos.forEach(producto => {
        const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
        const datosProducto = alegraId ? datosProductos[alegraId] : null;

        const analisisProducto = analizarProductoConDatos(producto, datosProducto);
        alertas.push(...analisisProducto.alertas);
        if (analisisProducto.tieneAlerta) tieneAlertas = true;
    });

    return {
        alertas,
        tieneAlertas
    };
}




/**
 * FILTRAR FACTURAS
 */
async function filtrarFacturasPrecios() {
    const proveedorFiltro = document.getElementById('filtroProveedorPrecios').value;
    const estadoFiltro = document.getElementById('filtroEstadoRevision').value;
    const busqueda = document.getElementById('buscarFacturaPrecios').value.toLowerCase();

    console.log(`🔍 Filtrando: Proveedor="${proveedorFiltro}", Estado="${estadoFiltro}", Busqueda="${busqueda}"`);

    facturasFiltradas = facturasCompletas.filter(factura => {
        // Filtro por proveedor
        const coincideProveedor = !proveedorFiltro || factura.proveedorNombre === proveedorFiltro;

        // Filtro por estado (simulado)
        let coincideEstado = true;
        if (estadoFiltro !== 'TODAS') {
            const estadoFactura = 'PENDIENTE'; // Simulado - deberías tener este dato real
            coincideEstado = estadoFiltro === estadoFactura;
        }

        // Filtro por búsqueda
        const coincideBusqueda = !busqueda ||
            factura.numeroConsecutivo.toLowerCase().includes(busqueda) ||
            factura.proveedorNombre.toLowerCase().includes(busqueda);

        return coincideProveedor && coincideEstado && coincideBusqueda;
    });

    mostrarResumenAnalisis();
    await mostrarFacturasCompletas();
}

/**
 * LIMPIAR FILTROS
 */
function limpiarFiltrosPrecios() {
    document.getElementById('filtroProveedorPrecios').value = '';
    document.getElementById('filtroEstadoRevision').value = 'PENDIENTE';
    document.getElementById('buscarFacturaPrecios').value = '';

    filtrarFacturasPrecios();
}

/**
 * ABRIR REVISIÓN DE FACTURA
 */
function abrirRevisionFactura(facturaId) {
    const factura = facturasCompletas.find(f => f.id === facturaId);
    if (!factura) return;

    facturaSeleccionada = factura;
    productosRevision = factura.productos.map(p => ({ ...p, estadoRevision: 'PENDIENTE' }));

    mostrarVistaRevisionIndividual();
    async function abrirRevisionFactura(facturaId) {
        const factura = facturasCompletas.find(f => f.id === facturaId);
        if (!factura) return;

        facturaSeleccionada = factura;
        productosRevision = factura.productos.map(p => ({ ...p, estadoRevision: 'PENDIENTE' }));

        mostrarVistaRevisionIndividual();
        await mostrarInfoFacturaRevision();
        mostrarProductosRevision();
        actualizarProgresoRevision();
    }

    mostrarProductosRevision();
    actualizarProgresoRevision();
}

/**
 * MOSTRAR PRODUCTOS EN REVISIÓN
 */
async function mostrarProductosRevision() {
    const container = document.getElementById('listaProductosRevision');
    const template = document.getElementById('templateProductoRevision').innerHTML;

    // Mostrar indicador de carga optimizado
    container.innerHTML = `
        <div class="loading-optimized" style="text-align: center; padding: 2rem;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <p style="color: #3498db; font-weight: bold;">⚡ Cargando en modo ultra-rápido...</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Una sola llamada API para todos los productos</p>
        </div>
    `;

    try {
        // Filtrar productos según el filtro actual
        let productosMostrar = [...productosRevision];

        if (filtroProductosActual === 'pendientes') {
            productosMostrar = productosMostrar.filter(p => p.estadoRevision === 'PENDIENTE');
        } else if (filtroProductosActual === 'aprobados') {
            productosMostrar = productosMostrar.filter(p => p.estadoRevision === 'APROBADO');
        } else if (filtroProductosActual === 'rechazados') {
            productosMostrar = productosMostrar.filter(p => p.estadoRevision === 'RECHAZADO');
        }

        // Actualizar contadores
        document.getElementById('countTodos').textContent = productosRevision.length;
        document.getElementById('countPendientes').textContent = productosRevision.filter(p => p.estadoRevision === 'PENDIENTE').length;
        document.getElementById('countAprobados').textContent = productosRevision.filter(p => p.estadoRevision === 'APROBADO').length;
        document.getElementById('countRechazados').textContent = productosRevision.filter(p => p.estadoRevision === 'RECHAZADO').length;

        if (productosMostrar.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h3>No hay productos</h3>
                    <p>No se encontraron productos con el filtro actual.</p>
                </div>
            `;
            return;
        }

        console.log(`⚡ ANÁLISIS ULTRA-RÁPIDO: ${productosMostrar.length} productos...`);
        const startTime = Date.now();

        // ✅ 1. UNA SOLA llamada batch para TODOS los productos
        const datosProductos = await obtenerDatosProductosBatch(productosMostrar);

        // ✅ 2. Analizar TODOS los productos síncronamente (sin await, súper rápido)
        const productosConAnalisis = productosMostrar.map(producto => {
            const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
            const datosProducto = alegraId ? datosProductos[alegraId] : null;

            const analisis = analizarProductoConDatos(producto, datosProducto);
            return { producto, analisis };
        });

        const endTime = Date.now();
        console.log(`⚡ ${productosConAnalisis.length} productos analizados en ${endTime - startTime}ms (ultra-rápido)`);

        // ✅ 3. Generar HTML de una vez
        const html = productosConAnalisis.map(({ producto, analisis }) => {
            const estadoRevision = producto.estadoRevision || 'PENDIENTE';

            // Determinar estado y clase
            let estadoTexto, estadoClass;
            switch (estadoRevision) {
                case 'APROBADO':
                    estadoTexto = 'APROBADO';
                    estadoClass = 'aprobado';
                    break;
                case 'RECHAZADO':
                    estadoTexto = 'RECHAZADO';
                    estadoClass = 'rechazado';
                    break;
                default:
                    estadoTexto = 'PENDIENTE';
                    estadoClass = 'pendiente';
            }

            // Reemplazar marcadores en el template
            return template
                .replace(/{productoId}/g, producto.id)
                .replace('{descripcion}', analisis.nombreAlegra || producto.descripcion)
                .replace('{estadoClass}', estadoClass)
                .replace('{estadoTexto}', estadoTexto)
                .replace('{costoAnteriorConIVA}', formatearNumero(analisis.costoAnteriorConIVA))
                .replace('{costoNuevoConIVA}', formatearNumero(analisis.costoNuevoConIVA))
                .replace('{precioVentaActual}', formatearNumero(analisis.precioVentaActual))
                .replace(/{precioVentaActual}/g, analisis.precioVentaActual)
                .replace('{margenPorcentaje}', analisis.margenPorcentaje)
                .replace('{margenColorClass}', analisis.margenPorcentaje < 15 ? 'text-danger' : analisis.margenPorcentaje < 25 ? 'text-warning' : 'text-success')
                .replace('{margenTexto}', analisis.margenTexto)
                .replace('{approveDisabled}', estadoRevision !== 'PENDIENTE' ? 'disabled' : '')
                .replace('{rejectDisabled}', estadoRevision !== 'PENDIENTE' ? 'disabled' : '');
        }).join('');

        container.innerHTML = html;

        // Mostrar/ocultar acciones finales si todos están revisados
        const pendientes = productosRevision.filter(p => p.estadoRevision === 'PENDIENTE').length;
        document.getElementById('accionesFinalesRevision').style.display = pendientes === 0 ? 'block' : 'none';

        // Mostrar notificación de éxito con tiempo real
        mostrarNotificacion(`⚡ ${productosConAnalisis.length} productos analizados en ${endTime - startTime}ms (ultra-rápido)`, 'success');

    } catch (error) {
        console.error('❌ Error en análisis ultra-rápido:', error);
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error</h3>
                <p>Error en análisis: ${error.message}</p>
                <button onclick="mostrarProductosRevision()" class="btn" style="margin-top: 1rem;">🔄 Reintentar</button>
            </div>
        `;
        mostrarNotificacion('❌ Error en análisis ultra-rápido', 'error');
    }
}

/**
 * FILTRAR PRODUCTOS EN REVISIÓN
 */
function filtrarProductosRevision(filtro) {
    filtroProductosActual = filtro;

    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === filtro) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    mostrarProductosRevision();
}

/**
 * ACTUALIZAR PROGRESO DE REVISIÓN
 */
function actualizarProgresoRevision() {
    if (!facturaSeleccionada || !productosRevision.length) return;

    const total = productosRevision.length;
    const aprobados = productosRevision.filter(p => p.estadoRevision === 'APROBADO').length;
    const rechazados = productosRevision.filter(p => p.estadoRevision === 'RECHAZADO').length;
    const revisados = aprobados + rechazados;
    const porcentaje = Math.round((revisados / total) * 100);

    // Actualizar barra de progreso
    document.getElementById('progressRevision').style.width = `${porcentaje}%`;
    document.getElementById('progressTextRevision').textContent = `${porcentaje}% revisado`;

    // Actualizar estadísticas
    document.getElementById('progressStatsRevision').innerHTML = `
        <div class="progress-stat">
            <span class="stat-label">Total:</span>
            <span class="stat-value">${total}</span>
        </div>
        <div class="progress-stat">
            <span class="stat-label">Aprobados:</span>
            <span class="stat-value success">${aprobados}</span>
        </div>
        <div class="progress-stat">
            <span class="stat-label">Rechazados:</span>
            <span class="stat-value danger">${rechazados}</span>
        </div>
        <div class="progress-stat">
            <span class="stat-label">Pendientes:</span>
            <span class="stat-value warning">${total - revisados}</span>
        </div>
    `;
}

/**
 * APROBAR PRODUCTO
 */
function aprobarProducto(productoId) {
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    producto.estadoRevision = 'APROBADO';

    // Actualizar vista
    mostrarProductosRevision();
    actualizarProgresoRevision();

    mostrarNotificacion('✅ Producto aprobado', 'success');
}

/**
 * RECHAZAR PRODUCTO
 */
function rechazarProducto(productoId) {
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    producto.estadoRevision = 'RECHAZADO';

    // Actualizar vista
    mostrarProductosRevision();
    actualizarProgresoRevision();

    mostrarNotificacion('❌ Producto rechazado', 'error');
}

/**
 * VER DETALLES DE COMPARACIÓN
 */
async function verDetallesComparacion(productoId) {
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    // ✅ CORREGIDO: Usar la función optimizada
    const datosProductos = await obtenerDatosProductosBatch([producto]);
    const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
    const datosProducto = alegraId ? datosProductos[alegraId] : null;
    
    const analisis = analizarProductoConDatos(producto, datosProducto);

    // Simular datos históricos para la comparación
    const precioAnterior = datosProducto?.cost ? datosProducto.cost * 1.2 : producto.precioUnitario * 0.9;

    document.getElementById('contenidoComparacionProducto').innerHTML = `
        <div class="comparacion-producto">
            <h3 data-producto-id="${producto.id}">${producto.descripcion}</h3>
            
            <div class="comparacion-grid">
                <div class="comparacion-col">
                    <h4>📊 Información Actual</h4>
                    <div class="comparacion-item">
                        <span class="label">Precio Factura:</span>
                        <span class="value">₡${formatearNumero(producto.precioUnitario)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Costo Estimado:</span>
                        <span class="value">₡${formatearNumero(analisis.costoNuevoConIVA)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Margen Actual:</span>
                        <span class="value ${analisis.margenPorcentaje < 20 ? 'text-warning' : ''}">
                            ${analisis.margenPorcentaje}%
                        </span>
                    </div>
                </div>
                
                <div class="comparacion-col">
                    <h4>📈 Histórico</h4>
                    <div class="comparacion-item">
                        <span class="label">Último Precio:</span>
                        <span class="value">₡${formatearNumero(precioAnterior)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Diferencia:</span>
                        <span class="value ${producto.precioUnitario > precioAnterior ? 'text-danger' : 'text-success'}">
                            ${Math.round(((producto.precioUnitario - precioAnterior) / precioAnterior * 100))}%
                        </span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Última Compra:</span>
                        <span class="value">${formatearFecha(new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000))}</span>
                    </div>
                </div>
                
                <div class="comparacion-col">
                    <h4>📌 Sugerencias</h4>
                    <div class="sugerencia-item">
                        <span class="label">Margen Objetivo:</span>
                        <span class="value">25%</span>
                    </div>
                    <div class="sugerencia-item">
                        <span class="label">Precio Sugerido:</span>
                        <span class="value">₡${formatearNumero(analisis.costoNuevoConIVA * 1.25)}</span>
                    </div>
                </div>
            </div>
            
            ${analisis.alertas.length > 0 ? `
                <div class="alertas-comparacion">
                    <h4>⚠️ Alertas Detectadas</h4>
                    ${analisis.alertas.map(alerta => `
                        <div class="alerta-item ${alerta.tipo}">
                            ${alerta.icono} ${alerta.mensaje}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modalComparacionProducto').style.display = 'block';
}


/**
 * CERRAR MODAL DE COMPARACIÓN
 */
function cerrarModalComparacion() {
    document.getElementById('modalComparacionProducto').style.display = 'none';
}

/**
 * APROBAR PRODUCTO DESDE MODAL
 */
function aprobarProductoModal() {
    const productoId = document.querySelector('#contenidoComparacionProducto h3').getAttribute('data-producto-id');
    aprobarProducto(productoId);
    cerrarModalComparacion();
}

/**
 * RECHAZAR PRODUCTO DESDE MODAL
 */
function rechazarProductoModal() {
    const productoId = document.querySelector('#contenidoComparacionProducto h3').getAttribute('data-producto-id');
    rechazarProducto(productoId);
    cerrarModalComparacion();
}

/**
 * EDITAR PRECIO DESDE MODAL
 */
async function editarPrecioModal() {
    const productoId = document.querySelector('#contenidoComparacionProducto h3').getAttribute('data-producto-id');
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    const datosProductos = await obtenerDatosProductosBatch([producto]);
    const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
    const datosProducto = alegraId ? datosProductos[alegraId] : null;
    
    const analisis = analizarProductoConDatos(producto, datosProducto);

    document.getElementById('contenidoEditarPrecio').innerHTML = `
        <div class="editar-precio-form">
            <h3 data-producto-id="${producto.id}">${producto.descripcion}</h3>
            
            <div class="form-group">
                <label>Precio Actual (Factura)</label>
                <input type="number" id="precioActual" value="${producto.precioUnitario}" disabled>
            </div>
            
            <div class="form-group">
                <label>Nuevo Precio de Venta</label>
                <input type="number" id="nuevoPrecio" value="${producto.precioUnitario}" step="0.01" min="0">
            </div>
            
            <div class="precio-info">
                <div class="info-item">
                    <span class="label">Costo Estimado:</span>
                    <span class="value">₡${formatearNumero(analisis.costoNuevoConIVA)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Margen Actual:</span>
                    <span class="value">${analisis.margenPorcentaje}%</span>
                </div>
                <div class="info-item">
                    <span class="label">Margen con Nuevo Precio:</span>
                    <span class="value" id="nuevoMargen">--%</span>
                </div>
            </div>
        </div>
    `;

    // Calcular margen al cambiar precio
    document.getElementById('nuevoPrecio').addEventListener('input', function () {
        const nuevoPrecio = parseFloat(this.value) || 0;
        const nuevoMargen = nuevoPrecio > 0 ? ((nuevoPrecio - analisis.costoNuevoConIVA) / nuevoPrecio) * 100 : 0;
        document.getElementById('nuevoMargen').textContent = isNaN(nuevoMargen) ? '--%' : Math.round(nuevoMargen) + '%';
    });

    document.getElementById('modalEditarPrecio').style.display = 'block';
}

/**
 * GUARDAR NUEVO PRECIO
 */
function guardarNuevoPrecio() {
    const productoId = document.querySelector('#contenidoEditarPrecio h3').getAttribute('data-producto-id');
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    const nuevoPrecio = parseFloat(document.getElementById('nuevoPrecio').value);

    if (isNaN(nuevoPrecio) || nuevoPrecio <= 0) {
        mostrarNotificacion('❌ Ingrese un precio válido', 'error');
        return;
    }

    producto.precioUnitario = nuevoPrecio;
    producto.estadoRevision = 'APROBADO';

    cerrarModalEditar();
    mostrarProductosRevision();
    actualizarProgresoRevision();

    mostrarNotificacion('✅ Precio actualizado y producto aprobado', 'success');
}

/**
 * CERRAR MODAL DE EDICIÓN
 */
function cerrarModalEditar() {
    document.getElementById('modalEditarPrecio').style.display = 'none';
}


/**
 * APROBAR TODOS LOS PRODUCTOS RESTANTES
 */
function aprobarTodosLosRestantes() {
    const pendientes = productosRevision.filter(p => p.estadoRevision === 'PENDIENTE');

    if (pendientes.length === 0) {
        mostrarNotificacion('ℹ️ No hay productos pendientes para aprobar', 'info');
        return;
    }

    if (!confirm(`¿Aprobar todos los ${pendientes.length} productos restantes?`)) {
        return;
    }

    // Aprobar todos los pendientes
    pendientes.forEach(producto => {
        producto.estadoRevision = 'APROBADO';
    });

    mostrarProductosRevision();
    actualizarProgresoRevision();

    mostrarNotificacion(`✅ ${pendientes.length} productos aprobados automáticamente`, 'success');
}

/**
 * APROBAR FACTURA COMPLETA Y ENVIAR A ALEGRA
 */
function aprobarFacturaCompleta() {
    if (!facturaSeleccionada) return;

    document.getElementById('tituloConfirmacion').textContent = 'Enviar Factura a Alegra';
    document.getElementById('contenidoConfirmacion').innerHTML = `
        <p>¿Estás seguro que deseas enviar la factura <strong>#${facturaSeleccionada.numeroConsecutivo}</strong> a Alegra?</p>
        <p>Esta acción realizará:</p>
        <ul style="text-align: left; margin: 1rem 0;">
            <li>✅ Actualizar costos de productos en Alegra</li>
            <li>📄 Crear factura de proveedor en Alegra</li>
            <li>🔄 Marcar factura como ENVIADA</li>
        </ul>
        <p><strong>El procesamiento se hará en segundo plano.</strong> Podrás seguir usando el sistema mientras se procesa.</p>
    `;

    document.getElementById('btnConfirmarAccion').onclick = function () {
        // Marcar todos los productos como aprobados (por si acaso)
        productosRevision.forEach(p => p.estadoRevision = 'APROBADO');

        // Ejecutar envío en segundo plano
        enviarFacturaAlegra();
    };

    document.getElementById('modalConfirmacion').style.display = 'block';
}

/**
 * NUEVA: Enviar factura completa a Alegra
 */
async function enviarFacturaAlegra() {
    if (!facturaSeleccionada) {
        console.error('❌ No hay factura seleccionada');
        mostrarNotificacion('❌ Error: No hay factura seleccionada', 'error');
        return;
    }

    try {
        // ✅ ALMACENAR datos antes de cambiar de vista
        const facturaId = facturaSeleccionada.id;
        const numeroConsecutivo = facturaSeleccionada.numeroConsecutivo;

        console.log(`🚀 Iniciando envío a Alegra en segundo plano: ${numeroConsecutivo}`);

        // Verificar productos aprobados
        const productosAprobados = productosRevision.filter(p => p.estadoRevision === 'APROBADO');

        if (productosAprobados.length === 0) {
            throw new Error('No hay productos aprobados para enviar');
        }

        // ✅ MOSTRAR NOTIFICACIÓN INMEDIATA
        mostrarNotificacion(
            `🚀 Enviando factura #${numeroConsecutivo} a Alegra en segundo plano...`,
            'info'
        );

        // ✅ CERRAR MODAL INMEDIATAMENTE
        cerrarModalConfirmacion();

        // ✅ VOLVER A LA LISTA (esto puede hacer que facturaSeleccionada sea null)
        volverAListaFacturas();

        // ✅ USAR facturaId almacenado (no facturaSeleccionada.id)
        procesarFacturaEnSegundoPlano(facturaId);

    } catch (error) {
        console.error('❌ Error iniciando envío:', error);
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
}

/**
 * NUEVA: Mostrar progreso del envío
 */
function mostrarProgresoEnvio(mensaje, porcentaje) {
    // Crear modal de progreso si no existe
    let modalProgreso = document.getElementById('modalProgresoEnvio');

    if (!modalProgreso) {
        modalProgreso = document.createElement('div');
        modalProgreso.id = 'modalProgresoEnvio';
        modalProgreso.className = 'modal';
        modalProgreso.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>🚀 Enviando a Alegra</h2>
                </div>
                <div class="modal-body" style="text-align: center; padding: 2rem;">
                    <div class="progress-circle" style="margin-bottom: 1rem;">
                        <div class="spinner" style="width: 60px; height: 60px; border-width: 6px;"></div>
                    </div>
                    <h3 id="mensajeProgreso" style="margin: 1rem 0; color: #2c3e50;">Preparando...</h3>
                    <div class="progress-bar" style="background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                        <div id="barraProgreso" style="background: #3498db; height: 100%; width: 0%; transition: width 0.5s;"></div>
                    </div>
                    <p id="porcentajeProgreso" style="margin: 1rem 0; color: #7f8c8d;">0%</p>
                </div>
            </div>
        `;
        document.body.appendChild(modalProgreso);
    }

    // Actualizar contenido
    document.getElementById('mensajeProgreso').textContent = mensaje;
    document.getElementById('barraProgreso').style.width = `${porcentaje}%`;
    document.getElementById('porcentajeProgreso').textContent = `${porcentaje}%`;

    // Mostrar modal
    modalProgreso.style.display = 'block';
}

/**
 * NUEVA: Ocultar progreso del envío
 */
function ocultarProgresoEnvio() {
    const modalProgreso = document.getElementById('modalProgresoEnvio');
    if (modalProgreso) {
        modalProgreso.style.display = 'none';
    }
}

/**
 * NUEVA: Mostrar resultado detallado del envío
 */
function mostrarResultadoEnvio(resultado) {
    document.getElementById('tituloConfirmacion').textContent = '🎉 Factura Enviada Exitosamente';

    const costosExitosos = resultado.costosExitosos || 0;
    const totalProductos = resultado.totalProductos || 0;

    document.getElementById('contenidoConfirmacion').innerHTML = `
        <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">✅</div>
            
            <h3 style="color: #27ae60; margin-bottom: 1rem;">
                Factura #${resultado.numeroConsecutivo} enviada exitosamente
            </h3>
            
            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; text-align: left;">
                    <div>
                        <strong>ID en Alegra:</strong><br>
                        <span style="color: #3498db;">#${resultado.alegraFacturaId}</span>
                    </div>
                    <div>
                        <strong>Proveedor:</strong><br>
                        <span>${resultado.proveedor}</span>
                    </div>
                    <div>
                        <strong>Productos:</strong><br>
                        <span>${totalProductos} productos</span>
                    </div>
                    <div>
                        <strong>Costos actualizados:</strong><br>
                        <span style="color: ${costosExitosos === totalProductos ? '#27ae60' : '#f39c12'};">
                            ${costosExitosos}/${totalProductos}
                        </span>
                    </div>
                </div>
            </div>
            
            ${costosExitosos < totalProductos ? `
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                    <p style="color: #856404; margin: 0;">
                        ⚠️ Algunos costos no se pudieron actualizar. 
                        Revisa manualmente en Alegra si es necesario.
                    </p>
                </div>
            ` : ''}
            
            <p style="color: #7f8c8d; margin-top: 1.5rem;">
                La factura está ahora disponible en tu cuenta de Alegra y el inventario ha sido actualizado.
            </p>
        </div>
    `;

    // Cambiar el botón de confirmación
    const btnConfirmar = document.getElementById('btnConfirmarAccion');
    btnConfirmar.textContent = 'Continuar';
    btnConfirmar.className = 'btn btn-primary';
    btnConfirmar.onclick = function () {
        cerrarModalConfirmacion();
        volverAListaFacturas();

        // Mostrar notificación final
        mostrarNotificacion(
            `🎉 Factura #${resultado.numeroConsecutivo} enviada exitosamente a Alegra`,
            'success'
        );
    };

    // Mostrar modal
    document.getElementById('modalConfirmacion').style.display = 'block';
}

/**
 * NUEVA: Mostrar modal de error
 */
function mostrarModalError(titulo, mensaje) {
    document.getElementById('tituloConfirmacion').textContent = titulo;
    document.getElementById('contenidoConfirmacion').innerHTML = `
        <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 4rem; margin-bottom: 1rem; color: #e74c3c;">❌</div>
            
            <h3 style="color: #e74c3c; margin-bottom: 1rem;">Error en el envío</h3>
            
            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin: 1rem 0; text-align: left;">
                <p style="color: #2c3e50; margin: 0; font-family: monospace; word-break: break-word;">
                    ${mensaje}
                </p>
            </div>
            
            <p style="color: #7f8c8d; margin-top: 1.5rem;">
                Por favor, revisa la configuración de Alegra o intenta nuevamente más tarde.
            </p>
        </div>
    `;

    // Cambiar el botón de confirmación
    const btnConfirmar = document.getElementById('btnConfirmarAccion');
    btnConfirmar.textContent = 'Cerrar';
    btnConfirmar.className = 'btn btn-secondary';
    btnConfirmar.onclick = function () {
        cerrarModalConfirmacion();
    };

    // Mostrar modal
    document.getElementById('modalConfirmacion').style.display = 'block';

    // También mostrar notificación
    mostrarNotificacion(`❌ Error: ${mensaje}`, 'error');
}
/**
 * EXPORTAR REVISIÓN
 */
function exportarRevision() {
    if (!facturaSeleccionada) return;

    console.log('📊 Exportando revisión de factura:', facturaSeleccionada.numeroConsecutivo);
    mostrarNotificacion('🚧 Función en desarrollo: Exportar revisión', 'info');
}

/**
 * CERRAR MODAL DE CONFIRMACIÓN
 */
function cerrarModalConfirmacion() {
    document.getElementById('modalConfirmacion').style.display = 'none';
}

/**
 * EJECUTAR ACCIÓN CONFIRMADA
 */
function ejecutarAccionConfirmada() {
    // Esta función se asigna dinámicamente según la acción a confirmar
    console.log('Acción confirmada ejecutada');
}

/**
 * ACTUALIZAR ESTADO FACTURA
 */
async function actualizarEstadoFactura(facturaId) {
    try {
        const response = await fetch(`/api/factura/${facturaId}/actualizar-estado`, {
            method: 'PUT'
        });

        const data = await response.json();

        if (data.success && data.estadoNuevo !== data.estadoAnterior) {
            console.log(`🔄 Estado actualizado: ${data.estadoAnterior} → ${data.estadoNuevo}`);
            return true;
        }

        return false;

    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
        return false;
    }
}

/**
 * CALCULAR COSTO CON IVA INCLUIDO
 */
function calcularCostoConIVA(producto) {
    // ✅ USAR EL TOTAL DE LA LÍNEA DE LA FACTURA
    const costoTotal = producto.totalLinea;
    const cantidad = producto.cantidad || 1;
    const impuestoTotal = producto.impuesto || 0;

    // Costo por unidad
    const costoPorUnidad = costoTotal / cantidad;
    const impuestoPorUnidad = impuestoTotal / cantidad;

    // Costo sin IVA = total - impuesto
    const costoSinIVAPorUnidad = (costoTotal - impuestoTotal) / cantidad;

    // Calcular porcentaje real de impuesto
    const porcentajeImpuesto = costoSinIVAPorUnidad > 0 ?
        (impuestoPorUnidad / costoSinIVAPorUnidad) * 100 : 0;

    console.log(`💰 Costo desde factura: ₡${costoTotal} ÷ ${cantidad} = ₡${costoPorUnidad.toFixed(2)}`);
    console.log(`💰 Impuesto real: ${porcentajeImpuesto.toFixed(1)}%`);

    return {
        costoSinIVA: costoSinIVAPorUnidad,
        costoConIVA: costoPorUnidad,
        impuestoPorcentaje: porcentajeImpuesto
    };
}



/**
 * ACTUALIZAR PRECIO DE VENTA DE PRODUCTO
 */
async function actualizarPrecioProducto(productoId) {
    const nuevoPrecioInput = document.getElementById(`nuevoPrecio_${productoId}`);
    const nuevoPrecio = parseFloat(nuevoPrecioInput.value);

    if (isNaN(nuevoPrecio) || nuevoPrecio <= 0) {
        mostrarNotificacion('❌ Ingrese un precio válido', 'error');
        return;
    }

    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;

    try {
        console.log(`💰 Actualizando precio de venta: ${producto.descripcion} → ₡${nuevoPrecio}`);

        // Obtener alegraId
        const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;

        // ✅ CAMBIO: Llamar al endpoint específico para precio de venta
        const response = await fetch('/api/actualizar-precio-venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productoId: productoId,
                nuevoPrecioVenta: nuevoPrecio,
                alegraItemId: alegraId
            })
        });

        const data = await response.json();

        if (data.success) {
            // ✅ ACTUALIZAR DATOS LOCALES
            producto.precioVentaActualizado = nuevoPrecio;
            producto.precioUnitario = nuevoPrecio;
            producto.estadoRevision = 'APROBADO';

            // ✅ ACTUALIZAR SOLO ESE PRODUCTO (sin recargar toda la página)
            await actualizarProductoIndividual(productoId);
            actualizarProgresoRevision();

            mostrarNotificacion(`✅ Precio de venta actualizado: ₡${formatearNumero(nuevoPrecio)}`, 'success');
        } else {
            throw new Error(data.error || 'Error actualizando precio');
        }

    } catch (error) {
        console.error('Error actualizando precio:', error);
        mostrarNotificacion('❌ Error actualizando precio de venta', 'error');
    }
}

/**
 * ✅ FUNCIÓN DEFINITIVA: Actualizar solo un producto individual
 */
async function actualizarProductoIndividual(productoId) {
    try {
        const producto = productosRevision.find(p => p.id === productoId);
        if (!producto) return;

        // Obtener datos frescos solo de este producto
        const alegraId = producto.alegraItemId || producto.mapeo?.alegraItemId;
        if (!alegraId) return;

        const datosProductos = await obtenerDatosProductosBatch([{ alegraItemId: alegraId }]);
        const datosProducto = datosProductos[alegraId];

        if (datosProducto) {
            const analisis = analizarProductoConDatos(producto, datosProducto);

            console.log(`💰 Actualizando producto ${productoId} con precio: ₡${formatearNumero(analisis.precioVentaActual)}`);

            // ✅ BUSCAR la fila usando el botón que tiene el onclick con el productoId
            const botonActualizar = document.querySelector(`button[onclick*="actualizarPrecioProducto('${productoId}')"]`);

            if (botonActualizar) {
                const filaProducto = botonActualizar.closest('tr');

                if (filaProducto) {
                    // ✅ ACTUALIZAR TODOS los spans verdes (precio venta actual)
                    const precioSpans = filaProducto.querySelectorAll('span[style*="color: #27ae60"]');

                    console.log(`📊 Encontrados ${precioSpans.length} elementos de precio para actualizar`);

                    precioSpans.forEach((span, index) => {
                        const precioAnterior = span.textContent;
                        span.textContent = `₡${formatearNumero(analisis.precioVentaActual)}`;
                        console.log(`💰 Span ${index + 1}: ${precioAnterior} → ${span.textContent}`);
                    });

                    // ✅ ACTUALIZAR el input del nuevo precio
                    const inputPrecio = document.getElementById(`nuevoPrecio_${productoId}`);
                    if (inputPrecio) {
                        inputPrecio.value = analisis.precioVentaActual;
                        console.log(`📝 Input actualizado: ${inputPrecio.value}`);
                    }

                    // ✅ ACTUALIZAR el margen
                    const margenDiv = filaProducto.querySelector('div[style*="font-size: 1.5rem"]');
                    if (margenDiv) {
                        margenDiv.textContent = `${analisis.margenPorcentaje}%`;
                        // Actualizar clase del margen
                        margenDiv.className = analisis.margenPorcentaje < 15 ? 'text-danger' :
                            analisis.margenPorcentaje < 25 ? 'text-warning' : 'text-success';
                        console.log(`📊 Margen actualizado: ${analisis.margenPorcentaje}%`);
                    }

                    // ✅ ACTUALIZAR texto del margen
                    const margenTextoDiv = margenDiv?.nextElementSibling;
                    if (margenTextoDiv) {
                        margenTextoDiv.textContent = analisis.margenTexto;
                        console.log(`📝 Texto margen: ${analisis.margenTexto}`);
                    }

                    console.log(`✅ Producto ${productoId} actualizado completamente`);

                } else {
                    console.warn(`⚠️ No se encontró la fila del producto ${productoId}`);
                    await mostrarProductosRevision();
                }
            } else {
                console.warn(`⚠️ No se encontró el botón del producto ${productoId}`);
                await mostrarProductosRevision();
            }
        }
    } catch (error) {
        console.error('❌ Error actualizando producto individual:', error);
        // Si falla, usar el método original como fallback
        await mostrarProductosRevision();
    }
}

/**
 * ✅ NUEVA: Procesar factura en segundo plano (sin bloquear UI)
 */
async function procesarFacturaEnSegundoPlano(facturaId) {
    try {
        // Mostrar indicador de progreso en la esquina
        mostrarIndicadorProcesamientoBackground(facturaId);

        // Llamar al endpoint sin bloquear la UI
        const response = await fetch('/api/enviar-alegra', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                facturaId: facturaId
            })
        });

        const data = await response.json();

        if (data.success) {
            // ✅ ÉXITO: Mostrar notificación y actualizar estado
            const resultado = data.resultado;

            mostrarNotificacion(
                `🎉 Factura #${resultado.numeroConsecutivo} enviada exitosamente a Alegra (ID: ${resultado.alegraFacturaId})`,
                'success'
            );

            // Actualizar estado local si la factura está visible
            actualizarEstadoFacturaEnLista(facturaId, 'ENVIADA');

            console.log('✅ Factura procesada exitosamente en segundo plano:', resultado);

        } else {
            throw new Error(data.error || 'Error enviando a Alegra');
        }

    } catch (error) {
        console.error('❌ Error en procesamiento background:', error);

        mostrarNotificacion(
            `❌ Error enviando factura a Alegra: ${error.message}. Revisa los logs para más detalles.`,
            'error'
        );
    } finally {
        // Quitar indicador de progreso
        ocultarIndicadorProcesamientoBackground();
    }
}

/**
 * ✅ NUEVA: Mostrar indicador de procesamiento en segundo plano
 */
function mostrarIndicadorProcesamientoBackground(facturaId) {
    // Crear indicador fijo en la esquina superior derecha
    let indicador = document.getElementById('indicadorBackground');

    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'indicadorBackground';
        indicador.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.3s ease-out;
        `;
        document.body.appendChild(indicador);
    }

    indicador.innerHTML = `
        <div style="width: 16px; height: 16px; border: 2px solid white; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Enviando factura a Alegra...</span>
    `;

    // Agregar animaciones CSS si no existen
    if (!document.getElementById('backgroundProcessingStyles')) {
        const styles = document.createElement('style');
        styles.id = 'backgroundProcessingStyles';
        styles.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styles);
    }
}

/**
 * ✅ NUEVA: Ocultar indicador de procesamiento
 */
function ocultarIndicadorProcesamientoBackground() {
    const indicador = document.getElementById('indicadorBackground');
    if (indicador) {
        indicador.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => {
            if (indicador.parentNode) {
                indicador.parentNode.removeChild(indicador);
            }
        }, 300);
    }
}

/**
 * ✅ NUEVA: Actualizar estado de factura en la lista
 */
function actualizarEstadoFacturaEnLista(facturaId, nuevoEstado) {
    // Buscar la factura en la lista y actualizar su estado visual
    const facturaElement = document.querySelector(`[data-factura-id="${facturaId}"]`);
    if (facturaElement) {
        const estadoElement = facturaElement.querySelector('.factura-estado');
        if (estadoElement) {
            estadoElement.textContent = nuevoEstado;
            estadoElement.className = `factura-estado ${nuevoEstado.toLowerCase()}`;
        }
    }
}

/**
 * UTILIDADES
 */
function obtenerParametroURL(parametro) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(parametro);
}

function formatearNumero(numero) {
    return new Intl.NumberFormat('es-CR').format(numero);
}

function formatearFecha(fecha) {
    if (!fecha) return 'N/A';

    // Si es string, convertir a Date
    const fechaObj = typeof fecha === 'string' ? new Date(fecha) : fecha;

    return fechaObj.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function mostrarCargando(selector) {
    const container = document.querySelector(selector);
    if (!container) return;

    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Cargando...</p>
        </div>
    `;
}

function mostrarError(mensaje) {
    const container = document.getElementById('listaFacturasPrecios');
    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">❌</div>
            <h3>Error</h3>
            <p>${mensaje}</p>
            <button onclick="window.location.reload()" class="btn">Reintentar</button>
        </div>
    `;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion ${tipo}`;
    notificacion.textContent = mensaje;

    document.body.appendChild(notificacion);

    setTimeout(() => notificacion.classList.add('mostrar'), 100);

    setTimeout(() => {
        notificacion.classList.remove('mostrar');
        setTimeout(() => document.body.removeChild(notificacion), 300);
    }, 3000);
}