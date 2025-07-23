// js/facturas.js - Lista y búsqueda de facturas
// Sistema de Facturas CR - Vista para buscar facturas por número

let todasLasFacturas = [];
let facturasFiltradas = [];
let paginaActual = 1;
let facturasPorPagina = 10;

/**
 * INICIALIZACIÓN
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 Iniciando vista de facturas...');
    cargarFacturas();
    configurarEventos();
});

/**
 * CONFIGURAR EVENTOS
 */
function configurarEventos() {
    // Búsqueda en tiempo real
    const buscarInput = document.getElementById('buscarFactura');
    let timeoutBusqueda = null;
    
    buscarInput.addEventListener('input', function() {
        clearTimeout(timeoutBusqueda);
        timeoutBusqueda = setTimeout(buscarFacturas, 500); // Buscar después de 500ms de inactividad
    });
    
    // Enter para buscar
    buscarInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            buscarFacturas();
        }
    });
}

/**
 * CARGAR FACTURAS INICIALES
 */
async function cargarFacturas() {
    try {
        console.log('📄 Cargando todas las facturas...');
        
        mostrarCargando();
        
        // Obtener facturas por estado (por defecto PROCESADA)
        const response = await fetch('/api/facturas/PROCESADA');
        const data = await response.json();
        
        if (data.success) {
            todasLasFacturas = data.facturas || [];
            facturasFiltradas = [...todasLasFacturas];
            
            console.log(`✅ ${todasLasFacturas.length} facturas cargadas`);
            
            mostrarFacturas();
            actualizarInfoResultados();
            
        } else {
            throw new Error(data.error || 'Error cargando facturas');
        }
        
    } catch (error) {
        console.error('❌ Error cargando facturas:', error);
        mostrarError('Error cargando las facturas. Verifique la conexión.');
    }
}

/**
 * BUSCAR FACTURAS
 */
function buscarFacturas() {
    const termino = document.getElementById('buscarFactura').value.toLowerCase().trim();
    const estadoFiltro = document.getElementById('filtroEstado').value;
    const proveedorFiltro = document.getElementById('filtroProveedor').value.toLowerCase().trim();
    
    console.log(`🔍 Buscando: "${termino}", Estado: ${estadoFiltro}, Proveedor: "${proveedorFiltro}"`);
    
    facturasFiltradas = todasLasFacturas.filter(factura => {
        // Filtro por término de búsqueda
        const coincideTermino = !termino || 
            factura.numeroConsecutivo.toLowerCase().includes(termino) ||
            factura.clave.toLowerCase().includes(termino) ||
            factura.proveedorNombre.toLowerCase().includes(termino);
        
        // Filtro por estado
        const coincideEstado = estadoFiltro === 'TODAS' || factura.estado === estadoFiltro;
        
        // Filtro por proveedor
        const coincideProveedor = !proveedorFiltro || 
            factura.proveedorNombre.toLowerCase().includes(proveedorFiltro);
        
        return coincideTermino && coincideEstado && coincideProveedor;
    });
    
    // Resetear paginación
    paginaActual = 1;
    
    mostrarFacturas();
    actualizarInfoResultados();
    
    console.log(`📊 ${facturasFiltradas.length} facturas encontradas`);
}

/**
 * MOSTRAR FACTURAS
 */
function mostrarFacturas() {
    const container = document.getElementById('listaFacturas');
    
    if (facturasFiltradas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No se encontraron facturas</h3>
                <p>Intenta ajustar los filtros de búsqueda.</p>
                <button onclick="limpiarFiltros()" class="btn">Limpiar Filtros</button>
            </div>
        `;
        document.getElementById('paginacion').style.display = 'none';
        return;
    }
    
    // Calcular paginación
    const inicio = (paginaActual - 1) * facturasPorPagina;
    const fin = inicio + facturasPorPagina;
    const facturasPagina = facturasFiltradas.slice(inicio, fin);
    
    const html = facturasPagina.map(factura => {
        const progreso = calcularProgreso(factura);
        
        return `
            <div class="factura-item" onclick="abrirFactura('${factura.id}')">
                <div class="factura-main">
                    <div class="factura-header">
                        <div class="numero-factura">${factura.numeroConsecutivo}</div>
                        <div class="fecha-factura">${formatearFecha(factura.fechaEmision)}</div>
                        <div class="estado-badge ${getEstadoBadgeClass(factura.estado)}">${getEstadoTexto(factura.estado)}</div>
                    </div>
                    
                    <div class="factura-info">
                        <div class="proveedor-info">
                            <strong>${factura.proveedorNombre}</strong>
                            <span class="cedula">Cédula: ${factura.proveedorCedula}</span>
                        </div>
                        <div class="monto-factura">₡${formatearNumero(factura.totalFactura)}</div>
                    </div>
                    
                    <div class="productos-info">
                        <span class="total-productos">${factura.totalProductos} productos</span>
                        <div class="progreso-container">
                            <div class="progress-bar-small">
                                <div class="progress-fill" style="width: ${progreso.porcentaje}%"></div>
                            </div>
                            <span class="progreso-texto">${progreso.relacionados}/${progreso.total} relacionados</span>
                        </div>
                    </div>
                </div>
                
                <div class="factura-actions">
                    <button class="btn-action primary" onclick="event.stopPropagation(); relacionarProductos('${factura.id}')">
                        🔗 Relacionar Productos
                    </button>
                    ${progreso.porcentaje === 100 ? `
                        <button class="btn-action success" onclick="event.stopPropagation(); revisarPrecios('${factura.id}')">
                            💰 Revisar Precios
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
    
    // Mostrar/ocultar paginación
    mostrarPaginacion();
}

/**
 * ACCIONES DE FACTURAS
 */
function abrirFactura(facturaId) {
    console.log(`🔍 Abriendo factura: ${facturaId}`);
    // Simplemente redirigir a relacionar productos
    relacionarProductos(facturaId);
}

function relacionarProductos(facturaId) {
    console.log(`🔗 Relacionando productos de factura: ${facturaId}`);
    window.location.href = `relacionar.html?id=${facturaId}`;
}

function revisarPrecios(facturaId) {
    console.log(`💰 Revisando precios de factura: ${facturaId}`);
    window.location.href = `precios.html?id=${facturaId}`;
}

/**
 * PAGINACIÓN
 */
function mostrarPaginacion() {
    const totalPaginas = Math.ceil(facturasFiltradas.length / facturasPorPagina);
    const paginacionContainer = document.getElementById('paginacion');
    
    if (totalPaginas <= 1) {
        paginacionContainer.style.display = 'none';
        return;
    }
    
    paginacionContainer.style.display = 'flex';
    
    // Actualizar botones
    document.getElementById('btnAnterior').disabled = paginaActual === 1;
    document.getElementById('btnSiguiente').disabled = paginaActual === totalPaginas;
    
    // Actualizar info
    document.getElementById('infoPagina').textContent = `Página ${paginaActual} de ${totalPaginas}`;
}

function cambiarPagina(direccion) {
    const totalPaginas = Math.ceil(facturasFiltradas.length / facturasPorPagina);
    
    paginaActual += direccion;
    
    if (paginaActual < 1) paginaActual = 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    
    mostrarFacturas();
    
    // Scroll al top
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
}

/**
 * FILTROS
 */
function limpiarFiltros() {
    document.getElementById('buscarFactura').value = '';
    document.getElementById('filtroEstado').value = 'TODAS';
    document.getElementById('filtroProveedor').value = '';
    
    facturasFiltradas = [...todasLasFacturas];
    paginaActual = 1;
    
    mostrarFacturas();
    actualizarInfoResultados();
    
    console.log('🧹 Filtros limpiados');
}

/**
 * UI Y UTILIDADES
 */
function mostrarCargando() {
    const container = document.getElementById('listaFacturas');
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Cargando facturas...</p>
        </div>
    `;
}

function mostrarError(mensaje) {
    const container = document.getElementById('listaFacturas');
    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">❌</div>
            <h3>Error de Conexión</h3>
            <p>${mensaje}</p>
            <button onclick="cargarFacturas()" class="btn">Reintentar</button>
        </div>
    `;
}

function actualizarInfoResultados() {
    const info = document.getElementById('resultadosInfo');
    const total = facturasFiltradas.length;
    
    if (total === 0) {
        info.textContent = 'No se encontraron resultados';
    } else if (total === 1) {
        info.textContent = '1 factura encontrada';
    } else {
        info.textContent = `${total} facturas encontradas`;
    }
}

function calcularProgreso(factura) {
    const total = factura.productos?.length || 0;
    const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO')?.length || 0;
    const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0;
    
    return {
        total,
        relacionados,
        porcentaje
    };
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
        'COMPLETADA': '✅ Completa'
    };
    return textos[estado] || estado;
}

/**
 * ACTUALIZAR FACTURAS VIA GITHUB ACTION
 */
async function actualizarFacturas() {
    const btn = document.getElementById('btnActualizar');
    
    // Cambiar estado del botón
    btn.disabled = true;
    btn.innerHTML = '⏳ Ejecutando...';
    
    try {
        const response = await fetch('https://api.github.com/repos/Andrescr25/sistema-facturas-cr/actions/workflows/actualizar-facturas.yml/dispatches', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer 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',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        if (response.ok) {
            btn.innerHTML = '✅ Ejecutado!';
            setTimeout(() => {
                btn.innerHTML = '🔄 Actualizar Facturas';
                btn.disabled = false;
            }, 3000);
        } else {
            throw new Error(`Error: ${response.status}`);
        }
    } catch (error) {
        console.error('Error:', error);
        btn.innerHTML = '❌ Error';
        setTimeout(() => {
            btn.innerHTML = '🔄 Actualizar Facturas';
            btn.disabled = false;
        }, 3000);
    }
}