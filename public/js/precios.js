// js/precios.js - Revisión de precios para facturas 100% relacionadas
// Sistema de Facturas CR - Análisis de precios y costos

let facturasCompletas = [];
let facturasFiltradas = [];
let proveedoresUnicos = [];
let facturaSeleccionada = null;
let productosRevision = [];
let filtroProductosActual = 'todos';

/**
 * INICIALIZACIÓN
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 Iniciando revisión de precios...');
    
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
            mostrarFacturasCompletas();
            
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
        productosRevision = factura.productos.map(p => ({...p, estadoRevision: 'PENDIENTE'}));
        
        console.log(`✅ Factura cargada para análisis: ${factura.numeroConsecutivo} (${total} productos, 100% relacionados)`);
        
        // Mostrar vista de revisión individual
        mostrarVistaRevisionIndividual();
        mostrarInfoFacturaRevision();
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
function mostrarInfoFacturaRevision() {
    const container = document.getElementById('infoFacturaRevision');
    
    if (!facturaSeleccionada) return;
    
    const analisis = analizarFactura(facturaSeleccionada);
    
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
function mostrarFacturasCompletas() {
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
    
    const template = document.getElementById('templateFacturaRevision').innerHTML;
    
    const html = facturasFiltradas.map(factura => {
        const analisis = analizarFactura(factura);
        const productosAprobados = 0; // Inicialmente ninguno aprobado
        const productosPendientes = factura.productos.length;
        
        // Generar alertas HTML
        let alertasHTML = '';
        if (analisis.alertas.length > 0) {
            alertasHTML = analisis.alertas.slice(0, 2).map(alerta => `
                <div class="alerta-item ${alerta.tipo}">
                    ${alerta.icono} ${alerta.mensaje}
                </div>
            `).join('');
            
            if (analisis.alertas.length > 2) {
                alertasHTML += `<div class="alerta-item mas-alertas">+${analisis.alertas.length - 2} más</div>`;
            }
        }
        
        // Determinar estado de revisión
        let estadoTexto = 'PENDIENTE';
        let estadoClass = 'pendiente';
        
        // Reemplazar marcadores en el template
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
}

/**
 * ANALIZAR FACTURA PARA DETECTAR ALERTAS
 */
function analizarFactura(factura) {
    let alertas = [];
    let tieneAlertas = false;
    
    factura.productos.forEach(producto => {
        const analisisProducto = analizarProducto(producto);
        alertas.push(...analisisProducto.alertas);
        if (analisisProducto.tieneAlerta) tieneAlertas = true;
    });
    
    return {
        alertas,
        tieneAlertas
    };
}

/**
 * ANALIZAR PRODUCTO INDIVIDUAL
 */
function analizarProducto(producto) {
    let alertas = [];
    let tieneAlerta = false;
    
    // Simular análisis de precios (en producción usarías datos reales de Alegra)
    const precioFactura = producto.precioUnitario;
    const precioAnterior = precioFactura * (0.8 + Math.random() * 0.4); // Simulado
    const costoProducto = precioFactura * (0.4 + Math.random() * 0.3); // Simulado
    
    // Alertas de precio
    if (precioFactura > precioAnterior * 1.3) {
        alertas.push({
            tipo: 'precio-alto',
            icono: '📈',
            mensaje: `Precio ${Math.round(((precioFactura - precioAnterior) / precioAnterior) * 100)}% más alto`
        });
        tieneAlerta = true;
    }
    
    if (precioFactura < precioAnterior * 0.7) {
        alertas.push({
            tipo: 'precio-bajo',
            icono: '📉',
            mensaje: `Precio ${Math.round(((precioAnterior - precioFactura) / precioAnterior) * 100)}% más bajo`
        });
        tieneAlerta = true;
    }
    
    // Alertas de margen
    const margen = ((precioFactura - costoProducto) / precioFactura) * 100;
    if (margen < 20) {
        alertas.push({
            tipo: 'margen-bajo',
            icono: '⚠️',
            mensaje: `Margen bajo: ${Math.round(margen)}%`
        });
        tieneAlerta = true;
    }
    
    // Alerta de costo no registrado (simulado)
    if (Math.random() < 0.1) {
        alertas.push({
            tipo: 'sin-costo',
            icono: '❓',
            mensaje: 'Sin costo registrado'
        });
        tieneAlerta = true;
    }
    
    return {
        alertas,
        tieneAlerta,
        precioAnterior,
        costoProducto,
        margen
    };
}

/**
 * FILTRAR FACTURAS
 */
function filtrarFacturasPrecios() {
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
    mostrarFacturasCompletas();
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
    productosRevision = factura.productos.map(p => ({...p, estadoRevision: 'PENDIENTE'}));
    
    mostrarVistaRevisionIndividual();
    mostrarInfoFacturaRevision();
    mostrarProductosRevision();
    actualizarProgresoRevision();
}

/**
 * MOSTRAR PRODUCTOS EN REVISIÓN
 */
function mostrarProductosRevision() {
    const container = document.getElementById('listaProductosRevision');
    const template = document.getElementById('templateProductoRevision').innerHTML;
    
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
    
    const html = productosMostrar.map(producto => {
        const analisis = analizarProducto(producto);
        const estadoRevision = producto.estadoRevision || 'PENDIENTE';
        
        // Determinar estado y clase
        let estadoTexto, estadoClass;
        switch(estadoRevision) {
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
        
        // Calcular diferencia con precio Alegra (simulado)
        const precioAlegra = analisis.precioAnterior;
        const diferencia = producto.precioUnitario - precioAlegra;
        const diferenciaPorcentaje = Math.round((diferencia / precioAlegra) * 100);
        
        let diferenciaTexto = '';
        let diferenciaClass = '';
        
        if (diferencia > 0) {
            diferenciaTexto = `${formatearNumero(diferencia)} más alto`;
            diferenciaClass = 'alto';
        } else if (diferencia < 0) {
            diferenciaTexto = `${formatearNumero(Math.abs(diferencia))} más bajo`;
            diferenciaClass = 'bajo';
        } else {
            diferenciaTexto = 'Mismo precio';
            diferenciaClass = 'igual';
        }
        
        // Calcular margen proveedor (simulado)
        const margenObjetivo = parseInt(document.getElementById('margenObjetivo').value) || 25;
        const precioProveedor = producto.precioUnitario * (1 + margenObjetivo / 100);
        
        // Reemplazar marcadores en el template
        return template
            .replace(/{productoId}/g, producto.id)
            .replace('{descripcion}', producto.descripcion)
            .replace('{estadoClass}', estadoClass)
            .replace('{estadoTexto}', estadoTexto)
            .replace('{estado}', estadoRevision)
            .replace('{precioAlegra}', formatearNumero(precioAlegra))
            .replace('{precioProveedor}', formatearNumero(precioProveedor))
            .replace('{margen}', margenObjetivo)
            .replace('{diferenciaClass}', diferenciaClass)
            .replace('{diferenciaPorcentaje}', diferenciaPorcentaje + '%')
            .replace('{diferenciaTexto}', diferenciaTexto)
            .replace('{cantidad}', producto.cantidad)
            .replace('{unidadMedida}', producto.unidadMedida)
            .replace('{codigoProveedor}', producto.codigoProveedor || 'N/A')
            .replace('{numeroLinea}', producto.numeroLinea || 'N/A')
            .replace('{approveDisabled}', estadoRevision !== 'PENDIENTE' ? 'disabled' : '')
            .replace('{rejectDisabled}', estadoRevision !== 'PENDIENTE' ? 'disabled' : '');
    }).join('');
    
    container.innerHTML = html;
    
    // Mostrar/ocultar acciones finales si todos están revisados
    const pendientes = productosRevision.filter(p => p.estadoRevision === 'PENDIENTE').length;
    document.getElementById('accionesFinalesRevision').style.display = pendientes === 0 ? 'block' : 'none';
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
function verDetallesComparacion(productoId) {
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;
    
    const analisis = analizarProducto(producto);
    
    document.getElementById('contenidoComparacionProducto').innerHTML = `
        <div class="comparacion-producto">
            <h3>${producto.descripcion}</h3>
            
            <div class="comparacion-grid">
                <div class="comparacion-col">
                    <h4>📊 Información Actual</h4>
                    <div class="comparacion-item">
                        <span class="label">Precio Factura:</span>
                        <span class="value">₡${formatearNumero(producto.precioUnitario)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Costo Estimado:</span>
                        <span class="value">₡${formatearNumero(analisis.costoProducto)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Margen Actual:</span>
                        <span class="value ${analisis.margen < 20 ? 'text-warning' : ''}">
                            ${Math.round(analisis.margen)}%
                        </span>
                    </div>
                </div>
                
                <div class="comparacion-col">
                    <h4>📈 Histórico</h4>
                    <div class="comparacion-item">
                        <span class="label">Último Precio:</span>
                        <span class="value">₡${formatearNumero(analisis.precioAnterior)}</span>
                    </div>
                    <div class="comparacion-item">
                        <span class="label">Diferencia:</span>
                        <span class="value ${producto.precioUnitario > analisis.precioAnterior ? 'text-danger' : 'text-success'}">
                            ${Math.round(((producto.precioUnitario - analisis.precioAnterior) / analisis.precioAnterior * 100))}%
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
                        <span class="value">${document.getElementById('margenObjetivo').value}%</span>
                    </div>
                    <div class="sugerencia-item">
                        <span class="label">Precio Sugerido:</span>
                        <span class="value">₡${formatearNumero(analisis.costoProducto * (1 + parseInt(document.getElementById('margenObjetivo').value) / 100))}</span>
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
function editarPrecioModal() {
    const productoId = document.querySelector('#contenidoComparacionProducto h3').getAttribute('data-producto-id');
    const producto = productosRevision.find(p => p.id === productoId);
    if (!producto) return;
    
    const analisis = analizarProducto(producto);
    
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
                    <span class="value">₡${formatearNumero(analisis.costoProducto)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Margen Actual:</span>
                    <span class="value">${Math.round(analisis.margen)}%</span>
                </div>
                <div class="info-item">
                    <span class="label">Margen con Nuevo Precio:</span>
                    <span class="value" id="nuevoMargen">--%</span>
                </div>
            </div>
        </div>
    `;
    
    // Calcular margen al cambiar precio
    document.getElementById('nuevoPrecio').addEventListener('input', function() {
        const nuevoPrecio = parseFloat(this.value) || 0;
        const nuevoMargen = ((nuevoPrecio - analisis.costoProducto) / nuevoPrecio) * 100;
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
 * APLICAR CRITERIOS AUTOMÁTICOS
 */
function aplicarCriteriosAutomaticos() {
    const margenObjetivo = parseInt(document.getElementById('margenObjetivo').value) || 25;
    const tolerancia = parseInt(document.getElementById('toleranciaPrecio').value) || 10;
    
    if (!confirm(`¿Aplicar criterios automáticos con margen objetivo de ${margenObjetivo}% y tolerancia de ${tolerancia}%?`)) {
        return;
    }
    
    productosRevision.forEach(producto => {
        const analisis = analizarProducto(producto);
        
        // Solo aplicar a productos pendientes
        if (producto.estadoRevision !== 'PENDIENTE') return;
        
        // Calcular margen actual
        const margenActual = ((producto.precioUnitario - analisis.costoProducto) / producto.precioUnitario) * 100;
        
        // Aprobar si está dentro de la tolerancia
        if (Math.abs(margenActual - margenObjetivo) <= tolerancia) {
            producto.estadoRevision = 'APROBADO';
        } else {
            producto.estadoRevision = 'RECHAZADO';
        }
    });
    
    mostrarProductosRevision();
    actualizarProgresoRevision();
    
    mostrarNotificacion(`🤖 Aplicados criterios automáticos a ${productosRevision.length} productos`, 'success');
}

/**
 * APROBAR FACTURA COMPLETA
 */
function aprobarFacturaCompleta() {
    if (!facturaSeleccionada) return;
    
    document.getElementById('tituloConfirmacion').textContent = 'Confirmar Aprobación';
    document.getElementById('contenidoConfirmacion').innerHTML = `
        <p>¿Estás seguro que deseas aprobar completamente la factura <strong>#${facturaSeleccionada.numeroConsecutivo}</strong>?</p>
        <p>Esta acción marcará todos los productos como aprobados y enviará la factura al siguiente paso.</p>
    `;
    
    document.getElementById('btnConfirmarAccion').onclick = function() {
        // Marcar todos los productos como aprobados (por si acaso)
        productosRevision.forEach(p => p.estadoRevision = 'APROBADO');
        
        // Aquí implementarías el envío a Alegra o siguiente paso
        mostrarNotificacion('🚧 Función en desarrollo: Aprobación completa', 'warning');
        
        cerrarModalConfirmacion();
        volverAListaFacturas();
    };
    
    document.getElementById('modalConfirmacion').style.display = 'block';
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