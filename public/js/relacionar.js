// js/relacionar.js - Simplificado y Robusto

// ========================================
// VARIABLES GLOBALES
// ========================================
let facturaActual = null;
let productosActuales = [];
let filtroActual = 'todos';
let productoEnBusqueda = null;

// ========================================
// INICIALIZACIÓN
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    const facturaId = obtenerParametroURL('id');
    if (facturaId) {
        cargarFactura(facturaId);
    } else {
        mostrarError('No se especificó factura para relacionar');
    }

    configurarEventos();
});

function configurarEventos() {
    // Filtros
    document.getElementById('filtro-todos')?.addEventListener('click', () => filtrarProductos('todos'));
    document.getElementById('filtro-pendientes')?.addEventListener('click', () => filtrarProductos('pendientes'));
    document.getElementById('filtro-relacionados')?.addEventListener('click', () => filtrarProductos('relacionados'));
    document.getElementById('filtro-ignorados')?.addEventListener('click', () => filtrarProductos('ignorados'));

    // Búsqueda
    document.getElementById('buscarProductoInput')?.addEventListener('input', buscarEnAlegra);

    // Cerrar modal
    document.addEventListener('click', function (event) {
        const modal = document.getElementById('modalBuscarProducto');
        if (event.target === modal) {
            cerrarModalBuscar();
        }
    });
}

// ========================================
// CARGAR DATOS
// ========================================
async function cargarFactura(facturaId) {
    try {
        const response = await fetch('/api/facturas/PROCESADA');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error cargando facturas');
        }

        facturaActual = data.facturas.find(f => f.id === facturaId);
        if (!facturaActual) {
            throw new Error('Factura no encontrada');
        }

        productosActuales = facturaActual.productos || [];

        mostrarInformacionFactura();
        mostrarProgreso();
        mostrarProductos();

    } catch (error) {
        console.error('Error cargando factura:', error);
        mostrarError('Error cargando la factura: ' + error.message);
    }
}

// ========================================
// MOSTRAR INFORMACIÓN
// ========================================
function mostrarInformacionFactura() {
    const header = document.getElementById('facturaHeader');
    if (!header) return;

    header.innerHTML = `
        <div class="factura-info-header">
            <div class="factura-principal">
                <h1>📄 Factura ${facturaActual.numeroConsecutivo}</h1>
                <div class="factura-detalles">
                    <div class="detalle-item">
                        <span class="label">Proveedor:</span>
                        <span class="value">${facturaActual.proveedorNombre}</span>
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
        </div>
    `;
}

function mostrarProgreso() {
    const total = productosActuales.length;
    const relacionados = productosActuales.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
    const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0;

    // Actualizar barra de progreso
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) progressFill.style.width = `${porcentaje}%`;
    if (progressText) progressText.textContent = `${porcentaje}% completado`;

    // Mostrar botón de finalizar si está completo
    if (porcentaje === 100) {
        const accionesFinales = document.getElementById('accionesFinales');
        if (accionesFinales) {
            accionesFinales.style.display = 'block';
            accionesFinales.innerHTML = `
                <div class="action-buttons">
                    <a href="precios.html?id=${facturaActual.id}" class="btn success">💰 Revisar Precios</a>
                    <a href="facturas.html" class="btn btn-secondary">📄 Ver Otras Facturas</a>
                </div>
            `;
        }
    }
}

function mostrarProductos() {
    const container = document.getElementById('listaProductos');
    if (!container) return;

    const productosFiltrados = filtrarProductosPorEstado(productosActuales, filtroActual);

    if (productosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay productos ${filtroActual === 'todos' ? '' : filtroActual}</h3>
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
                    <span>Código: ${producto.codigoProveedor}</span>
                    <span>Cantidad: ${producto.cantidad} ${producto.unidadMedida}</span>
                    <span>₡${formatearNumero(producto.precioUnitario)} c/u</span>
                </div>
            </div>
            
            ${mostrarRelacionado(producto)}
            ${mostrarAcciones(producto)}
        </div>
    `).join('');

    container.innerHTML = html;
}

function mostrarRelacionado(producto) {
    if (producto.estadoRelacionado === 'RELACIONADO' && producto.mapeo) {
        return `
            <div class="relacionado-exitoso">
                <strong>${producto.mapeo.alegraName}</strong>
                <span class="confianza">${Math.round(producto.confianza || 100)}% confianza</span>
            </div>
        `;
    } else if (producto.estadoRelacionado === 'PENDIENTE') {
        return `<div class="relacionado-pendiente">🔍 Necesita relacionar</div>`;
    } else if (producto.estadoRelacionado === 'IGNORADO') {
        return `<div class="relacionado-ignorado">❌ Ignorado</div>`;
    }
    return '';
}

function mostrarAcciones(producto) {
    if (producto.estadoRelacionado === 'RELACIONADO') {
        return `
        <div class="producto-acciones">
            <button onclick="ajustarCantidadPrecio('${producto.id}')" class="btn-action info">
                ⚙️ Ajustar Cantidad/Precio
            </button>
            <button onclick="desconectarProducto('${producto.id}')" class="btn-action warning">
                🔓 Desconectar
            </button>
        </div>
    `;
    } else if (producto.estadoRelacionado === 'PENDIENTE') {
        return `
            <div class="producto-acciones">
                <button onclick="abrirBusquedaManual('${producto.id}')" class="btn-action primary">
                    🔍 Buscar Producto
                </button>
                <button onclick="ignorarProducto('${producto.id}')" class="btn-action warning">
                    ❌ Ignorar
                </button>
            </div>
        `;
    } else if (producto.estadoRelacionado === 'IGNORADO') {
        return `
            <div class="producto-acciones">
                <button onclick="reactivarProducto('${producto.id}')" class="btn-action">
                    🔄 Reactivar
                </button>
            </div>
        `;
    }
    return '';
}

// ========================================
// FILTROS
// ========================================
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
        case 'pendientes': return productos.filter(p => p.estadoRelacionado === 'PENDIENTE');
        case 'relacionados': return productos.filter(p => p.estadoRelacionado === 'RELACIONADO');
        case 'ignorados': return productos.filter(p => p.estadoRelacionado === 'IGNORADO');
        default: return productos;
    }
}

// ========================================
// BÚSQUEDA MANUAL
// ========================================
function abrirBusquedaManual(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) {
        mostrarNotificacion('Producto no encontrado', 'error');
        return;
    }

    productoEnBusqueda = producto;

    // Mostrar información del producto en el modal
    const infoContainer = document.getElementById('infoProductoActual');
    if (infoContainer) {
        infoContainer.innerHTML = `
            <div class="producto-info-modal">
                <h4>${producto.descripcion}</h4>
                <div class="detalles-modal">
                    <span><strong>Código:</strong> ${producto.codigoProveedor}</span>
                    <span><strong>Cantidad:</strong> ${producto.cantidad} ${producto.unidadMedida}</span>
                    <span><strong>Precio:</strong> ₡${formatearNumero(producto.precioUnitario)}</span>
                </div>
            </div>
        `;
    }

    // Limpiar búsqueda anterior
    const inputBuscar = document.getElementById('buscarProductoInput');
    const resultados = document.getElementById('resultadosBusqueda');

    if (inputBuscar) inputBuscar.value = '';
    if (resultados) {
        resultados.innerHTML = '<p style="text-align: center; color: #666;">Escribe para buscar productos...</p>';
    }

    // Mostrar modal
    const modal = document.getElementById('modalBuscarProducto');
    if (modal) {
        modal.style.display = 'block';
        // Focus en el input después de un momento
        setTimeout(() => {
            if (inputBuscar) inputBuscar.focus();
        }, 300);
    }
}

// Variable global para el debounce
let searchTimeout = null;

async function buscarEnAlegra() {
    const inputElement = document.getElementById('buscarProductoInput');
    const resultadosContainer = document.getElementById('resultadosBusqueda');

    if (!inputElement || !resultadosContainer) return;

    const termino = inputElement.value.trim();

    if (termino.length < 2) {
        resultadosContainer.innerHTML = '<p>🔤 Escribe al menos 2 caracteres...</p>';
        return;
    }

    // ✅ CANCELAR BÚSQUEDA ANTERIOR
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // ✅ MOSTRAR ESTADO DE ESPERA
    resultadosContainer.innerHTML = '<div class="loading-small">🔍 Buscando...</div>';

    // ✅ NUEVA BÚSQUEDA CON DELAY DE 500ms
    searchTimeout = setTimeout(async () => {
        try {
            console.log(`🔍 Ejecutando búsqueda: "${termino}"`);

            const response = await fetch(`/api/buscar-productos?q=${encodeURIComponent(termino)}`);
            const data = await response.json();

            if (data.success && data.productos?.length > 0) {
                mostrarResultadosBusqueda(data.productos, termino);
            } else {
                resultadosContainer.innerHTML = `<p>❌ No se encontraron productos con "${termino}"</p>`;
            }

        } catch (error) {
            console.error('Error en búsqueda:', error);
            resultadosContainer.innerHTML = '<p>❌ Error en la búsqueda</p>';
        }
    }, 500); // ← 500ms de delay
}

function mostrarResultadosBusqueda(productos, termino) {
    const container = document.getElementById('resultadosBusqueda');
    if (!container) return;

    const html = `
        <div class="search-header">
            <h4>📋 ${productos.length} productos encontrados</h4>
        </div>
        <div class="resultados-lista">
            ${productos.map((producto, index) => `
                <div class="resultado-busqueda" data-alegra-id="${producto.id}" data-nombre="${escaparTexto(producto.name)}" data-index="${index}" onclick="seleccionarProductoDesdeElemento(this)">
                    <div class="resultado-info">
                        <div class="resultado-nombre">${resaltarTermino(producto.name, termino)}</div>
                        <div class="resultado-detalles">
                            <span>Ref: ${producto.reference || 'N/A'}</span>
                            <span>₡${formatearNumero(producto.price || 0)}</span>
                        </div>
                    </div>
                    <button class="btn-mini primary">✅ Seleccionar</button>
                </div>
            `).join('')}
        </div>
    `;

    container.innerHTML = html;
}

// ========================================
// ACCIONES PRINCIPALES - CORREGIDAS
// ========================================
async function seleccionarProductoAlegra(alegraId, nombre, index) {
    // VALIDACIÓN ROBUSTA
    if (!alegraId || !nombre || !productoEnBusqueda) {
        console.error('Parámetros inválidos:', { alegraId, nombre, productoEnBusqueda });
        mostrarNotificacion('Error: Datos inválidos para seleccionar producto', 'error');
        return;
    }

    try {
        console.log(`✅ Seleccionando: ${nombre} (${alegraId}) para producto ${productoEnBusqueda.id}`);

        // Deshabilitar botón mientras se procesa
        const botones = document.querySelectorAll('.resultado-busqueda .btn-mini');
        if (botones[index]) {
            botones[index].innerHTML = '⏳ Confirmando...';
            botones[index].disabled = true;
        }

        const response = await fetch('/api/confirmar-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error || 'Error relacionando producto');
        }

    } catch (error) {
        console.error('Error relacionando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');

        // Restaurar botón
        const botones = document.querySelectorAll('.resultado-busqueda .btn-mini');
        if (botones[index]) {
            botones[index].innerHTML = '✅ Seleccionar';
            botones[index].disabled = false;
        }
    }
}

function seleccionarProductoDesdeElemento(elemento) {
    const alegraId = elemento.getAttribute('data-alegra-id');
    const nombre = elemento.getAttribute('data-nombre');
    const index = parseInt(elemento.getAttribute('data-index'));

    seleccionarProductoAlegra(alegraId, nombre, index);
}

async function ignorarProducto(productoId) {
    try {
        const response = await fetch('/api/rechazar-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productoId })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('✅ Producto ignorado', 'success');
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error);
        }

    } catch (error) {
        console.error('Error ignorando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    }
}

async function reactivarProducto(productoId) {
    try {
        const response = await fetch('/api/rechazar-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productoId,
                accion: 'reactivar'
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('✅ Producto reactivado', 'success');
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error);
        }

    } catch (error) {
        console.error('Error reactivando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    }
}

async function desconectarProducto(productoId) {
    try {
        const response = await fetch('/api/rechazar-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productoId,
                accion: 'desconectar'
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('✅ Producto desconectado', 'success');
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error);
        }

    } catch (error) {
        console.error('Error desconectando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    }
}

// ========================================
// AJUSTE DE CANTIDAD Y PRECIO
// ========================================
function ajustarCantidadPrecio(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) {
        mostrarNotificacion('Producto no encontrado', 'error');
        return;
    }

    // Usar el modal existente pero cambiar el contenido
    document.querySelector('#modalBuscarProducto .modal-title').innerHTML =
        '<i class="bi bi-gear"></i> Ajustar Cantidad y Precio';

    // Mostrar información del producto
    document.getElementById('infoProductoActual').innerHTML = `
        <div class="producto-info-modal">
            <h4>${producto.descripcion}</h4>
            <div class="row">
                <div class="col-md-4"><strong>Código:</strong> ${producto.codigoProveedor}</div>
                <div class="col-md-4"><strong>Cantidad actual:</strong> ${producto.cantidad} ${producto.unidadMedida}</div>
                <div class="col-md-4"><strong>Precio actual:</strong> ₡${formatearNumero(producto.precioUnitario)}</div>
            </div>
        </div>
    `;

    // Cambiar el contenido del área de búsqueda por el formulario de ajuste
    document.getElementById('resultadosBusqueda').innerHTML = `
        <div class="ajuste-form">
            <h5>Ajustar cantidades y precios</h5>
            <div class="row">
                <div class="col-md-6">
                    <label class="form-label">Nueva cantidad:</label>
                    <input type="number" id="nuevaCantidad" class="form-control" 
                           value="${producto.cantidad}" step="0.01" min="0.01">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Nuevo precio unitario:</label>
                    <input type="number" id="nuevoPrecio" class="form-control" 
                           value="${producto.precioUnitario}" step="0.01" min="0.01">
                </div>
            </div>
            <div class="mt-3">
                <button onclick="guardarAjuste('${producto.id}')" class="btn btn-success">
                    ✅ Guardar Cambios
                </button>
                <button onclick="cerrarModalBuscar()" class="btn btn-secondary ms-2">
                    ❌ Cancelar
                </button>
            </div>
        </div>
    `;

    // Ocultar el buscador
    document.querySelector('#modalBuscarProducto .mb-4:nth-child(2)').style.display = 'none';

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalBuscarProducto'));
    modal.show();
}

async function guardarAjuste(productoId) {
    const nuevaCantidad = parseFloat(document.getElementById('nuevaCantidad').value);
    const nuevoPrecio = parseFloat(document.getElementById('nuevoPrecio').value);

    // Validaciones básicas
    if (isNaN(nuevaCantidad) || nuevaCantidad <= 0) {
        mostrarNotificacion('❌ La cantidad debe ser mayor a 0', 'error');
        return;
    }

    if (isNaN(nuevoPrecio) || nuevoPrecio <= 0) {
        mostrarNotificacion('❌ El precio debe ser mayor a 0', 'error');
        return;
    }

    try {
        const response = await fetch('/api/ajustar-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productoId: productoId,
                nuevaCantidad: nuevaCantidad,
                nuevoPrecio: nuevoPrecio
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion(`✅ Ajuste guardado: ${nuevaCantidad} × ₡${formatearNumero(nuevoPrecio)}`, 'success');
            cerrarModalBuscar();

            // Recargar la factura para mostrar los cambios
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error || 'Error guardando ajuste');
        }

    } catch (error) {
        console.error('Error guardando ajuste:', error);
        mostrarNotificacion('❌ Error guardando cambios', 'error');
    }
}

// ========================================
// UTILIDADES
// ========================================
function cerrarModalBuscar() {
    const modal = document.getElementById('modalBuscarProducto');
    if (modal) {
        modal.style.display = 'none';
    }
    productoEnBusqueda = null;
}

function obtenerParametroURL(parametro) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(parametro);
}

function formatearNumero(numero) {
    return new Intl.NumberFormat('es-CR').format(numero);
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

function getEstadoTexto(estado) {
    const textos = {
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

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion ${tipo}`;
    notificacion.textContent = mensaje;

    document.body.appendChild(notificacion);

    setTimeout(() => notificacion.classList.add('mostrar'), 100);
    setTimeout(() => {
        notificacion.classList.remove('mostrar');
        setTimeout(() => {
            if (document.body.contains(notificacion)) {
                document.body.removeChild(notificacion);
            }
        }, 300);
    }, 3000);
}

function mostrarError(mensaje) {
    const container = document.querySelector('.container');
    if (container) {
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
}