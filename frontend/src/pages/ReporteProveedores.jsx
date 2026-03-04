import { useState, useEffect } from 'react'
import { Users, Package, ShoppingCart, AlertCircle, RefreshCw, FileText, Edit3, Download, Trash2, Brain, MessageCircle, Calendar, ArrowLeft } from 'lucide-react'
import { alegraService } from '../services/alegraService'
import api from '../services/api'

export default function ReporteProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [resumen, setResumen] = useState(null)
  const [encargosEspeciales, setEncargosEspeciales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // NUEVO: Navegación Principal
  const [proveedorActivoId, setProveedorActivoId] = useState(null)

  const [cantidadesModificadas, setCantidadesModificadas] = useState(new Map())
  const [cantidadesGuardadas, setCantidadesGuardadas] = useState(new Map())
  const [cantidadSugerida, setCantidadSugerida] = useState([])
  const [resumenSugerida, setResumenSugerida] = useState(null)
  const [proveedorQuery, setProveedorQuery] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')

  // Estados Modal Asignar Lotes
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false)
  const [proveedoresAlegra, setProveedoresAlegra] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState('')
  const [loadingProveedores, setLoadingProveedores] = useState(false)
  const [modalCrearProveedor, setModalCrearProveedor] = useState(false)
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set())
  const [preferenciasDatosProveedor, setPreferenciasDatosProveedor] = useState({})

  // Estados Edición Manual
  const [productosEliminados, setProductosEliminados] = useState(new Set())
  const [productosAgregados, setProductosAgregados] = useState(new Map())
  const [modalAgregarProducto, setModalAgregarProducto] = useState(false)
  const [proveedorParaAgregar, setProveedorParaAgregar] = useState(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosAlegra, setProductosAlegra] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)

  // Estados WhatsApp
  const [modalWhatsAppVisible, setModalWhatsAppVisible] = useState(false)
  const [proveedorParaWhatsApp, setProveedorParaWhatsApp] = useState(null)
  const [telefonoProveedor, setTelefonoProveedor] = useState('')

  useEffect(() => {
    loadReporte()
    loadCantidadesGuardadas()
  }, [fechaInicio])

  // Cargar cantidad sugerida automáticamente cuando entramos a un proveedor
  useEffect(() => {
    if (proveedorActivoId) {
      loadCantidadSugerida(proveedorActivoId)
    } else {
      setCantidadSugerida([])
      setResumenSugerida(null)
    }
  }, [proveedorActivoId])

  const loadReporte = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesProveedor(fechaInicio)

      if (result.success) {
        // Filtrar proveedores que NO tienen productos para limpiar la vista principal
        const proveedoresConProductos = result.data.filter(p => p.productos_faltantes && p.productos_faltantes.length > 0)
        setProveedores(proveedoresConProductos)
        setResumen(result.resumen)
        loadEncargosEspeciales()
      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadEncargosEspeciales = async () => {
    try {
      const result = await alegraService.getEncargosEspeciales()
      if (result.success) {
        setEncargosEspeciales(result.data)
      }
    } catch (err) {
      console.warn('Error cargando encargos especiales:', err)
    }
  }

  const loadCantidadesGuardadas = async () => {
    try {
      const result = await alegraService.getCantidadesModificadas()
      if (result.success) {
        const cantidadesMap = new Map()
        result.modificadas?.forEach(item => {
          const key = \`\${item.proveedor_nombre}-\${item.producto_codigo}\`
          cantidadesMap.set(key, {
            cantidad_original: item.cantidad_original,
            cantidad_modificada: item.cantidad_modificada
          })
        })
        setCantidadesGuardadas(cantidadesMap)

        const eliminados = new Set()
        result.eliminadas?.forEach(item => {
          const key = \`\${item.proveedor_nombre}-\${item.producto_codigo}\`
          eliminados.add(key)
        })
        setProductosEliminados(eliminados)

        const agregados = new Map()
        result.agregadas?.forEach(item => {
          const proveedorNombre = item.proveedor_nombre
          const productosDelProveedor = agregados.get(proveedorNombre) || []
          productosDelProveedor.push({
            codigo: item.producto_codigo,
            nombre: item.producto_nombre,
            cantidad: item.cantidad_modificada,
            agregadoManual: true
          })
          agregados.set(proveedorNombre, productosDelProveedor)
        })
        setProductosAgregados(agregados)
      }
    } catch (err) {
      console.warn('Error cargando cantidades guardadas:', err)
    }
  }

  const loadCantidadSugerida = async (proveedor_id) => {
    if (!proveedor_id || proveedor_id === 'null' || proveedor_id === 'undefined') {
      setCantidadSugerida([])
      setResumenSugerida(null)
      return
    }

    try {
      const result = await alegraService.getCantidadSugerida(proveedor_id)
      if (result.success) {
        setCantidadSugerida(result.data)
        setResumenSugerida(result.resumen)
      } else {
        setCantidadSugerida([])
        setResumenSugerida(null)
      }
    } catch (err) {
      console.error('Error cargando cantidad sugerida:', err)
      setCantidadSugerida([])
      setResumenSugerida(null)
    }
  }

  const usaDatosProveedor = (proveedorNombre) => {
    const preferencia = preferenciasDatosProveedor[proveedorNombre]
    return preferencia === undefined ? true : preferencia
  }

  const togglePreferenciaProveedor = (proveedorNombre, value) => {
    setPreferenciasDatosProveedor(prev => ({
      ...prev,
      [proveedorNombre]: value
    }))
  }

  const handleCantidadChange = (proveedorNombre, productoCodigo, nuevaCantidad) => {
    const key = \`\${proveedorNombre}-\${productoCodigo}\`
    const cantidadNum = parseInt(nuevaCantidad) || 0
    const nuevasCantidades = new Map(cantidadesModificadas)
    nuevasCantidades.set(key, cantidadNum)
    setCantidadesModificadas(nuevasCantidades)
  }

  const handleGuardarCantidades = async () => {
    if (cantidadesModificadas.size === 0) {
      alert('ℹ️ No hay cantidades modificadas para guardar.')
      return
    }

    try {
      setLoading(true)
      const cantidadesParaGuardar = []
      proveedores.forEach(proveedor => {
        proveedor.productos_faltantes.forEach(producto => {
          const key = \`\${proveedor.nombre}-\${producto.codigo}\`
          const cantidadModificada = cantidadesModificadas.get(key)
          if (cantidadModificada !== undefined) {
            cantidadesParaGuardar.push({
              proveedor_nombre: proveedor.nombre,
              producto_codigo: producto.codigo,
              producto_nombre: producto.nombre,
              cantidad_original: producto.cantidad_faltante,
              cantidad_modificada: cantidadModificada
            })
          }
        })
      })

      const result = await alegraService.guardarCantidadesModificadas(cantidadesParaGuardar)
      if (result.success) {
        await loadCantidadesGuardadas()
        setCantidadesModificadas(new Map())
        alert(\`✅ Cantidades guardadas correctamente\\n\\n• \${result.cantidades_guardadas} productos actualizados\`)
      } else {
        alert(\`❌ Error guardando cantidades: \${result.message}\`)
      }
    } catch (error) {
      alert(\`❌ Error guardando cantidades: \${error.message}\`)
    } finally {
      setLoading(false)
    }
  }

  const handleLimpiarCantidadesGuardadas = async () => {
    if (cantidadesGuardadas.size === 0) return
    if (!window.confirm('¿Deseas volver las cantidades modificadas a sus valores originales?')) return

    try {
      setLoading(true)
      const result = await alegraService.limpiarCantidadesModificadas()
      if (result.success) {
        setCantidadesGuardadas(new Map())
        setCantidadesModificadas(new Map())
        alert('Cantidades restauradas.')
      }
    } catch (error) {
      alert(\`Error reseteando cantidades: \${error.message}\`)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerarPDF = async (proveedor, source = 'orden') => {
    try {
      setLoading(true)
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)
      let productosParaPDF = []

      if (source === 'orden') {
        productosParaPDF = proveedor.productos_faltantes
          .filter(producto => !productosEliminados.has(\`\${proveedor.nombre}-\${producto.codigo}\`))
          .map(producto => {
            const key = \`\${proveedor.nombre}-\${producto.codigo}\`
            const mod = cantidadesModificadas.get(key)
            const guardada = cantidadesGuardadas.get(key)
            const cantFinal = mod !== undefined ? mod : (guardada ? guardada.cantidad_modificada : producto.cantidad_faltante)
            const factorConversion = producto.factor_conversion || 1
            const cantProv = factorConversion !== 1 ? Math.ceil(cantFinal / factorConversion) : cantFinal
            
            return {
              codigo: producto.codigo_proveedor || producto.codigo,
              nombre: producto.nombre_proveedor || producto.nombre,
              codigoInterno: producto.codigo,
              nombreInterno: producto.nombre,
              codigoProveedor: producto.codigo_proveedor || null,
              nombreProveedor: producto.nombre_proveedor || producto.nombre,
              cantidad: cantProv,
              cantidadOriginal: cantFinal,
              factorConversion: factorConversion,
              observaciones: producto.observaciones || '',
              descripcionFactura: producto.descripcion_factura || ''
            }
          })
          .filter(p => p.cantidad > 0)
        
        const agregados = productosAgregados.get(proveedor.nombre) || []
        agregados.forEach(p => {
          productosParaPDF.push({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad })
        })

      } else if (source === 'sugerida') {
        productosParaPDF = cantidadSugerida.map(p => ({
          codigo: p.codigo_proveedor || p.producto_codigo,
          nombre: p.nombre_proveedor || p.producto_nombre,
          codigoInterno: p.producto_codigo,
          nombreInterno: p.producto_nombre,
          codigoProveedor: p.codigo_proveedor || null,
          nombreProveedor: p.nombre_proveedor || p.producto_nombre,
          cantidad: p.cantidad_sugerida,
          observaciones: p.observaciones || '',
          descripcionFactura: p.descripcion_factura || ''
        }))
      }

      if (productosParaPDF.length === 0) {
        alert('⚠️ No hay productos para generar la orden de compra')
        return
      }

      const blob = await alegraService.generarPDFOrdenCompra(proveedor.nombre, productosParaPDF, preferirDatosProveedor)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const typeStr = source === 'sugerida' ? 'sugerida' : 'orden'
      a.download = \`\${typeStr}-\${proveedor.nombre.replace(/\\s+/g, '-')}.pdf\`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      alert(\`✅ PDF generado para \${proveedor.nombre}\`)
    } catch (error) {
      alert(\`❌ Error generando PDF: \${error.message}\`)
    } finally {
      setLoading(false)
    }
  }

  const abrirModalWhatsApp = async (proveedor) => {
    setProveedorParaWhatsApp(proveedor)
    setModalWhatsAppVisible(true)
    try {
      const telefonoDB = await alegraService.getTelefonoProveedor(proveedor.nombre)
      if (telefonoDB) {
        setTelefonoProveedor(telefonoDB)
      } else {
        const telefonoLocal = localStorage.getItem(\`whatsapp_tel_\${proveedor.nombre}\`)
        setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
      }
    } catch (error) {
      const telefonoLocal = localStorage.getItem(\`whatsapp_tel_\${proveedor.nombre}\`)
      setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
    }
  }

  const enviarWhatsApp = async () => {
    if (!telefonoProveedor.trim()) {
      alert('⚠️ Ingresa el número de teléfono del proveedor')
      return
    }

    try {
      setLoading(true)
      const proveedor = proveedorParaWhatsApp
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)

      const productosParaPDF = proveedor.productos_faltantes
        .filter(producto => !productosEliminados.has(\`\${proveedor.nombre}-\${producto.codigo}\`))
        .map(producto => {
          const key = \`\${proveedor.nombre}-\${producto.codigo}\`
          const mod = cantidadesModificadas.get(key)
          const guardada = cantidadesGuardadas.get(key)
          const cantFinal = mod !== undefined ? mod : (guardada ? guardada.cantidad_modificada : producto.cantidad_faltante)
          const factorConversion = producto.factor_conversion || 1
          const cantProv = factorConversion !== 1 ? Math.ceil(cantFinal / factorConversion) : cantFinal

          return {
            codigo: producto.codigo_proveedor || producto.codigo,
            nombre: producto.nombre_proveedor || producto.nombre,
            cantidad: cantProv,
            factorConversion: factorConversion,
            observaciones: producto.observaciones || '',
            descripcionFactura: producto.descripcion_factura || ''
          }
        }).filter(p => p.cantidad > 0)

      const agregados = productosAgregados.get(proveedor.nombre) || []
      agregados.forEach(p => {
        productosParaPDF.push({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad })
      })

      if (productosParaPDF.length === 0) {
        alert('⚠️ No hay productos para enviar')
        return
      }

      const blob = await alegraService.generarPDFOrdenCompra(proveedor.nombre, productosParaPDF, preferirDatosProveedor)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = \`orden-compra-\${proveedor.nombre.replace(/\\s+/g, '-')}.pdf\`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      let telefono = telefonoProveedor.replace(/[\\s\\-\\(\\)]/g, '')
      if (!telefono.startsWith('+') && !telefono.startsWith('506')) telefono = '506' + telefono
      if (telefono.startsWith('+')) telefono = telefono.substring(1)

      const mensaje = encodeURIComponent(\`Hola buenas, me puedes hacer proforma de esto, Gracias\`)
      
      alert('📥 Descargando PDF... WhatsApp se abrirá en 7 segundos.')
      await new Promise(resolve => setTimeout(resolve, 7000))
      
      const whatsappUrl = \`https://wa.me/\${telefono}?text=\${mensaje}\`
      window.open(whatsappUrl, '_blank')

      try {
        await alegraService.guardarTelefonoProveedor(proveedor.nombre, telefonoProveedor, proveedor.cedula)
        localStorage.setItem(\`whatsapp_tel_\${proveedor.nombre}\`, telefonoProveedor)
      } catch (e) {
        localStorage.setItem(\`whatsapp_tel_\${proveedor.nombre}\`, telefonoProveedor)
      }

      setModalWhatsAppVisible(false)
      alert(\`✅ PDF descargado. Ahora adjunta el PDF en WhatsApp.\`)
    } catch (error) {
      alert(\`❌ Error: \${error.message}\`)
    } finally {
      setLoading(false)
    }
  }

  const handleLimpiarVista = async () => {
    if (proveedores.length === 0) return
    if (!window.confirm('⚠️ ATENCIÓN:\\nSe eliminarán los faltantes pendientes localmente. ¿Proceder?')) return

    try {
      setLoading(true)
      await alegraService.limpiarFaltantesProveedor()
      setProveedores([])
      setResumen(null)
      setEncargosEspeciales([])
      alert('✅ Datos eliminados localmente.')
    } catch (error) {
      alert(\`❌ Error eliminando datos: \${error.message}\`)
    } finally {
      setLoading(false)
    }
  }

  const getCantidadFinal = (proveedorNombre, productoCodigo, cantidadOriginal) => {
    const key = \`\${proveedorNombre}-\${productoCodigo}\`
    const cantidadModificada = cantidadesModificadas.get(key)
    const cantidadGuardada = cantidadesGuardadas.get(key)
    return cantidadModificada !== undefined ? cantidadModificada : (cantidadGuardada ? cantidadGuardada.cantidad_modificada : cantidadOriginal)
  }

  // Selección de Múltiples Productos
  const toggleProductoSeleccionado = (codigo) => {
    const nuevaSeleccion = new Set(productosSeleccionados)
    if (nuevaSeleccion.has(codigo)) nuevaSeleccion.delete(codigo); else nuevaSeleccion.add(codigo)
    setProductosSeleccionados(nuevaSeleccion)
  }

  const toggleTodosProductos = (proveedor) => {
    const todosCodigos = proveedor.productos_faltantes.map(p => p.codigo)
    const todosSeleccionados = todosCodigos.every(codigo => productosSeleccionados.has(codigo))
    const nuevaSeleccion = new Set(productosSeleccionados)
    if (todosSeleccionados) {
      todosCodigos.forEach(codigo => nuevaSeleccion.delete(codigo))
    } else {
      todosCodigos.forEach(codigo => nuevaSeleccion.add(codigo))
    }
    setProductosSeleccionados(nuevaSeleccion)
  }

  const abrirModalAsignar = async () => {
    if (productosSeleccionados.size === 0) {
      alert('⚠️ Selecciona al menos un producto')
      return
    }
    setModalAsignarVisible(true)
    setBusquedaProveedor('')
    await cargarProveedoresAlegra('')
  }

  const cargarProveedoresAlegra = async (busqueda) => {
    try {
      setLoadingProveedores(true)
      const response = await api.get(\`/alegra/proveedores\`, { params: { busqueda } })
      if (response.data.success) {
        setProveedoresAlegra(response.data.data)
      } else {
        alert('Error cargando proveedores: ' + response.data.message)
      }
    } catch (error) {
      alert(\`❌ Error: \${error.message}\`)
    } finally {
      setLoadingProveedores(false)
    }
  }

  const asignarProveedorManual = async (proveedorId) => {
    if (productosSeleccionados.size === 0) return
    try {
      setLoading(true)
      const productosAAsignar = []
      proveedores.forEach(proveedor => {
        const prod = proveedor.productos_faltantes.filter(p => productosSeleccionados.has(p.codigo))
        prod.forEach(p => productosAAsignar.push({ producto: p, proveedorActual: proveedor.nombre }))
      })

      if (productosAAsignar.length === 0) return
      
      const BATCH_SIZE = 3
      const resultados = []

      for (let i = 0; i < productosAAsignar.length; i += BATCH_SIZE) {
        const lote = productosAAsignar.slice(i, i + BATCH_SIZE)
        const promesasLote = lote.map(({ producto, proveedorActual }) => {
          const body = {
            alegraReference: producto.codigo,
            alegraItemId: producto.alegra_item_id || producto.codigo,
            alegraName: producto.nombre,
            [proveedorActual !== 'Sin_Proveedor' ? 'nuevoProveedorId' : 'proveedorId']: proveedorId
          }
          const endpoint = proveedorActual !== 'Sin_Proveedor' ? '/alegra/faltantes/reasignar-proveedor' : '/alegra/faltantes/asignar-proveedor-manual'
          return api.post(endpoint, body).catch(err => ({ data: { success: false } }))
        })
        resultados.push(...(await Promise.all(promesasLote)))
      }

      const exitosos = resultados.filter(r => r.data?.success).length
      if (exitosos > 0) {
        alert(\`✅ \${exitosos} producto(s) asignado(s)\`)
        setModalAsignarVisible(false)
        setProductosSeleccionados(new Set())
        await loadReporte()
      }
    } catch (error) {
      alert('Error asignando proveedor: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const crearNuevoProveedor = async (datosProveedor) => {
    try {
      setLoading(true)
      const response = await api.post('/alegra/proveedores', datosProveedor)
      if (response.data.success) {
        alert(\`✅ Proveedor creado: \${response.data.data.name}\`)
        setModalCrearProveedor(false)
        await asignarProveedorManual(response.data.data.id)
      } else {
        alert(\`❌ Error: \${response.data.message}\`)
      }
    } catch (error) {
      alert('Error creando proveedor: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const eliminarProductoDeOrden = async (proveedorNombre, productoCodigo, productoNombre, cantidadOriginal) => {
    const key = \`\${proveedorNombre}-\${productoCodigo}\`
    const nuevosEliminados = new Set(productosEliminados)
    nuevosEliminados.add(key)
    setProductosEliminados(nuevosEliminados)

    try {
      await api.post('/alegra/orden-compra/producto-eliminado', { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal: cantidadOriginal || 0 })
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const restaurarProducto = async (proveedorNombre, productoCodigo) => {
    const key = \`\${proveedorNombre}-\${productoCodigo}\`
    const nuevosEliminados = new Set(productosEliminados)
    nuevosEliminados.delete(key)
    setProductosEliminados(nuevosEliminados)

    try {
      await api.delete('/alegra/orden-compra/producto-eliminado', { data: { proveedorNombre, productoCodigo } })
    } catch (error) {}
  }

  const abrirModalAgregarProducto = (proveedor) => {
    setProveedorParaAgregar(proveedor)
    setModalAgregarProducto(true)
    setBusquedaProducto('')
    setProductosAlegra([])
  }

  const buscarProductosAlegra = async (query) => {
    if (!query || query.length < 2) { setProductosAlegra([]); return }
    try {
      setLoadingProductos(true)
      const res = await api.get('/alegra/productos/buscar', { params: { query } })
      if (res.data.success) setProductosAlegra(res.data.data || [])
    } catch (e) {} finally { setLoadingProductos(false) }
  }

  const agregarProductoAOrden = async (producto, cantidad) => {
    if (!proveedorParaAgregar || cantidad <= 0) return
    const keyProv = proveedorParaAgregar.nombre
    const nuevosAgregados = new Map(productosAgregados)
    const list = nuevosAgregados.get(keyProv) || []
    list.push({ codigo: producto.reference, nombre: producto.name, cantidad: parseInt(cantidad), agregadoManual: true })
    nuevosAgregados.set(keyProv, list)
    setProductosAgregados(nuevosAgregados)

    try {
      await api.post('/alegra/orden-compra/producto-agregado', { proveedorNombre: keyProv, productoCodigo: producto.reference, productoNombre: producto.name, cantidad: parseInt(cantidad) })
    } catch (error) {}
    setModalAgregarProducto(false)
  }

  const eliminarProductoAgregado = async (proveedorNombre, index) => {
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    const prod = list[index]
    list.splice(index, 1)
    if (list.length === 0) nuevos.delete(proveedorNombre); else nuevos.set(proveedorNombre, list)
    setProductosAgregados(nuevos)

    try {
      await api.delete('/alegra/orden-compra/producto-agregado', { data: { proveedorNombre, productoCodigo: prod.codigo } })
    } catch (e) {}
  }

  const actualizarCantidadAgregado = async (proveedorNombre, index, nuevaCantidad) => {
    const cant = parseInt(nuevaCantidad)
    if (isNaN(cant) || cant <= 0) return
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    if (list[index]) {
      list[index] = { ...list[index], cantidad: cant }
      nuevos.set(proveedorNombre, list)
      setProductosAgregados(nuevos)

      try {
        await api.post('/alegra/orden-compra/producto-agregado', { proveedorNombre, productoCodigo: list[index].codigo, productoNombre: list[index].nombre, cantidad: cant })
      } catch (e) {}
    }
  }

  // --- RENDERIZADO PRINCIPAL ---
  if (loading && !proveedores.length) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-blue-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-gray-600">Cargando reporte de proveedores...</p>
      </div>
    )
  }

  const renderProveedorSeleccionado = () => {
    if (!proveedorActivoId) return null
    const proveedor = proveedores.find(p => p.id === proveedorActivoId)
    if (!proveedor) return null

    return (
      <div className="animate-fade-in-up">
        {/* Cabecera Activa */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <button 
            onClick={() => setProveedorActivoId(null)} 
            className="flex items-center text-gray-500 hover:text-blue-600 transition-colors w-max"
          >
            <ArrowLeft className="mr-2" size={20} /> Volver a proveedores
          </button>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <button
              onClick={handleGuardarCantidades}
              disabled={cantidadesModificadas.size === 0}
              className={\`btn \${cantidadesModificadas.size > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'btn-outline opacity-50 cursor-not-allowed'} whitespace-nowrap\`}
            >
              <FileText size={16} className="mr-2" /> Guardar Cambios
            </button>
            <button
              onClick={() => handleGenerarPDF(proveedor)}
              className="btn btn-outline whitespace-nowrap"
            >
              <Download size={16} className="mr-2" /> Generar PDF Orden
            </button>
            <button
              onClick={() => abrirModalAgregarProducto(proveedor)}
              className="btn btn-outline bg-green-50 text-green-700 border-green-200 hover:bg-green-100 whitespace-nowrap"
            >
              <Package size={16} className="mr-2" /> + Agregar Producto
            </button>
            <button
              onClick={() => abrirModalWhatsApp(proveedor)}
              className="btn bg-green-500 text-white hover:bg-green-600 border-none whitespace-nowrap"
            >
              <MessageCircle size={16} className="mr-2" /> WhatsApp
            </button>
          </div>
        </div>

        {/* Tarjeta Stats Proveedor */}
        <div className="card bg-white mb-6 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center">
            <div className="p-4 bg-blue-100 rounded-xl mr-5">
              <Users className="text-blue-600" size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{proveedor.nombre}</h1>
              <p className="text-gray-500 mt-1">{proveedor.contacto || 'Sin contacto'} | ID: {proveedor.id}</p>
              <label className="flex items-center text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded w-max">
                 <input type="checkbox" className="mr-2" checked={usaDatosProveedor(proveedor.nombre)} onChange={(e) => togglePreferenciaProveedor(proveedor.nombre, e.target.checked)} />
                 Usar códigos/nombres propios del proveedor en PDFs
              </label>
            </div>
          </div>
          <div className="flex bg-gray-50 p-4 rounded-xl divide-x divide-gray-200 min-w-[200px]">
            <div className="px-4 text-center">
              <p className="text-sm text-gray-500 font-medium">Items Faltantes</p>
              <p className="text-2xl font-bold text-gray-900">{proveedor.total_productos}</p>
            </div>
            <div className="px-4 text-center">
              <p className="text-sm text-gray-500 font-medium">Total Unidades</p>
              <p className="text-2xl font-bold text-blue-600">{proveedor.total_cantidad}</p>
            </div>
          </div>
        </div>

        {/* Panel Inteligente: Cantidad Sugerida */}
        <div className="card bg-purple-50 border border-purple-100 mb-8 p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-bold text-purple-900 flex items-center">
                <Brain className="mr-2" size={20} /> Análisis Inteligente (Sugerida)
              </h3>
              <p className="text-sm text-purple-700">Cantidades proyectadas usando faltantes de últimos 90 días</p>
            </div>
            {cantidadSugerida.length > 0 && (
              <button onClick={() => handleGenerarPDF(proveedor, 'sugerida')} className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white border-none">
                <Download size={14} className="mr-1" /> PDF Sugerencia
              </button>
            )}
          </div>
          
          {cantidadSugerida.length === 0 ? (
            <div className="text-center py-4 opacity-70">
              <p className="text-sm">No hay histórico de compras suficiente para generar sugerencias predictivas todavía.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {cantidadSugerida.slice(0, 6).map((item, idx) => (
                <div key={idx} className="bg-white p-3 rounded shadow-sm border border-purple-100 flex justify-between items-center">
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold truncate" title={item.producto_nombre}>{item.producto_nombre}</p>
                    <p className="text-xs text-gray-500">Promedio sem.: {item.promedio_semanal}</p>
                  </div>
                  <div className="ml-2 bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded text-lg">
                    {item.cantidad_sugerida}
                  </div>
                </div>
              ))}
              {cantidadSugerida.length > 6 && (
                <div className="bg-white p-3 rounded shadow-sm border border-dashed border-purple-200 flex justify-center items-center text-sm text-purple-600 font-medium">
                  + {cantidadSugerida.length - 6} sugerencias más en PDF
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Productos del Proveedor */}
        <div className="card shadow-sm p-0 overflow-hidden border border-gray-200">
          <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center">
             <h3 className="font-bold text-gray-800 flex items-center">
                <Package className="mr-2 text-gray-500" size={18} /> Detalle de Órdenes a Comprar
             </h3>
             {/* Checkbox global */}
             <label className="flex items-center cursor-pointer">
                <input type="checkbox" className="mr-2" checked={proveedor.productos_faltantes.every(p => productosSeleccionados.has(p.codigo))} onChange={() => toggleTodosProductos(proveedor)} />
                <span className="text-sm font-medium">Seleccionar todos para reasignar</span>
             </label>
          </div>
          <div className="divide-y divide-gray-100">
            {proveedor.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0).map((producto, idx) => {
              const cantidadFinal = getCantidadFinal(proveedor.nombre, producto.codigo, producto.cantidad_faltante)
              const key = \`\${proveedor.nombre}-\${producto.codigo}\`
              const tieneModificacion = cantidadesModificadas.has(key) || cantidadesGuardadas.has(key)
              const estaEliminado = productosEliminados.has(key)
              const seleccionado = productosSeleccionados.has(producto.codigo)

              return (
                <div key={idx} className={\`p-4 hover:bg-gray-50 transition-colors flex flex-col md:flex-row gap-4 md:items-center \${estaEliminado ? 'bg-red-50/50 opacity-60' : tieneModificacion ? 'bg-yellow-50/30' : ''}\`}>
                  <div className="flex items-start md:items-center w-full md:w-5/12 gap-3">
                    <input type="checkbox" checked={seleccionado} onChange={() => toggleProductoSeleccionado(producto.codigo)} className="mt-1 md:mt-0 cursor-pointer w-4 h-4 text-blue-600 rounded" />
                    <div className="flex-1 min-w-0">
                      <p className={\`font-semibold truncate \${estaEliminado ? 'line-through text-gray-400' : 'text-gray-900'}\`}>{producto.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">Código: {producto.codigo} {producto.descripcion_factura && \`| Nota: \${producto.descripcion_factura}\`}</p>
                    </div>
                  </div>

                  <div className="flex w-full md:w-7/12 flex-row items-center justify-between gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Original</p>
                      <span className="font-medium text-gray-600">{producto.cantidad_faltante}</span>
                    </div>

                    <div className="flex-1 px-4 border-l border-gray-200">
                       <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pedir Cantidad</p>
                       <input 
                         type="number" 
                         min="0" 
                         value={cantidadFinal} 
                         onChange={(e) => handleCantidadChange(proveedor.nombre, producto.codigo, e.target.value)}
                         className="w-full max-w-[120px] px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                         disabled={estaEliminado}
                       />
                    </div>

                    <div className="flex items-center gap-2">
                       {estaEliminado ? (
                         <button onClick={() => restaurarProducto(proveedor.nombre, producto.codigo)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded transition">
                           Restaurar
                         </button>
                       ) : (
                         <button onClick={() => eliminarProductoDeOrden(proveedor.nombre, producto.codigo, producto.nombre, producto.cantidad_faltante)} className="text-gray-400 hover:text-red-600 p-2 rounded transition">
                           <Trash2 size={18} />
                         </button>
                       )}
                    </div>
                  </div>
                </div>
              )
            })}
            
            {/* AGREGADOS MANUALMENTE */}
            {(productosAgregados.get(proveedor.nombre) || []).map((producto, idx) => (
               <div key={\`agregado-\${idx}\`} className="p-4 bg-green-50/40 hover:bg-green-50/70 transition-colors flex flex-col md:flex-row gap-4 md:items-center">
                  <div className="flex items-center w-full md:w-5/12 gap-3 pl-7">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{producto.nombre} <span className="text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded ml-1 tracking-wider uppercase">Extra</span></p>
                      <p className="text-xs text-gray-500 truncate">Código: {producto.codigo}</p>
                    </div>
                  </div>
                  <div className="flex w-full md:w-7/12 flex-row items-center justify-between gap-4">
                    <div className="text-center opacity-0"><span className="font-medium">0</span></div>
                    <div className="flex-1 px-4 border-l border-gray-200">
                       <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pedir Cantidad</p>
                       <input 
                         type="number" min="1" value={producto.cantidad} 
                         onChange={(e) => actualizarCantidadAgregado(proveedor.nombre, idx, e.target.value)}
                         className="w-full max-w-[120px] px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                       />
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => eliminarProductoAgregado(proveedor.nombre, idx)} className="text-gray-400 hover:text-red-600 p-2 rounded transition">
                           <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
               </div>
            ))}
          </div>
        </div>

        {/* Floating Action Button para Reasignar si hay seleccionados */}
        {productosSeleccionados.size > 0 && (
          <div className="fixed bottom-8 right-8 z-50 animate-bounce">
            <button onClick={abrirModalAsignar} className="bg-indigo-600 text-white shadow-xl flex items-center space-x-2 text-md px-5 py-3 rounded-full hover:bg-indigo-700 hover:scale-105 transition-all">
              <RefreshCw size={18} />
              <span>Mover {productosSeleccionados.size} a otro proveedor</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderVistaLista = () => {
    return (
      <div className="space-y-6 animate-fade-in-up">
        {/* Filtros Globales */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex-1 w-full">
            <input type="text" value={proveedorQuery} onChange={(e) => setProveedorQuery(e.target.value)} placeholder="Buscar nombre del proveedor..." className="input w-full md:max-w-md bg-gray-50" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
               <Calendar size={16} className="text-gray-500 mr-2" />
               <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="text-sm bg-transparent border-none focus:ring-0 p-0 text-gray-700" title="Fecha inicial"/>
               {fechaInicio && <button onClick={() => setFechaInicio('')} className="ml-2 text-gray-400 hover:text-red-500">&times;</button>}
            </div>
            <button onClick={loadReporte} className="btn btn-outline" title="Refrescar">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Grid de Proveedores */}
        {proveedores.length === 0 ? (
          <div className="card text-center py-16">
            <Package className="mx-auto text-gray-300 mb-4" size={64} />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No tienes faltantes pendientes</h3>
            <p className="text-gray-500">Agrega Faltantes desde la vista de facturas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proveedores.filter(p => p.nombre.toLowerCase().includes(proveedorQuery.toLowerCase())).map((proveedor) => (
              <div 
                key={proveedor.id} 
                onClick={() => setProveedorActivoId(proveedor.id)} 
                className="group bg-white rounded-xl shadow-sm hover:shadow-lg border border-gray-100 p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-[100px] -z-10 group-hover:bg-blue-100 transition-colors"></div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-1 pr-4">{proveedor.nombre}</h3>
                <p className="text-sm text-gray-500 mb-4">{proveedor.contacto || 'Sin info'}</p>
                
                <div className="flex items-center gap-4 pt-4 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Productos</p>
                    <p className="text-xl font-bold text-gray-800">{proveedor.total_productos}</p>
                  </div>
                  <div className="h-8 w-[1px] bg-gray-200"></div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Unidades</p>
                    <p className="text-xl font-bold text-blue-600">{proveedor.total_cantidad}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resumen Global Info */}
        {resumen && (
           <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 opacity-70">
              <div className="text-center"><p className="text-sm text-gray-500">Proveedores con faltantes</p><p className="text-xl font-bold text-gray-800">{proveedores.length}</p></div>
              <div className="text-center"><p className="text-sm text-gray-500">Tot. Productos Únicos</p><p className="text-xl font-bold text-gray-800">{resumen.total_productos_faltantes}</p></div>
              <div className="text-center"><p className="text-sm text-gray-500">Volumen Unidades</p><p className="text-xl font-bold text-gray-800">{resumen.total_cantidad_faltante}</p></div>
              <div className="text-center mt-2 md:mt-0"><button onClick={handleLimpiarVista} className="text-red-500 text-sm hover:underline">Limpiar BD Entera</button></div>
           </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1">
         <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Faltantes y Compras</h1>
         <p className="text-gray-500 mt-2 text-lg">Central de proveedores, análisis predictivos y órdenes automáticas.</p>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-red-500 mr-2"/><p className="text-red-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {/* Manejo de Vistas (Listado vs Panel Detalle) */}
      {!proveedorActivoId ? renderVistaLista() : renderProveedorSeleccionado()}


      {/* MODALES REUTILIZADOS A CONTINUACIÓN */}
      
      {modalAsignarVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900">Reclasificar / Cambiar Proveedor</h2>
                <p className="text-gray-600 mt-1">
                  Mover <span className="font-medium text-blue-600">{productosSeleccionados.size} producto{productosSeleccionados.size > 1 ? 's' : ''}</span> al inventario de otra entidad.
                </p>
              </div>
              <div className="p-6 border-b border-gray-200">
                <div className="flex gap-2">
                  <input type="text" value={busquedaProveedor} onChange={(e) => setBusquedaProveedor(e.target.value)} onKeyPress={(e) => {if (e.key === 'Enter') cargarProveedoresAlegra(busquedaProveedor)}} placeholder="Buscar nombre de entidad..." className="input flex-1" />
                  <button onClick={() => cargarProveedoresAlegra(busquedaProveedor)} className="btn btn-primary" disabled={loadingProveedores}>{loadingProveedores ? 'Cargando...' : 'Buscar'}</button>
                  <button onClick={() => setModalCrearProveedor(true)} className="btn btn-outline">+ Registrar Nuevo</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                {loadingProveedores ? (
                  <div className="text-center py-8"><div className="spinner mx-auto mb-4"></div></div>
                ) : proveedoresAlegra.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Busca el proveedor destino en la barra superior.</div>
                ) : (
                  <div className="grid gap-2">
                    {proveedoresAlegra.map((prov) => (
                      <button key={prov.id} onClick={() => asignarProveedorManual(prov.id)} className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <div><p className="font-bold text-gray-900">{prov.name}</p><p className="text-xs text-gray-500 mt-1">{prov.identification || 'Sin identificación'}</p></div>
                          <Users className="text-blue-500" size={20} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 bg-white">
                <button onClick={() => {setModalAsignarVisible(false); setBusquedaProveedor(''); setProveedoresAlegra([])}} className="btn btn-outline w-full py-3">Cancelar y Volver</button>
              </div>
            </div>
          </div>
        )}

      {modalCrearProveedor && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Registrar en Alegra</h2>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); crearNuevoProveedor({name: fd.get('name'), identification: fd.get('identification'), identificationType: fd.get('identificationType')}); }}>
              <div className="space-y-4">
                <input name="name" required className="input w-full" placeholder="Razón Social o Nombre *" />
                <select name="identificationType" className="input w-full"><option value="">-- Doc. Tipo --</option><option value="CF">Física</option><option value="CJ">Jurídica</option></select>
                <input name="identification" className="input w-full" placeholder="Número Documento" />
              </div>
              <div className="flex gap-2 mt-6">
                <button type="button" onClick={() => setModalCrearProveedor(false)} className="btn btn-outline flex-1">Atrás</button>
                <button type="submit" className="btn btn-primary flex-1" disabled={loading}>Crear y Asignar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalAgregarProducto && proveedorParaAgregar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div><h2 className="text-2xl font-bold text-gray-900">Buscar Producto Adicional</h2><p className="text-gray-500 text-sm mt-1">Agregando a {proveedorParaAgregar.nombre}</p></div>
            </div>
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <input type="text" value={busquedaProducto} onChange={(e) => { setBusquedaProducto(e.target.value); if (e.target.value.length >= 2) buscarProductosAlegra(e.target.value); }} placeholder="Tipea nombre o código referencial..." className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {loadingProductos ? (<div className="text-center py-4"><div className="spinner mx-auto"></div></div>) : productosAlegra.length === 0 ? (<div className="text-center py-6 text-gray-400">Sin coincidencias.</div>) : (
                <div className="grid gap-2">
                  {productosAlegra.map((p, i) => {
                    const reference = typeof p.reference === 'object' ? p.reference?.reference || p.reference?.code : p.reference;
                    return (
                      <div key={i} className="p-3 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-50">
                        <div><p className="font-semibold text-gray-800">{p.name}</p><p className="text-xs text-gray-500">{reference}</p></div>
                        <button onClick={() => { const q = prompt(\`\${p.name}\\n¿Cantidad a añadir a la orden?\`, '1'); if(q && parseInt(q)>0) agregarProductoAOrden({...p, reference: reference}, q); }} className="btn btn-sm btn-primary">+ Añadir</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100"><button onClick={() => setModalAgregarProducto(false)} className="btn btn-outline w-full font-semibold border-gray-300 text-gray-600 hover:bg-gray-100">Cerrar buscador</button></div>
          </div>
        </div>
      )}

      {modalWhatsAppVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
             <div className="bg-green-500 p-6 text-center">
               <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"><MessageCircle className="text-white" size={32} /></div>
               <h2 className="text-xl font-bold text-white mb-1">Enviar PDF por WhatsApp</h2>
             </div>
             <div className="p-6 pb-2">
               <label className="block text-sm font-semibold text-gray-700 mb-2">Destino / Contacto</label>
               <input type="tel" value={telefonoProveedor} onChange={e=>setTelefonoProveedor(e.target.value)} placeholder="Ej: +506 8888 8888" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-lg text-center font-medium placeholder-gray-400" />
               <p className="text-xs text-center text-gray-500 mt-3 px-2 leading-relaxed">Se generará el archivo con la orden de compra y se abrirá WhatsApp Web/App para enviarla.</p>
             </div>
             <div className="p-6 grid grid-cols-2 gap-3">
               <button onClick={()=>setModalWhatsAppVisible(false)} className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl transition text-sm">Cancelar</button>
               <button onClick={enviarWhatsApp} disabled={!telefonoProveedor} className="py-3 px-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center shadow-md shadow-green-500/30"><Download size={16} className="mr-1"/> Enviar</button>
             </div>
           </div>
        </div>
      )}
      
    </div>
  )
}