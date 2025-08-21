// ========================================
// FUNCIONES PARA CREAR PRODUCTO NUEVO
// ========================================

// Variable global para el producto en creación
let productoEnCreacion = null;

/**
 * Abre el modal para crear un producto nuevo
 */
function abrirModalCrearProducto(productoId) {
    const producto = productosActuales.find(p => p.id === productoId);
    if (!producto) {
        mostrarNotificacion('Producto no encontrado', 'error');
        return;
    }

    productoEnCreacion = producto;

    // Mostrar información del producto proveedor
    document.getElementById('infoProductoProveedor').innerHTML = `
        <h5><i class="bi bi-truck"></i> Datos del Proveedor</h5>
        <div class="row">
            <div class="col-md-4">
                <strong>Descripción:</strong><br>
                <span class="text-primary">${producto.descripcion}</span>
            </div>
            <div class="col-md-4">
                <strong>Código Proveedor:</strong><br>
                <code>${producto.codigoProveedor}</code>
            </div>
            <div class="col-md-4">
                <strong>Cantidad:</strong><br>
                ${producto.cantidad} ${producto.unidadMedida}
            </div>
        </div>
        <div class="row mt-2">
            <div class="col-md-4">
                <strong>Precio Unitario:</strong><br>
                <span class="text-success">₡${formatearNumero(producto.precioUnitario)}</span>
            </div>
            <div class="col-md-4">
                <strong>Total Línea:</strong><br>
                ₡${formatearNumero(producto.totalLinea)}
            </div>
            <div class="col-md-4">
                <strong>Impuesto:</strong><br>
                ₡${formatearNumero(producto.impuesto || 0)}
            </div>
        </div>
    `;

    // Pre-cargar datos en el formulario
    document.getElementById('nombreProducto').value = producto.descripcion;
    document.getElementById('descripcionProducto').value = producto.descripcion;
    document.getElementById('referenciaProducto').value = producto.codigoProveedor;
    document.getElementById('precioVenta').value = producto.precioUnitario;
    document.getElementById('costoProducto').value = producto.precioUnitario;
    document.getElementById('cantidadInicial').value = producto.cantidad || 0;

    // Mapear unidad de medida
    const unidadMapeada = mapearUnidadMedida(producto.unidadMedida);
    document.getElementById('unidadProducto').value = unidadMapeada;

    // ✅ CARGAR CATEGORÍAS
    cargarCategoriasAlegra();

    // Limpiar imagen anterior
    removerImagen();

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalCrearProducto'));
    modal.show();

    // Focus en el nombre
    setTimeout(() => {
        document.getElementById('nombreProducto').focus();
        document.getElementById('nombreProducto').select();
    }, 300);
}

/**
 * ✅ FUNCIÓN FALTANTE: Mapea unidad de medida del proveedor a formato Alegra
 */
function mapearUnidadMedida(unidadProveedor) {
    const mapeo = {
        'unidad': 'unit',
        'und': 'unit', 
        'pieza': 'unit',
        'pza': 'unit',
        'metro': 'meter',
        'm': 'meter',
        'kilogramo': 'kilogram',
        'kg': 'kilogram',
        'gramo': 'gram',
        'g': 'gram',
        'litro': 'liter',
        'l': 'liter'
    };
    
    const unidadLower = (unidadProveedor || '').toLowerCase().trim();
    return mapeo[unidadLower] || 'unit';
}

/**
 * ✅ NUEVA FUNCIÓN: Carga las categorías de Alegra
 */
async function cargarCategoriasAlegra() {
    const selectCategorias = document.getElementById('categoriaProducto');

    try {
        selectCategorias.innerHTML = '<option value="">Cargando categorías...</option>';

        const response = await fetch('/api/alegra-categorias');
        const data = await response.json();

        if (data.success && data.categorias?.length > 0) {
            // Limpiar opciones
            selectCategorias.innerHTML = '<option value="">Selecciona una categoría...</option>';

            // Agregar categorías
            data.categorias.forEach(categoria => {
                const option = document.createElement('option');
                option.value = categoria.id;
                option.textContent = categoria.name;
                selectCategorias.appendChild(option);
            });

            // ✅ SELECCIONAR "Consumo" POR DEFECTO (ID: 2)
            selectCategorias.value = "2";

            console.log(`✅ ${data.categorias.length} categorías cargadas`);

        } else {
            throw new Error('No se encontraron categorías');
        }

    } catch (error) {
        console.error('❌ Error cargando categorías:', error);
        selectCategorias.innerHTML = `
            <option value="">Error cargando categorías</option>
            <option value="2">Consumo (por defecto)</option>
        `;
        selectCategorias.value = "2"; // Fallback
        mostrarNotificacion('⚠️ Error cargando categorías, usando "Consumo" por defecto', 'warning');
    }
}

/**
 * ✅ FUNCIÓN FALTANTE: Previsualiza imagen seleccionada
 */
function previsualizarImagen(input) {
    const file = input.files[0];
    if (!file) {
        removerImagen();
        return;
    }

    // Validar tamaño (2MB máximo)
    if (file.size > 2 * 1024 * 1024) {
        mostrarNotificacion('❌ La imagen debe ser menor a 2MB', 'error');
        input.value = '';
        removerImagen();
        return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
        mostrarNotificacion('❌ Solo se permiten archivos de imagen', 'error');
        input.value = '';
        removerImagen();
        return;
    }

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('imagenPreview').src = e.target.result;
        document.getElementById('previewImagen').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

/**
 * ✅ FUNCIÓN FALTANTE: Remueve imagen del preview
 */
function removerImagen() {
    document.getElementById('imagenProducto').value = '';
    document.getElementById('imagenPreview').src = '';
    document.getElementById('previewImagen').style.display = 'none';
}

/**
 * ✅ FUNCIÓN FALTANTE: Formatea números para Costa Rica
 */
function formatearNumero(numero) {
    return new Intl.NumberFormat('es-CR').format(numero);
}

/**
 * Crea el producto nuevo en Alegra
 */
async function crearProductoNuevo() {
    const form = document.getElementById('formCrearProducto');
    const btn = document.getElementById('btnCrearProducto');

    // Validar formulario
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Validaciones adicionales
    const nombre = document.getElementById('nombreProducto').value.trim();
    const precio = parseFloat(document.getElementById('precioVenta').value);
    const costo = parseFloat(document.getElementById('costoProducto').value);
    const categoria = document.getElementById('categoriaProducto').value;

    if (!nombre) {
        mostrarNotificacion('❌ El nombre del producto es obligatorio', 'error');
        document.getElementById('nombreProducto').focus();
        return;
    }

    if (precio <= 0) {
        mostrarNotificacion('❌ El precio debe ser mayor a 0', 'error');
        document.getElementById('precioVenta').focus();
        return;
    }

    if (costo <= 0) {
        mostrarNotificacion('❌ El costo debe ser mayor a 0', 'error');
        document.getElementById('costoProducto').focus();
        return;
    }

    // ✅ VALIDAR CATEGORÍA
    if (!categoria) {
        mostrarNotificacion('❌ Debes seleccionar una categoría', 'error');
        document.getElementById('categoriaProducto').focus();
        return;
    }

    try {
        // Deshabilitar botón
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creando...';
        btn.disabled = true;

        // Preparar datos del formulario
        const formData = new FormData();
        formData.append('name', nombre);
        formData.append('description', document.getElementById('descripcionProducto').value.trim());
        formData.append('reference', document.getElementById('referenciaProducto').value.trim());
        formData.append('unit', document.getElementById('unidadProducto').value);
        formData.append('price', precio);
        formData.append('cost', costo);
        formData.append('initialQuantity', document.getElementById('cantidadInicial').value || 0);

        // ✅ AGREGAR CATEGORÍA SELECCIONADA
        formData.append('category', categoria);

        // Datos del producto original para relacionar
        formData.append('productoOriginalId', productoEnCreacion.id);

        // Imagen si existe
        const imagenFile = document.getElementById('imagenProducto').files[0];
        if (imagenFile) {
            formData.append('image', imagenFile);
        }

        console.log('📤 Enviando datos para crear producto...');

        const response = await fetch('/api/crear-producto', {
            method: 'POST',
            body: formData // No establecer Content-Type, FormData lo hace automáticamente
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion(`✅ ${data.message}`, 'success');
            cerrarModalCrear();

            // Recargar la factura para ver el producto relacionado
            await cargarFactura(facturaActual.id);
        } else {
            throw new Error(data.error || 'Error creando producto');
        }

    } catch (error) {
        console.error('❌ Error creando producto:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
    } finally {
        // Restaurar botón
        btn.innerHTML = '<i class="bi bi-plus-circle"></i> Crear Producto';
        btn.disabled = false;
    }
}

/**
 * Cierra el modal de crear producto
 */
function cerrarModalCrear() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalCrearProducto'));
    if (modal) {
        modal.hide();
    }
    productoEnCreacion = null;

    // Limpiar formulario
    document.getElementById('formCrearProducto').reset();
    removerImagen();
}