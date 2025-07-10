// js/script.js - Dashboard Principal
// Sistema de Facturas CR - Dashboard para papá

let estadisticasActuales = {};
let facturasRecientes = [];
let updateInterval = null;

/**
 * INICIALIZACIÓN
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Iniciando Dashboard...');
    cargarDashboard();
    iniciarActualizacionAutomatica();
});

/**
 * CARGA PRINCIPAL DEL DASHBOARD
 */
async function cargarDashboard() {
    try {
        console.log('📊 Cargando estadísticas del dashboard...');
        
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        
        if (data.success) {
            estadisticasActuales = data.stats;
            facturasRecientes = data.stats.facturasRecientes || [];
            
            mostrarEstadisticas(data.stats);
            mostrarFacturasRecientes(facturasRecientes);
            
            console.log('✅ Dashboard cargado exitosamente');
        } else {
            throw new Error(data.error || 'Error cargando dashboard');
        }
        
    } catch (error) {
        console.error('❌ Error cargando dashboard:', error);
        mostrarError('Error cargando el dashboard. Intentando reconectar...');
        
        // Reintentar en 5 segundos
        setTimeout(cargarDashboard, 5000);
    }
}

/**
 * MOSTRAR ESTADÍSTICAS
 */
function mostrarEstadisticas(stats) {
    const statsGrid = document.getElementById('statsGrid');
    
    const html = `
        <div class="stat-card">
            <div class="stat-icon">📄</div>
            <div class="stat-content">
                <h3>Facturas Totales</h3>
                <div class="stat-number">${stats.totalFacturas || 0}</div>
                <div class="stat-detail">₡${formatearNumero(stats.totalMonto || 0)}</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">⏳</div>
            <div class="stat-content">
                <h3>Productos Pendientes</h3>
                <div class="stat-number">${stats.productosPendientes || 0}</div>
                <div class="stat-detail">Necesitan confirmación</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">🔗</div>
            <div class="stat-content">
                <h3>Productos Relacionados</h3>
                <div class="stat-number">${stats.totalMapeos || 0}</div>
                <div class="stat-detail">Sistema aprendiendo</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-content">
                <h3>Eficiencia</h3>
                <div class="stat-number">${calcularEficiencia(stats)}%</div>
                <div class="stat-detail">Automatización</div>
            </div>
        </div>
    `;
    
    statsGrid.innerHTML = html;
}

/**
 * MOSTRAR FACTURAS RECIENTES
 */
function mostrarFacturasRecientes(facturas) {
    const container = document.getElementById('facturasRecientes');
    
    if (!facturas || facturas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay facturas recientes</h3>
                <p>Las facturas procesadas aparecerán aquí automáticamente.</p>
            </div>
        `;
        return;
    }
    
    const html = facturas.map(factura => `
        <div class="factura-card" onclick="abrirFactura('${factura.id}')">
            <div class="factura-header">
                <div class="factura-numero">${factura.numeroConsecutivo}</div>
                <div class="factura-fecha">${formatearFecha(factura.fechaEmision)}</div>
            </div>
            
            <div class="factura-info">
                <div class="proveedor">${factura.proveedorNombre}</div>
                <div class="total">₡${formatearNumero(factura.totalFactura)}</div>
            </div>
            
            <div class="factura-progreso">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${factura.resumen.porcentajeCompletado}%"></div>
                </div>
                <div class="progress-text">
                    ${factura.resumen.productosRelacionados}/${factura.resumen.totalProductos} productos relacionados
                </div>
            </div>
            
            <div class="factura-estado ${getEstadoClass(factura.resumen.porcentajeCompletado)}">
                ${getEstadoTexto(factura.resumen.porcentajeCompletado)}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * ACCIONES DE FACTURAS
 */
function abrirFactura(facturaId) {
    console.log(`🔍 Abriendo factura: ${facturaId}`);
    window.location.href = `relacionar.html?id=${facturaId}`;
}

/**
 * PRODUCTOS PENDIENTES
 */
async function verTodosLosPendientes() {
    const modal = document.getElementById('modalPendientes');
    const container = document.getElementById('todosLosPendientes');
    
    // Mostrar modal con loading
    modal.style.display = 'block';
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Cargando productos pendientes...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/productos-pendientes');
        const data = await response.json();
        
        if (data.success) {
            mostrarProductosPendientes(data.productos);
        } else {
            throw new Error(data.error);
        }
        
    } catch (error) {
        console.error('❌ Error cargando productos pendientes:', error);
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error cargando productos</h3>
                <p>${error.message}</p>
                <button onclick="verTodosLosPendientes()" class="btn">Reintentar</button>
            </div>
        `;
    }
}

function mostrarProductosPendientes(productos) {
    const container = document.getElementById('todosLosPendientes');
    
    if (!productos || productos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎉</div>
                <h3>¡No hay productos pendientes!</h3>
                <p>Todos los productos han sido procesados.</p>
            </div>
        `;
        return;
    }
    
    const html = productos.map(producto => `
        <div class="producto-pendiente-card">
            <div class="producto-info">
                <h4>${producto.descripcion}</h4>
                <div class="producto-detalles">
                    <span class="codigo">Código: ${producto.codigoProveedor}</span>
                    <span class="factura">Factura: ${producto.factura.numeroConsecutivo}</span>
                    <span class="proveedor">${producto.factura.proveedorNombre}</span>
                </div>
            </div>
            
            <div class="sugerencias">
                ${producto.sugerencias && producto.sugerencias.length > 0 ? 
                    producto.sugerencias.map(sugerencia => `
                        <div class="sugerencia" onclick="confirmarSugerencia('${producto.id}', '${sugerencia.mapeo.alegraItemId}', ${sugerencia.confianza})">
                            <div class="sugerencia-info">
                                <div class="nombre">${sugerencia.mapeo.alegraName}</div>
                                <div class="confianza ${getConfianzaClass(sugerencia.confianza)}">${sugerencia.confianza}% confianza</div>
                            </div>
                            <button class="btn-mini success">✅ Confirmar</button>
                        </div>
                    `).join('') :
                    `<div class="sin-sugerencias">
                        <span>Sin sugerencias automáticas</span>
                        <button onclick="buscarManualmente('${producto.id}')" class="btn-mini">🔍 Buscar</button>
                    </div>`
                }
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * CONFIRMAR SUGERENCIAS
 */
async function confirmarSugerencia(productoId, alegraItemId, confianza) {
    try {
        console.log(`✅ Confirmando producto: ${productoId} → ${alegraItemId}`);
        
        const response = await fetch('/api/confirmar-producto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                productoId: productoId,
                alegraItemId: alegraItemId,
                confianza: confianza
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('✅ Producto confirmado exitosamente', 'success');
            
            // Recargar productos pendientes
            verTodosLosPendientes();
            
            // Actualizar estadísticas
            cargarDashboard();
            
        } else {
            throw new Error(data.error);
        }
        
    } catch (error) {
        console.error('❌ Error confirmando producto:', error);
        mostrarNotificacion('❌ Error confirmando producto: ' + error.message, 'error');
    }
}

function buscarManualmente(productoId) {
    // Redirigir a la página de relacionar con el producto específico
    window.location.href = `relacionar.html?producto=${productoId}`;
}

/**
 * MODAL Y UI
 */
function cerrarModal() {
    document.getElementById('modalPendientes').style.display = 'none';
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', function(event) {
    const modal = document.getElementById('modalPendientes');
    if (event.target === modal) {
        cerrarModal();
    }
});

/**
 * ACTUALIZACIÓN AUTOMÁTICA
 */
function iniciarActualizacionAutomatica() {
    // Actualizar cada 30 segundos
    updateInterval = setInterval(() => {
        console.log('🔄 Actualizando dashboard automáticamente...');
        cargarDashboard();
    }, 30000);
}

// Detener actualización al cambiar de página
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

/**
 * UTILIDADES
 */
function formatearNumero(numero) {
    return new Intl.NumberFormat('es-CR').format(numero);
}

function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function calcularEficiencia(stats) {
    if (!stats.totalFacturas || stats.totalFacturas === 0) return 0;
    const facturasProcesadas = (stats.facturasPorEstado || [])
        .filter(e => e.estado !== 'RECIBIDA')
        .reduce((total, e) => total + e._count.id, 0);
    return Math.round((facturasProcesadas / stats.totalFacturas) * 100);
}

function getEstadoClass(porcentaje) {
    if (porcentaje === 100) return 'estado-completo';
    if (porcentaje >= 50) return 'estado-progreso';
    return 'estado-pendiente';
}

function getEstadoTexto(porcentaje) {
    if (porcentaje === 100) return '✅ Completo';
    if (porcentaje >= 50) return '🔄 En progreso';
    return '⏳ Pendiente';
}

function getConfianzaClass(confianza) {
    if (confianza >= 80) return 'confianza-alta';
    if (confianza >= 60) return 'confianza-media';
    return 'confianza-baja';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Crear elemento de notificación
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion ${tipo}`;
    notificacion.textContent = mensaje;
    
    // Agregar al body
    document.body.appendChild(notificacion);
    
    // Mostrar con animación
    setTimeout(() => notificacion.classList.add('mostrar'), 100);
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        notificacion.classList.remove('mostrar');
        setTimeout(() => document.body.removeChild(notificacion), 300);
    }, 3000);
}

function mostrarError(mensaje) {
    const statsGrid = document.getElementById('statsGrid');
    const facturasContainer = document.getElementById('facturasRecientes');
    
    statsGrid.innerHTML = `
        <div class="error-state-full">
            <div class="error-icon">❌</div>
            <h3>Error de Conexión</h3>
            <p>${mensaje}</p>
        </div>
    `;
    
    facturasContainer.innerHTML = `
        <div class="error-state">
            <div class="error-icon">📡</div>
            <h3>Reconectando...</h3>
            <p>Verificando conexión con el servidor...</p>
        </div>
    `;
}