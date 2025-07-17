// js/productos-relacionados.js - Gestión completa de productos relacionados
// Sistema de Facturas CR - Vista para revisar y editar todas las relaciones

// ========================================
// VARIABLES GLOBALES
// ========================================
let productosActuales = [];
let estadisticasActuales = {};
let paginaActual = 1;
let totalPaginas = 1;
let productoEnEdicion = null;
let productoEnEliminacion = null;
let busquedaTimeout = null;

// Configuración
const PRODUCTOS_POR_PAGINA = 20;

// ========================================
// INICIALIZACIÓN
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔗 Iniciando gestión de productos relacionados...');
    
    configurarEventos();
    cargarDatos();
});

function configurarEventos() {
    // Filtros con debounce
    document.getElementById('busquedaTexto').addEventListener('input', debounce(aplicarFiltros, 500));
    
    // Filtros instantáneos
    document.getElementById('filtroProveedor').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroEstado').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroConfianza').addEventListener('change', aplicarFiltros);
    
    // Búsqueda en modal de edición
    document.getElementById('buscarNuevoProducto').addEventListener('input', debounce(buscarProductosParaEditar, 500));
    
    // Cerrar modales al hacer clic fuera
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            cerrarModales();
        }
    });
    
    // Enter para buscar
    document.getElementById('busquedaTexto').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            aplicarFiltros();
        }
    });
}

// ========================================
// CARGA DE DATOS PRINCIPAL
// ========================================
async function cargarDatos() {
    try {
        console.log('📊 Cargando datos de productos relacionados...');
        
        await Promise.all([
            cargarProveedores(),
            cargarProductosRelacionados()
        ]);
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        mostrarError('Error cargando los datos. Verifica la conexión.');
    }
}

async function cargarProveedores() {
    try {
        // Obtener lista única de proveedores desde la API
        const response = await fetch('/api/productos-relacionados?limit=1000');
        const data = await response.json();
        
        if (data.success) {
            const proveedoresUnicos = [...new Set(
                data.productos.map(p => p.factura.proveedorNombre)
            )].sort();
            
            const select = document.getElementById('filtroProveedor');
            select.innerHTML = '<option value="">Todos los proveedores</option>';
            
            proveedoresUnicos.forEach(proveedor => {
                const option = document.createElement('option');
                option.value = proveedor;
                option.textContent = proveedor;
                select.appendChild(option);
            });
            
            console.log(`✅ ${proveedoresUnicos.length} proveedores cargados`);
        }
        
    } catch (error) {
        console.error('Error cargando proveedores:', error);
    }
}

async function cargarProductosRelacionados() {
    try {
        mostrarCargandoProductos();
        
        const filtros = obtenerFiltrosActuales();
        const params = new URLSearchParams({
            page: paginaActual,
            limit: PRODUCTOS_POR_PAGINA,
            ...filtros
        });
        
        console.log(`🔍 Cargando página ${paginaActual} con filtros:`, filtros);
        
        const response = await fetch(`/api/productos-relacionados?${params}`);
        const data = await response.json();
        
        if (data.success) {
            productosActuales = data.productos;
            estadisticasActuales = data.estadisticas;
            totalPaginas = data.totalPages;
            
            mostrarEstadisticas();
            mostrarProductos();
            actualizarPaginacion();
            actualizarInfoResultados(data.total);
            
            console.log(`✅ ${data.productos.length} productos cargados (${data.total} total)`);
            
        } else {
            throw new Error(data.error || 'Error cargando productos');
        }
        
    } catch (error) {
        console.error('❌ Error cargando productos relacionados:', error);
        mostrarErrorProductos('Error cargando productos relacionados');
    }
}

// ========================================
// MOSTRAR DATOS
// ========================================
function mostrarEstadisticas() {
    const container = document.getElementById('estadisticasContainer');
    const stats = estadisticasActuales.totales || {};
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${formatearNumero(stats.total || 0)}</div>
            <div class="stat-label">📦 Total Productos</div>
        </div>
        
        <div class="stat-card" style="border-left-color: #27ae60;">
            <div class="stat-number">${formatearNumero(stats.relacionados || 0)}</div>
            <div class="stat-label">✅ Relacionados</div>
        </div>
        
        <div class="stat-card" style="border-left-color: #f39c12;">
            <div class="stat-number">${formatearNumero(stats.pendientes || 0)}</div>
            <div class="stat-label">⏳ Pendientes</div>
        </div>
        
        <div class="stat-card" style="border-left-color: #e74c3c;">
            <div class="stat-number">${formatearNumero(stats.ignorados || 0)}</div>
            <div class="stat-label">❌ Ignorados</div>
        </div>
        
        <div class="stat-card" style="border-left-color: #9b59b6;">
            <div class="stat-number">${stats.porcentajeRelacionado || 0}%</div>
            <div class="stat-label">📊 Eficiencia</div>
        </div>
    `;
}

function mostrarProductos() {
    const container = document.getElementById('listaProductos');
    
    if (productosActuales.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay productos</h3>
                <p>No se encontraron productos con los filtros aplicados.</p>
                <button class="btn btn-primary" onclick="limpiarFiltros()">Limpiar Filtros</button>
            </div>
        `;
        return;
    }
    
    const html = productosActuales.map(producto => {
        const confianza = producto.confianza || 0;
        const confianzaClass = getConfianzaClass(confianza);
        const estadoClass = getEstadoClass(producto.estadoRelacionado);
        
        return `
            <div class="producto-row">
                <div class="producto-info">
                    <!-- Información del producto (factura) -->
                    <div>
                        <div class="producto-descripcion">${producto.descripcion}</div>
                        <div class="producto-detalles">
                            <div><strong>Código:</strong> ${producto.codigoProveedor}</div>
                            <div><strong>Factura:</strong> ${producto.factura.numeroConsecutivo}</div>
                            <div><strong>Proveedor:</strong> ${producto.factura.proveedorNombre}</div>
                            <div><strong>Cantidad:</strong> ${producto.cantidad} ${producto.unidadMedida}</div>
                            <div><strong>Precio:</strong> ₡${formatearNumero(producto.precioUnitario)}</div>
                        </div>
                    </div>
                    
                    <!-- Información de Alegra -->
                    <div>
                        ${producto.estadoRelacionado === 'RELACIONADO' && producto.alegraInfo ? `
                            <div class="alegra-info">
                                <div class="alegra-nombre">${producto.alegraInfo.name}</div>
                                <div style="font-size: 0.85rem; color: #27ae60;">
                                    <div>ID: ${producto.alegraItemId}</div>
                                    <div>Ref: ${producto.alegraInfo.reference || 'N/A'}</div>
                                    <div>Precio: ₡${formatearNumero(producto.alegraInfo.price || 0)}</div>
                                    <div>Costo: ₡${formatearNumero(producto.alegraInfo.cost || 0)}</div>
                                </div>
                            </div>
                        ` : `
                            <div style="padding: 0.75rem; background: #f8f9fa; border-radius: 4px; color: #7f8c8d; text-align: center;">
                                ${getEstadoTexto(producto.estadoRelacionado)}
                            </div>
                        `}
                    </div>
                    
                    <!-- Estado y confianza -->
                    <div style="text-align: center;">
                        <div class="badge ${estadoClass}" style="display: block; margin-bottom: 0.5rem; padding: 0.5rem; border-radius: 4px; font-weight: 500;">
                            ${getEstadoTexto(producto.estadoRelacionado)}
                        </div>
                        ${producto.confianza ? `
                            <div class="confianza-badge ${confianzaClass}">
                                ${Math.round(confianza)}% confianza
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Fecha -->
                    <div style="text-align: center; color: #7f8c8d; font-size: 0.85rem;">
                        <div><strong>Procesada:</strong></div>
                        <div>${formatearFecha(producto.factura.fechaProcesada)}</div>
                        ${producto.mapeo ? `
                            <div style="margin-top: 0.5rem;">
                                <div><strong>Relacionada:</strong></div>
                                <div>${formatearFecha(producto.mapeo.createdDate)}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Acciones -->
                <div class="producto-actions">
                    ${producto.estadoRelacionado === 'RELACIONADO' ? `
                        <button class="btn-sm btn-warning" onclick="editarRelacion('${producto.id}')" title="Cambiar producto relacionado">
                            ✏️ Editar
                        </button>
                        <button class="btn-sm btn-danger" onclick="eliminarRelacion('${producto.id}')" title="Eliminar relación">
                            🗑️ Eliminar
                        </button>
                        <button class="btn-sm btn-info" onclick="verHistorial('${producto.id}')" title="Ver historial">
                            📋 Historial
                        </button>
                        <button class="btn-sm btn-primary" onclick="abrirFactura('${producto.factura.id}')" title="Ir a factura">
                            📄 Ver Factura
                        </button>
                    ` : `
                        <button class="btn-sm btn-primary" onclick="relacionarProducto('${producto.id}')" title="Relacionar producto">
                            🔗 Relacionar
                        </button>
                        <button class="btn-sm btn-info" onclick="abrirFactura('${producto.factura.id}')" title="Ir a factura">
                            📄 Ver Factura
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// ========================================
// FILTROS Y BÚSQUEDA
// ========================================
function obtenerFiltrosActuales() {
    const filtros = {};
    
    const proveedor = document.getElementById('filtroProveedor').value;
    const estado = document.getElementById('filtroEstado').value;
    const confianza = document.getElementById('filtroConfianza').value;
    const busqueda = document.getElementById('busquedaTexto').value.trim();
    
    if (proveedor) filtros.proveedor = proveedor;
    if (estado && estado !== 'TODOS') filtros.estado = estado;
    if (confianza) filtros.confianza = confianza;
    if (busqueda) filtros.busqueda = busqueda;
    
    return filtros;
}

async function aplicarFiltros() {
    paginaActual = 1; // Resetear a primera página
    await cargarProductosRelacionados();
}

function limpiarFiltros() {
    document.getElementById('filtroProveedor').value = '';
    document.getElementById('filtroEstado').value = 'RELACIONADO';
    document.getElementById('filtroConfianza').value = '';
    document.getElementById('busquedaTexto').value = '';
    
    aplicarFiltros();
}

// ========================================
// ACCIONES DE PRODUCTOS
// ========================================
function editarRelacion(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) return;
    
    productoEnEdicion = producto;
    
    // Mostrar información del producto actual
    document.getElementById('infoProductoEditar').innerHTML = `
        <h4>${producto.descripcion}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.75rem;">
            <div>
                <strong>📦 Producto Actual:</strong><br>
                Código: ${producto.codigoProveedor}<br>
                Cantidad: ${producto.cantidad} ${producto.unidadMedida}<br>
                Precio: ₡${formatearNumero(producto.precioUnitario)}
            </div>
            <div>
                <strong>🔗 Relacionado con:</strong><br>
                ${producto.alegraInfo ? `
                    Nombre: ${producto.alegraInfo.name}<br>
                    ID: ${producto.alegraItemId}<br>
                    Ref: ${producto.alegraInfo.reference || 'N/A'}
                ` : 'No relacionado'}
            </div>
        </div>
    `;
    
    // Limpiar búsqueda
    document.getElementById('buscarNuevoProducto').value = '';
    document.getElementById('resultadosBusquedaNuevo').innerHTML = `
        <p style="text-align: center; color: #7f8c8d; padding: 2rem;">
            Escribe para buscar productos en Alegra...
        </p>
    `;
    document.getElementById('motivoCambio').value = '';
    
    // Mostrar modal
    document.getElementById('modalEditarRelacion').style.display = 'block';
    
    // Focus en buscar
    setTimeout(() => {
        document.getElementById('buscarNuevoProducto').focus();
    }, 300);
}

function eliminarRelacion(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) return;
    
    productoEnEliminacion = producto;
    
    // Mostrar información del producto
    document.getElementById('infoProductoEliminar').innerHTML = `
        <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px;">
            <h4>${producto.descripcion}</h4>
            <div style="margin-top: 0.75rem;">
                <div><strong>Factura:</strong> ${producto.factura.numeroConsecutivo}</div>
                <div><strong>Proveedor:</strong> ${producto.factura.proveedorNombre}</div>
                <div><strong>Relacionado con:</strong> ${producto.alegraInfo?.name || 'N/A'}</div>
                <div><strong>Confianza:</strong> ${Math.round(producto.confianza || 0)}%</div>
            </div>
        </div>
    `;
    
    document.getElementById('motivoEliminacion').value = '';
    document.getElementById('modalConfirmarEliminacion').style.display = 'block';
}

function relacionarProducto(productoId) {
    // Redirigir a la página de relacionar con el ID de la factura
    const producto = productosActuales.find(p => p.id === productoId);
    if (producto) {
        window.location.href = `relacionar.html?id=${producto.factura.id}`;
    }
}

function abrirFactura(facturaId) {
    // Redirigir a la página de relacionar productos de esa factura
    window.location.href = `relacionar.html?id=${facturaId}`;
}

function verHistorial(productoId) {
    // Por ahora mostrar alerta, después implementar modal de historial
    mostrarNotificacion('🚧 Función de historial en desarrollo', 'info');
}

// ========================================
// BÚSQUEDA PARA EDITAR
// ========================================
async function buscarProductosParaEditar() {
    const termino = document.getElementById('buscarNuevoProducto').value.trim();
    const container = document.getElementById('resultadosBusquedaNuevo');
    
    if (termino.length < 2) {
        container.innerHTML = `
            <p style="text-align: center; color: #7f8c8d; padding: 2rem;">
                Escribe al menos 2 caracteres...
            </p>
        `;
        return;
    }
    
    container.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="spinner" style="width: 30px; height: 30px; margin: 0 auto 1rem;"></div>
            <p>Buscando productos...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/buscar-productos?q=${encodeURIComponent(termino)}`);
        const data = await response.json();
        
        if (data.success && data.productos?.length > 0) {
            mostrarResultadosEdicion(data.productos, termino);
        } else {
            container.innerHTML = `
                <p style="text-align: center; color: #7f8c8d; padding: 2rem;">
                    ❌ No se encontraron productos con "${termino}"
                </p>
            `;
        }
        
    } catch (error) {
        console.error('Error buscando productos:', error);
        container.innerHTML = `
            <p style="text-align: center; color: #e74c3c; padding: 2rem;">
                ❌ Error en la búsqueda
            </p>
        `;
    }
}

function mostrarResultadosEdicion(productos, termino) {
    const container = document.getElementById('resultadosBusquedaNuevo');
    
    const html = productos.map((producto, index) => `
        <div style="padding: 1rem; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 0.5rem; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#f8f9fa'" 
             onmouseout="this.style.background='white'"
             onclick="seleccionarNuevoProducto('${producto.id}', '${escaparTexto(producto.name)}', ${index})">
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #2c3e50; margin-bottom: 0.25rem;">
                        ${resaltarTermino(producto.name, termino)}
                    </div>
                    <div style="font-size: 0.85rem; color: #7f8c8d;">
                        <span>Ref: ${producto.reference || 'N/A'}</span>
                        <span style="margin-left: 1rem;">Precio: ₡${formatearNumero(producto.price || 0)}</span>
                        <span style="margin-left: 1rem;">Costo: ₡${formatearNumero(producto.cost || 0)}</span>
                    </div>
                </div>
                <button class="btn-sm btn-primary" onclick="event.stopPropagation(); seleccionarNuevoProducto('${producto.id}', '${escaparTexto(producto.name)}', ${index})">
                    ✅ Seleccionar
                </button>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

async function seleccionarNuevoProducto(alegraId, nombre, index) {
    if (!productoEnEdicion) return;
    
    try {
        // Deshabilitar botón
        const botones = document.querySelectorAll('#resultadosBusquedaNuevo .btn-sm');
        if (botones[index]) {
            botones[index].innerHTML = '⏳ Guardando...';
            botones[index].disabled = true;
        }
        
        const motivo = document.getElementById('motivoCambio').value.trim();
        
        console.log(`✏️ Editando relación: ${productoEnEdicion.id} → ${alegraId}`);
        
        const response = await fetch(`/api/relacion/${productoEnEdicion.id}/editar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nuevoAlegraItemId: alegraId,
                motivo: motivo || 'Edición manual desde gestión de relaciones'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion(`✅ Relación actualizada: ${nombre}`, 'success');
            cerrarModalEditar();
            await cargarProductosRelacionados(); // Recargar datos
        } else {
            throw new Error(data.error || 'Error editando relación');
        }
        
    } catch (error) {
        console.error('Error editando relación:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        
        // Restaurar botón
        const botones = document.querySelectorAll('#resultadosBusquedaNuevo .btn-sm');
        if (botones[index]) {
            botones[index].innerHTML = '✅ Seleccionar';
            botones[index].disabled = false;
        }
    }
}

async function confirmarEliminacion() {
    if (!productoEnEliminacion) return;
    
    try {
        const motivo = document.getElementById('motivoEliminacion').value.trim();
        
        console.log(`🗑️ Eliminando relación: ${productoEnEliminacion.id}`);
        
        const response = await fetch(`/api/relacion/${productoEnEliminacion.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                motivo: motivo || 'Eliminación manual desde gestión de relaciones'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion(`✅ Relación eliminada: ${productoEnEliminacion.descripcion}`, 'success');
            cerrarModalEliminar();
            await cargarProductosRelacionados(); // Recargar datos
        } else {
            throw new Error(data.error || 'Error eliminando relación');
        }
        
    } catch (error) {
        console.error('Error eliminando relación:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    }
}

// ========================================
// PAGINACIÓN
// ========================================
function actualizarPaginacion() {
    const container = document.getElementById('paginacionContainer');
    
    if (totalPaginas <= 1) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    
    // Actualizar botones
    document.getElementById('btnPrimera').disabled = paginaActual === 1;
    document.getElementById('btnAnterior').disabled = paginaActual === 1;
    document.getElementById('btnSiguiente').disabled = paginaActual === totalPaginas;
    document.getElementById('btnUltima').disabled = paginaActual === totalPaginas;
    
    // Actualizar info
    document.getElementById('infoPagina').textContent = `Página ${paginaActual} de ${totalPaginas}`;
}

async function cambiarPagina(direccion) {
    const nuevaPagina = paginaActual + direccion;
    
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
        paginaActual = nuevaPagina;
        await cargarProductosRelacionados();
        
        // Scroll al top
        document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
    }
}

async function irAPagina(pagina) {
    if (pagina >= 1 && pagina <= totalPaginas) {
        paginaActual = pagina;
        await cargarProductosRelacionados();
        
        // Scroll al top
        document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
    }
}

async function irAUltimaPagina() {
    await irAPagina(totalPaginas);
}

// ========================================
// MODALES
// ========================================
function cerrarModalEditar() {
    document.getElementById('modalEditarRelacion').style.display = 'none';
    productoEnEdicion = null;
}

function cerrarModalEliminar() {
    document.getElementById('modalConfirmarEliminacion').style.display = 'none';
    productoEnEliminacion = null;
}

function cerrarModales() {
    cerrarModalEditar();
    cerrarModalEliminar();
}

// ========================================
// EXPORTACIÓN
// ========================================
function exportarRelaciones() {
    // Por ahora mostrar alerta, después implementar exportación real
    mostrarNotificacion('🚧 Función de exportación en desarrollo', 'info');
    
    // TODO: Implementar exportación a CSV/Excel
    // const filtros = obtenerFiltrosActuales();
    // window.open(`/api/productos-relacionados/export?${new URLSearchParams(filtros)}`);
}

// ========================================
// UI Y UTILIDADES
// ========================================
function mostrarCargandoProductos() {
    document.getElementById('listaProductos').innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Cargando productos relacionados...</p>
        </div>
    `;
}

function mostrarErrorProductos(mensaje) {
    document.getElementById('listaProductos').innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #e74c3c;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
            <h3>Error</h3>
            <p>${mensaje}</p>
            <button class="btn btn-primary" onclick="cargarProductosRelacionados()">🔄 Reintentar</button>
        </div>
    `;
}

function actualizarInfoResultados(total) {
    document.getElementById('infoResultados').textContent = 
        `${formatearNumero(total)} producto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`;
}

function mostrarError(mensaje) {
    const container = document.querySelector('.container');
    container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #e74c3c;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">❌</div>
            <h2>Error de Conexión</h2>
            <p>${mensaje}</p>
            <button class="btn btn-primary" onclick="window.location.reload()">🔄 Reintentar</button>
        </div>
    `;
}

// ========================================
// FUNCIONES DE FORMATO Y ESTILO
// ========================================
function getConfianzaClass(confianza) {
    if (confianza >= 80) return 'confianza-alta';
    if (confianza >= 60) return 'confianza-media';
    return 'confianza-baja';
}

function getEstadoClass(estado) {
    const clases = {
        'RELACIONADO': 'success',
        'PENDIENTE': 'warning',
        'IGNORADO': 'danger'
    };
    return clases[estado] || 'secondary';
}

function getEstadoTexto(estado) {
    const textos = {
        'RELACIONADO': '✅ Relacionado',
        'PENDIENTE': '⏳ Pendiente',
        'IGNORADO': '❌ Ignorado'
    };
    return textos[estado] || estado;
}

function formatearNumero(numero) {
    return new Intl.NumberFormat('es-CR').format(numero);
}

function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escaparTexto(texto) {
    if (!texto) return '';
    return texto.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function resaltarTermino(texto, termino) {
    if (!termino || !texto) return texto;
    const regex = new RegExp(`(${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return texto.replace(regex, '<mark>$1</mark>');
}

function debounce(func, wait) {
   return function executedFunction(...args) {
       const later = () => {
           clearTimeout(busquedaTimeout);
           func(...args);
       };
       clearTimeout(busquedaTimeout);
       busquedaTimeout = setTimeout(later, wait);
   };
}

function mostrarNotificacion(mensaje, tipo = 'info') {
   // Crear elemento de notificación
   const notificacion = document.createElement('div');
   notificacion.style.cssText = `
       position: fixed;
       top: 20px;
       right: 20px;
       z-index: 10000;
       padding: 1rem 1.5rem;
       border-radius: 8px;
       color: white;
       font-weight: 500;
       max-width: 400px;
       box-shadow: 0 4px 12px rgba(0,0,0,0.15);
       transform: translateX(100%);
       transition: transform 0.3s ease;
   `;
   
   // Colores según tipo
   const colores = {
       'success': '#27ae60',
       'error': '#e74c3c',
       'warning': '#f39c12',
       'info': '#3498db'
   };
   
   notificacion.style.backgroundColor = colores[tipo] || colores.info;
   notificacion.textContent = mensaje;
   
   // Agregar al DOM
   document.body.appendChild(notificacion);
   
   // Mostrar con animación
   setTimeout(() => {
       notificacion.style.transform = 'translateX(0)';
   }, 100);
   
   // Ocultar después de 4 segundos
   setTimeout(() => {
       notificacion.style.transform = 'translateX(100%)';
       setTimeout(() => {
           if (document.body.contains(notificacion)) {
               document.body.removeChild(notificacion);
           }
       }, 300);
   }, 4000);
}