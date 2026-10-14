import { useMemo, useState } from 'react'
import { getReference } from '../utils/facturacionUtils'
import { lineaConDescuentoCliente } from '../utils/descuentoCliente'

export default function useLineasFacturacion({ ofertas, impuestoPrincipal, mostrarMensaje, condiciones, facturaExistente, DESCRIPCION_MAX }) {
  const [lineas, setItems] = useState([])
  const items = useMemo(() => facturaExistente ? lineas : lineas.map(item => lineaConDescuentoCliente(item, condiciones)), [lineas, condiciones, facturaExistente])

  const agregarProductoAFactura = (producto, cantidad) => {
    // Verificar si ya existe
    const existente = items.find(item => item.id === producto.id)

    if (existente) {
      // Actualizar cantidad y mover al principio
      const itemActualizado = { ...existente, quantity: existente.quantity + cantidad }
      setItems(prev => [{ ...prev.find(item => item.id === producto.id), quantity: itemActualizado.quantity }, ...prev.filter(item => item.id !== producto.id)])
    } else {
      // Agregar nuevo al principio
      const impuestoDefault = impuestoPrincipal
        ? [{
          id: impuestoPrincipal.id,
          percentage: Number(impuestoPrincipal.percentage) || 0,
          name: impuestoPrincipal.name,
          type: impuestoPrincipal.type
        }]
        : []

      // LA TARIFA ES LA DEL PRODUCTO, no la principal de la factura.
      //
      // Antes toda línea nacía con el impuesto principal (13 %), y eso es lo
      // que la pantalla le sumaba al cliente. Con un producto al 1 % el cajero
      // cobraba 13 % mientras el servidor guardaba 1 %: en una factura de dos
      // líneas al 1 % y al 2 % la diferencia fue de ₡191,82. El papel y la
      // pantalla tienen que decir lo mismo.
      //
      // En producción, donde ese id viajaba a Alegra, el daño quedó medido
      // sobre lo ya emitido: 213 líneas en 147 facturas de productos al 1 %
      // salieron al 13 %, 13 líneas al 2 % y 6 exentas.
      const impuestoDelProducto = Array.isArray(producto.tax) && producto.tax.length
        ? producto.tax.map(t => ({
          id: t.id,
          percentage: Number(t.percentage) || 0,
          name: t.name,
          type: t.type
        }))
        : impuestoDefault

      // Si el producto está en oferta de exceso, la línea NACE con ese
      // descuento. Es el mismo que el cliente ya ve en el catálogo y en el
      // portal: la oferta que se promete y la que se cobra tienen que ser la
      // misma, y nadie en la caja tiene por qué acordarse de cuáles son.
      const ofertaExceso = ofertas.get(Number(producto.productoId ?? producto.id)) || 0

      const nuevoItem = {
        id: producto.id,
        // El id propio viaja con la línea: es el que el servidor usa para
        // resolver el producto contra su maestro.
        productoId: producto.productoId ?? producto.id,
        reference: getReference(producto.reference),
        name: producto.name,
        quantity: cantidad,
        price: producto.price || 0,
        tax: impuestoDelProducto,
        discount: ofertaExceso,
        ofertaExceso,
        description: ''
      }

      setItems(prev => [nuevoItem, ...prev])
    }

    mostrarMensaje(`${producto.name} agregado (${cantidad})`, 'success', 2000)
  }

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const actualizarCantidadItem = (index, cantidad) => {
    // Permitir valores vacíos temporalmente mientras el usuario edita
    const nuevaCantidad = cantidad === '' ? '' : (parseInt(cantidad) || 1)

    setItems(prevItems => prevItems.map((item, i) =>
      i === index ? { ...item, quantity: nuevaCantidad } : item
    ))
  }

  const validarCantidadItem = (index) => {
    // Al perder foco, validar que la cantidad sea válida
    setItems(prevItems => prevItems.map((item, i) => {
      if (i === index) {
        const cantidad = parseInt(item.quantity) || 1
        return { ...item, quantity: cantidad >= 1 ? cantidad : 1 }
      }
      return item
    }))
  }

  const actualizarPrecioItem = (index, precio) => {
    const nuevoPrecio = Math.max(0, parseFloat(precio) || 0)
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, price: nuevoPrecio } : item
    ))
  }

  const actualizarDescuentoItem = (index, descuento) => {
    // Un 150 % dejaba la línea en negativo en pantalla y el servidor la
    // rechazaba recién al facturar.
    const nuevoDescuento = Math.min(100, Math.max(0, parseFloat(descuento) || 0))
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, discount: nuevoDescuento, descuentoBase: nuevoDescuento } : item
    ))
  }

  const actualizarDescripcionItem = (index, descripcion) => {
    const texto = (descripcion || '').slice(0, DESCRIPCION_MAX)
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, description: texto } : item
    ))
  }

  return { items, setItems, agregarProductoAFactura, eliminarItem, actualizarCantidadItem, validarCantidadItem, actualizarPrecioItem, actualizarDescuentoItem, actualizarDescripcionItem }
}
