// js/relacionar.js - Relacionar productos de una factura específica
// Sistema de Facturas CR - Vista centrada en facturas individuales

let facturaActual = null;
let productosActuales = [];
let filtroActual = 'todos';
let productoEnBusqueda = null;

/**
 * INICIALIZACIÓN
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔗 Iniciando relacionado de productos...');
    
    const facturaId = obtenerParametroURL('id');
    const productoId = obtenerParametroURL('producto');
    
    if (facturaId) {
        cargarFactura(facturaId);
    } else if (productoId) {
        cargarProductoEspecifico(productoId);
    } else {
        mostrarError('No se especificó factura o producto para relacionar');
    }
});

/**
 * CARGAR FACTURA COMPLETA
 */
async function cargarFactura(facturaId) {
    try {
        console.log(`📄 Cargando factura: ${facturaId}`);
        
        // Cargar datos de la factura (usando el endpoint existente)
        const response = await fetch(`/api/facturas/PROCESADA`);
        const data = await response.json();
        
        if (data.success) {
            facturaActual = data.facturas.find(f => f.id === facturaId);
            
            if (!facturaActual) {
                throw new Error('Factura no encontrada');
            }
            
            productosActuales = facturaActual.productos || [];
            
            mostrarInformacionFactura();
            mostrarProgreso();
            mostrarProductos();
            
            console.log(`✅ Factura cargada: ${productosActuales.length} productos`);
            
        } else {
            throw new Error(data.error || 'Error cargando factura');
        }
        
    } catch (error) {
        console.error('❌ Error cargando factura:', error);
        mostrarError('Error cargando la factura: ' + error.message);
    }
}

/**
 * CARGAR PRODUCTO ESPECÍFICO
 */
async function cargarProductoEspecifico(productoId) {
    try {
        console.log(`📦 Cargando producto específico: ${productoId}`);
        
        // Buscar el producto en todas las facturas
        const response = await fetch('/api/facturas/PROCESADA');
        const data = await response.json();
        
        if (data.success) {
            let productoEncontrado = null;
            let facturaEncontrada = null;
            
            for (const factura of data.facturas) {
                const producto = factura.productos.find(p => p.id === productoId);
                if (producto) {
                    productoEncontrado = producto;
                    facturaEncontrada = factura;
                    break;
                }
            }
            
            if (!productoEncontrado) {
                throw new Error('Producto no encontrado');
            }
            
            facturaActual = facturaEncontrada;
            productosActuales = facturaActual.productos;
            
            mostrarInformacionFactura();
            mostrarProgreso();
            mostrarProductos();
            
            // Abrir modal de búsqueda para este producto específico
            setTimeout(() => abrirBusquedaManual(productoId), 500);
            
        } else {
            throw new Error(data.error);
        }
        
    } catch (error) {
        console.error('❌ Error cargando producto:', error);
        mostrarError('Error cargando el producto: ' + error.message);
    }
}

/**
 * MOSTRAR INFORMACIÓN DE LA FACTURA
 */
function mostrarInformacionFactura() {
    const header = document.getElementById('facturaHeader');
    
    const html = `
        <div class="factura-info-header">
            <div class="factura-principal">
                <h1>📄 Factura ${facturaActual.numeroConsecutivo}</h1>
                <div class="factura-detalles">
                    <div class="detalle-item">
                        <span class="label">Proveedor:</span>
                        <span class="value">${facturaActual.proveedorNombre}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Fecha:</span>
                        <span class="value">${formatearFecha(facturaActual.fechaEmision)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Total:</span>
                        <span class="value">₡${formatearNumero(facturaActual.totalFactura)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Productos:</span>
                        <span class="value">${facturaActual.totalProductos} productos</span>
                    </div>
                </div>
            </div>
            <div class="factura-estado">
                <div class="estado-badge ${getEstadoBadgeClass(facturaActual.estado)}">${getEstadoTexto(facturaActual.estado)}</div>
            </div>
        </div>
    `;
    
    header.innerHTML = html;
}

/**
 * MOSTRAR PROGRESO
 */
function mostrarProgreso() {
    const total = productosActuales.length;
    const relacionados = productosActuales.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
    const pendientes = productosActuales.filter(p => p.estadoRelacionado === 'PENDIENTE').length;
    const ignorados = productosActuales.filter(p => p.estadoRelacionado === 'IGNORADO').length;
    
    const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0;
    
    // Actualizar barra de progreso
    document.getElementById('progressFill').style.width = `${porcentaje}%`;
    document.getElementById('progressText').textContent = `${porcentaje}% completado`;
    
    // Actualizar estadísticas
    document.getElementById('progressStats').innerHTML = `
        <div class="stat-item">
            <span class="stat-number">${relacionados}</span>
            <span class="stat-label">Relacionados</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${pendientes}</span>
            <span class="stat-label">Pendientes</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${ignorados}</span>
            <span class="stat-label">Ignorados</span>
        </div>
    `;
    
    // Mostrar botón de finalizar si está completo
    if (porcentaje === 100) {
        document.getElementById('accionesFinales').style.display = 'block';
    }
}

/**
 * MOSTRAR PRODUCTOS
 */
function mostrarProductos() {
    const container = document.getElementById('listaProductos');
    
    // Filtrar productos según el filtro activo
    const productosFiltrados = filtrarProductosPorEstado(productosActuales, filtroActual);
    
    if (productosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay productos ${filtroActual === 'todos' ? '' : filtroActual}</h3>
                <p>Cambia el filtro para ver otros productos.</p>
            </div>
        `;
        return;
    }
    
    const html = productosFiltrados.map(producto => `
        <div class="producto-item ${getProductoClass(producto.estadoRelacionado)}">
            <div class="producto-header">
                <div class="producto-numero">Línea ${producto.numeroLinea}</div>
                <div class="producto-estado ${getEstadoClass(producto.estadoRelacionado)}">
                    ${getEstadoIcon(producto.estadoRelacionado)} ${getEstadoTexto(producto.estadoRelacionado)}
                </div>
            </div>
            
            <div class="producto-info">
                <h4 class="producto-descripcion">${producto.descripcion}</h4>
                <div class="producto-detalles">
                    <span class="codigo">Código: ${producto.codigoProveedor}</span>
                    <span class="cantidad">Cantidad: ${producto.cantidad} ${producto.unidadMedida}</span>
                    <span class="precio">₡${formatearNumero(producto.precioUnitario)} c/u</span>
                    <span class="total">Total: ₡${formatearNumero(producto.totalLinea)}</span>
                </div>
            </div>
            
            <div class="producto-relacionado">
                ${mostrarRelacionado(producto)}
            </div>
            
            <div class="producto-acciones">
                ${mostrarAcciones(producto)}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * MOSTRAR RELACIONADO
 */
function mostrarRelacionado(producto) {
    if (producto.estadoRelacionado === 'RELACIONADO' && producto.mapeo) {
        return `
            <div class="relacionado-exitoso">
                <div class="relacionado-info">
                    <strong>${producto.mapeo.alegraName}</strong>
                    <div class="relacionado-detalles">
                        <span>Referencia: ${producto.mapeo.alegraReference || 'N/A'}</span>
                        <span class="confianza ${getConfianzaClass(producto.confianza || 100)}">
                            ${Math.round(producto.confianza || 100)}% confianza
                        </span>
                    </div>
                </div>
            </div>
        `;
    } else if (producto.estadoRelacionado === 'PENDIENTE') {
        return `
            <div class="relacionado-pendiente">
                <div class="busqueda-info">
                    <span>🔍 Necesita relacionar con producto de Alegra</span>
                </div>
            </div>
        `;
    } else if (producto.estadoRelacionado === 'IGNORADO') {
        return `
            <div class="relacionado-ignorado">
                <span>❌ Producto marcado como ignorado</span>
            </div>
        `;
    }
    
    return '<div class="relacionado-vacio">Sin procesar</div>';
}

/**
 * MOSTRAR ACCIONES
 */
function mostrarAcciones(producto) {
    if (producto.estadoRelacionado === 'RELACIONADO') {
        return `
            <button onclick="desconectarProducto('${producto.id}')" class="btn-action warning">
                🔓 Desconectar
            </button>
            <button onclick="cambiarRelacion('${producto.id}')" class="btn-action">
                🔄 Cambiar
            </button>
        `;
    } else if (producto.estadoRelacionado === 'PENDIENTE') {
        return `
            <button onclick="buscarSugerencias('${producto.id}')" class="btn-action primary">
                🤖 Ver Sugerencias
            </button>
            <button onclick="abrirBusquedaManual('${producto.id}')" class="btn-action">
                🔍 Buscar Manual
            </button>
            <button onclick="ignorarProducto('${producto.id}')" class="btn-action warning">
                ❌ Ignorar
            </button>
        `;
    } else if (producto.estadoRelacionado === 'IGNORADO') {
        return `
            <button onclick="reactivarProducto('${producto.id}')" class="btn-action">
                🔄 Reactivar
            </button>
        `;
    }
    
    return '';
}

/**
 * FILTROS DE PRODUCTOS
 */
function filtrarProductos(filtro) {
    filtroActual = filtro;
    
    // Actualizar tabs activos
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filtro) {
            btn.classList.add('active');
        }
    });
    
    mostrarProductos();
}

function filtrarProductosPorEstado(productos, filtro) {
    switch (filtro) {
        case 'pendientes':
            return productos.filter(p => p.estadoRelacionado === 'PENDIENTE');
        case 'relacionados':
            return productos.filter(p => p.estadoRelacionado === 'RELACIONADO');
        case 'ignorados':
            return productos.filter(p => p.estadoRelacionado === 'IGNORADO');
        default:
            return productos;
    }
}

/**
 * ACCIONES DE PRODUCTOS
 */
async function buscarSugerencias(productoId) {
    try {
        console.log(`🤖 Buscando sugerencias para producto: ${productoId}`);
        
        const response = await fetch('/api/productos-pendientes');
        const data = await response.json();
        
        if (data.success) {
            const productoConSugerencias = data.productos.find(p => p.id === productoId);
            
            if (productoConSugerencias && productoConSugerencias.sugerencias?.length > 0) {
                mostrarModalSugerencias(productoConSugerencias);
            } else {
                mostrarNotificacion('No se encontraron sugerencias automáticas. Intenta la búsqueda manual.', 'warning');
                abrirBusquedaManual(productoId);
            }
        }
        
    } catch (error) {
        console.error('❌ Error buscando sugerencias:', error);
        mostrarNotificacion('Error buscando sugerencias: ' + error.message, 'error');
    }
}

function abrirBusquedaManual(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) return;
    
    productoEnBusqueda = producto;
    
    // Mostrar información del producto
    document.getElementById('infoProductoActual').innerHTML = `
        <div class="producto-info-modal">
            <h4>${producto.descripcion}</h4>
            <div class="detalles-modal">
                <span><strong>Código proveedor:</strong> ${producto.codigoProveedor}</span>
                <span><strong>Cantidad:</strong> ${producto.cantidad} ${producto.unidadMedida}</span>
                <span><strong>Precio:</strong> ₡${formatearNumero(producto.precioUnitario)}</span>
            </div>
        </div>
    `;
    
    // Limpiar búsqueda anterior
    document.getElementById('buscarProductoInput').value = '';
    document.getElementById('resultadosBusqueda').innerHTML = `
        <p style="text-align: center; color: #666; font-style: italic;">Escribe para buscar productos en Alegra...</p>
    `;
    
    // Mostrar modal
    document.getElementById('modalBuscarProducto').style.display = 'block';
    
    // Focus en el input
    setTimeout(() => document.getElementById('buscarProductoInput').focus(), 300);
}

// =================== BÚSQUEDA MEJORADA =================== //

async function buscarEnAlegra() {
    const termino = document.getElementById('buscarProductoInput').value.trim();
    const resultadosContainer = document.getElementById('resultadosBusqueda');
    
    if (termino.length < 2) {
        resultadosContainer.innerHTML = `
            <div class="search-notice">
                <p>🔤 Escribe al menos 2 caracteres para buscar...</p>
            </div>
        `;
        return;
    }
    
    try {
        console.log(`🔍 Buscando en Alegra: "${termino}"`);
        
        resultadosContainer.innerHTML = `
            <div class="loading-small">
                <div class="spinner-small"></div>
                <p>Buscando productos...</p>
            </div>
        `;
        
        const response = await fetch(`/api/buscar-productos?q=${encodeURIComponent(termino)}`);
        const data = await response.json();
        
        if (data.success && data.productos?.length > 0) {
            mostrarResultadosBusqueda(data.productos, termino);
        } else if (data.success && data.productos?.length === 0) {
            resultadosContainer.innerHTML = `
                <div class="no-results">
                    <p>❌ No se encontraron productos con "${termino}"</p>
                    <p>💡 Intenta con otras palabras clave como:</p>
                    <div class="search-suggestions">
                        <span onclick="sugerirBusqueda('tornillo')">tornillo</span>
                        <span onclick="sugerirBusqueda('cable')">cable</span>
                        <span onclick="sugerirBusqueda('pintura')">pintura</span>
                        <span onclick="sugerirBusqueda('tubo')">tubo</span>
                    </div>
                </div>
            `;
        } else {
            throw new Error(data.error || 'Error en la búsqueda');
        }
        
    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        resultadosContainer.innerHTML = `
            <div class="error-search">
                <p>❌ Error en la búsqueda</p>
                <p>Verifica la conexión e intenta nuevamente</p>
                <button onclick="buscarEnAlegra()" class="btn-mini">🔄 Reintentar</button>
            </div>
        `;
    }
}

function mostrarResultadosBusqueda(productos, termino) {
    const container = document.getElementById('resultadosBusqueda');
    
    const html = `
        <div class="search-header">
            <h4>📋 ${productos.length} productos encontrados para "${termino}"</h4>
            <div class="search-stats">
                Mostrando los más relevantes
            </div>
        </div>
        
        <div class="resultados-lista">
            ${productos.map(producto => `
                <div class="resultado-busqueda" onclick="seleccionarProductoAlegra('${producto.alegraId}', '${escaparTexto(producto.name)}')">
                    <div class="resultado-info">
                        <div class="resultado-header">
                            <div class="resultado-nombre">${resaltarTermino(producto.name, termino)}</div>
                            <div class="relevancia-badge">${producto.relevancia || 0}% relevancia</div>
                        </div>
                        <div class="resultado-detalles">
                            <span class="detalle-item">
                                <strong>Ref:</strong> ${producto.reference || 'N/A'}
                            </span>
                            <span class="detalle-item">
                                <strong>Cat:</strong> ${producto.category || 'General'}
                            </span>
                            <span class="detalle-item precio">
                                <strong>₡${formatearNumero(producto.price || 0)}</strong>
                            </span>
                            ${producto.cost > 0 ? `
                                <span class="detalle-item costo">
                                    Costo: ₡${formatearNumero(producto.cost)}
                                </span>
                            ` : ''}
                        </div>
                        ${producto.description && producto.description !== producto.name ? `
                            <div class="resultado-descripcion">
                                ${resaltarTermino(producto.description, termino)}
                            </div>
                        ` : ''}
                    </div>
                    <button class="btn-mini primary">✅ Seleccionar</button>
                </div>
            `).join('')}
        </div>
        
        ${productos.length >= 15 ? `
            <div class="search-footer">
                💡 Mostrando primeros 15 resultados. Usa términos más específicos para afinar la búsqueda.
            </div>
        ` : ''}
    `;
    
    container.innerHTML = html;
}

// Funciones auxiliares para la búsqueda
function escaparTexto(texto) {
    return texto.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function resaltarTermino(texto, termino) {
    if (!termino || !texto) return texto;
    
    const regex = new RegExp(`(${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return texto.replace(regex, '<mark>$1</mark>');
}

function sugerirBusqueda(termino) {
    document.getElementById('buscarProductoInput').value = termino;
    buscarEnAlegra();
}

async function seleccionarProductoAlegra(alegraId, nombre) {
    try {
        console.log(`✅ Seleccionando producto: ${nombre} (${alegraId})`);
        
        // Mostrar loading en el botón
        const botones = document.querySelectorAll('.resultado-busqueda .btn-mini');
        botones.forEach(btn => {
            if (btn.closest('.resultado-busqueda').onclick.toString().includes(alegraId)) {
                btn.innerHTML = '⏳ Confirmando...';
                btn.disabled = true;
            }
        });
        
        const response = await fetch('/api/confirmar-producto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                productoId: productoEnBusqueda.id,
                alegraItemId: alegraId,
                confianza: 100
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion(`✅ Producto relacionado: ${nombre}`, 'success');
            cerrarModalBuscar();
            
            // Recargar factura para mostrar cambios
            if (facturaActual?.id) {
                await cargarFactura(facturaActual.id);
                
                // NUEVO: Actualizar estado de factura automáticamente
                await actualizarEstadoFactura(facturaActual.id);
            }
            
        } else {
            throw new Error(data.error || 'Error relacionando producto');
        }
        
    } catch (error) {
        console.error('❌ Error relacionando producto:', error);
        mostrarNotificacion('❌ Error relacionando producto: ' + error.message, 'error');
        
        // Restaurar botón
        const botones = document.querySelectorAll('.resultado-busqueda .btn-mini');
        botones.forEach(btn => {
            if (btn.closest('.resultado-busqueda').onclick.toString().includes(alegraId)) {
                btn.innerHTML = '✅ Seleccionar';
                btn.disabled = false;
            }
        });
    }
}

// NUEVA FUNCIÓN: Actualizar estado de factura
async function actualizarEstadoFactura(facturaId) {
    try {
        const response = await fetch(`/api/factura/${facturaId}/actualizar-estado`, {
            method: 'PUT'
        });
        
        const data = await response.json();
        
        if (data.success && data.estadoNuevo !== data.estadoAnterior) {
            console.log(`🔄 Estado actualizado: ${data.estadoAnterior} → ${data.estadoNuevo}`);
            
            if (data.porcentajeRelacionado === 100) {
                mostrarNotificacion('🎉 ¡Factura 100% relacionada! Ya está lista para revisión de precios.', 'success');
                
                // Mostrar botón para ir a precios
                const accionesFinales = document.getElementById('accionesFinales');
                if (accionesFinales) {
                    accionesFinales.style.display = 'block';
                    accionesFinales.innerHTML = `
                        <h3>🎉 ¡Factura Completada!</h3>
                        <p>Todos los productos han sido relacionados exitosamente.</p>
                        <div class="action-buttons">
                            <a href="precios.html?id=${facturaId}" class="btn success">💰 Revisar Precios</a>
                            <a href="facturas.html" class="btn btn-secondary">📄 Ver Otras Facturas</a>
                        </div>
                    `;
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
    }
}

async function ignorarProducto(productoId) {
    try {
        console.log(`❌ Ignorando producto: ${productoId}`);
        
        const response = await fetch('/api/rechazar-producto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productoId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('✅ Producto marcado como ignorado', 'success');
            cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error);
        }
        
    } catch (error) {
        console.error('❌ Error ignorando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    }
}

/**
 * MODAL Y UI
 */
function cerrarModalBuscar() {
    document.getElementById('modalBuscarProducto').style.display = 'none';
    productoEnBusqueda = null;
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', function(event) {
    const modal = document.getElementById('modalBuscarProducto');
    if (event.target === modal) {
        cerrarModalBuscar();
    }
});

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
    return new Date(fecha).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function getEstadoBadgeClass(estado) {
    const clases = {
        'RECIBIDA': 'estado-recibida',
        'PROCESADA': 'estado-procesada',
        'RELACIONADA': 'estado-relacionada',
        'ENVIADA': 'estado-enviada',
        'COMPLETADA': 'estado-completada'
    };
    return clases[estado] || 'estado-default';
}

function getEstadoTexto(estado) {
    const textos = {
        'RECIBIDA': '📥 Recibida',
        'PROCESADA': '⚙️ Procesada',
        'RELACIONADA': '🔗 Relacionada',
        'ENVIADA': '📤 Enviada',
        'COMPLETADA': '✅ Completa',
        'PENDIENTE': '⏳ Pendiente',
        'RELACIONADO': '✅ Relacionado',
        'IGNORADO': '❌ Ignorado'
    };
    return textos[estado] || estado;
}

function getEstadoClass(estado) {
    return `estado-${estado.toLowerCase()}`;
}

function getProductoClass(estado) {
    return `producto-${estado.toLowerCase()}`;
}

function getEstadoIcon(estado) {
    const iconos = {
        'PENDIENTE': '⏳',
        'RELACIONADO': '✅',
        'IGNORADO': '❌'
    };
    return iconos[estado] || '❓';
}

function getConfianzaClass(confianza) {
    if (confianza >= 80) return 'confianza-alta';
    if (confianza >= 60) return 'confianza-media';
    return 'confianza-baja';
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

function mostrarError(mensaje) {
    const container = document.querySelector('.container');
    container.innerHTML = `
        <div class="error-state-full">
            <div class="error-icon">❌</div>
            <h2>Error</h2>
            <p>${mensaje}</p>
            <div class="error-actions">
                <button onclick="window.location.href='facturas.html'" class="btn">← Volver a Facturas</button>
                <button onclick="window.location.reload()" class="btn primary">🔄 Reintentar</button>
            </div>
        </div>
    `;
}