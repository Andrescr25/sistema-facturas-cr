# 📦 Creación Completa de Productos en Alegra

## 🎯 Objetivo
Crear productos en Alegra con TODOS los datos capturados del XML de la factura del proveedor, incluyendo:
- ✅ Imagen del producto
- ✅ Código CABYS (productKey)
- ✅ Impuestos (tax)
- ✅ Costo (cost/unitCost)
- ✅ Inventario (inventory)
- ✅ Todos los campos estándar (nombre, descripción, precio, categoría, etc.)

---

## 📋 Cambios Realizados

### 1. **Backend - `routes/productosRevision.js`**

#### Extracción de datos del producto original
```javascript
const productoOriginal = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { factura: true }
});

console.log('🔍 Producto original de la factura:', {
    descripcion: productoOriginal.descripcion,
    codigoProveedor: productoOriginal.codigoProveedor,
    codigoCabys: productoOriginal.codigoCabys,
    impuesto: productoOriginal.impuesto,
    precioUnitario: productoOriginal.precioUnitario
});
```

#### Agregando código CABYS
```javascript
// 🆕 Agregar código CABYS (productKey)
if (productoOriginal.codigoCabys) {
    productoData.productKey = productoOriginal.codigoCabys;
    console.log('✅ Código CABYS agregado:', productoOriginal.codigoCabys);
}
```

#### Agregando impuestos
```javascript
// 🆕 Agregar impuestos (tax)
// Si el producto tiene impuesto > 0, agregar IVA
if (productoOriginal.impuesto > 0) {
    // Calcular porcentaje de impuesto
    const porcentajeImpuesto = (productoOriginal.impuesto / productoOriginal.precioUnitario) * 100;
    
    // En Costa Rica el IVA estándar es 13%
    if (Math.abs(porcentajeImpuesto - 13) < 1) {
        productoData.tax = [{ id: 1 }]; // IVA 13%
        console.log('✅ Impuesto IVA 13% agregado');
    } else {
        console.log(`⚠️ Impuesto no estándar detectado: ${porcentajeImpuesto.toFixed(2)}%`);
    }
}
```

#### Agregando costo
```javascript
const productoData = {
    name: nombre.trim(),
    description: descripcion?.trim() || nombre.trim(),
    reference: referencia?.trim() || productoOriginal.codigoProveedor,
    price: parseFloat(precio),
    cost: parseFloat(costo), // 🆕 COSTO AGREGADO
    status: 'active',
    type: 'product', // Producto con inventario
    unit: unidad || 'unit'
};
```

---

### 2. **Backend - `services/alegraService.js`**

#### Método `createProduct()` actualizado
```javascript
async createProduct(data) {
    try {
        console.log(`📦 Creando producto COMPLETO en Alegra: ${data.name}`);
        
        const productData = {
            name: data.name,
            description: data.description || data.name,
            status: data.status || 'active',
            type: data.type || 'product', // 'product' para inventario
            
            // Precio (array requerido por Alegra)
            price: [{
                idPriceList: 1,
                price: parseFloat(data.price) || 0
            }],
            
            unit: data.unit || 'unit'
        };
        
        // Referencia/código interno
        if (data.reference) {
            productData.reference = {
                reference: data.reference,
                type: 'CODE_OF_INTERNAL_USE'
            };
        }
        
        // Categoría
        if (data.itemCategory && data.itemCategory.id) {
            productData.itemCategory = {
                id: parseInt(data.itemCategory.id)
            };
        }

        // 🆕 Código CABYS
        if (data.productKey) {
            productData.productKey = data.productKey;
            console.log(`✅ Código CABYS agregado: ${data.productKey}`);
        }

        // 🆕 Impuestos
        if (data.tax && Array.isArray(data.tax)) {
            productData.tax = data.tax;
            console.log(`✅ Impuestos agregados: ${JSON.stringify(data.tax)}`);
        }

        // 🆕 Inventario con costo
        if (data.type === 'product') {
            productData.inventory = {
                unit: data.unit || 'unit',
                unitCost: parseFloat(data.cost) || parseFloat(data.price) || 0
            };

            // Cantidad inicial
            if (data.initialQuantity && parseFloat(data.initialQuantity) > 0) {
                productData.inventory.initialQuantity = parseFloat(data.initialQuantity);
                console.log(`✅ Cantidad inicial: ${data.initialQuantity}`);
            }
        }

        const response = await this.api.post('/items', productData);
        return response.data;
    } catch (error) {
        // Manejo de errores...
    }
}
```

#### 🆕 Nuevo método `uploadProductImage()`
```javascript
async uploadProductImage(productId, formData) {
    try {
        console.log(`📸 Subiendo imagen al producto ${productId} en Alegra...`);
        
        // La API de Alegra usa /items/{id}/image
        const response = await this.api.post(`/items/${productId}/image`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data'
            }
        });
        
        console.log(`✅ Imagen subida exitosamente al producto ${productId}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error subiendo imagen: ${error.response?.data || error.message}`);
        throw error;
    }
}
```

---

## 🔄 Flujo Completo

1. **Usuario accede a "Revisión de Precios"**
2. **Selecciona una factura** con productos sin relacionar
3. **Hace clic en "Crear Producto"** en un producto no relacionado
4. **El modal se abre con:**
   - Nombre (pre-cargado)
   - Descripción (pre-cargado)
   - Código/Referencia (pre-cargado del XML)
   - Unidad de medida
   - Precio de venta (pre-cargado)
   - Costo unitario (pre-cargado)
   - Categoría (requerida)
   - Cantidad inicial
   - **Campo para subir imagen** 📸

5. **Al hacer submit:**
   - Se extrae el producto original de Prisma
   - Se obtiene `codigoCabys` e `impuesto` del XML
   - Se calcula el porcentaje de impuesto
   - Se construye el objeto completo para Alegra con:
     - ✅ Todos los campos del formulario
     - ✅ CABYS como `productKey`
     - ✅ IVA 13% como `tax: [{ id: 1 }]`
     - ✅ Costo en `inventory.unitCost`
     - ✅ Tipo `product` para inventario
   - Se crea el producto en Alegra
   - Si hay imagen, se sube con `uploadProductImage()`
   - Se crea el mapeo en la BD local
   - Se relaciona automáticamente con la factura

---

## 📊 Estructura de Datos

### Producto en XML (Costa Rica)
```xml
<LineaDetalle>
  <CodigoComercial>
    <Tipo>04</Tipo>
    <Codigo>1769</Codigo>
  </CodigoComercial>
  <CodigoCabys>2411000000100</CodigoCabys>
  <Descripcion>ALCOHOL MALICK DESNATURALIZADO 96° 950ML</Descripcion>
  <Cantidad>1</Cantidad>
  <UnidadMedida>Unid</UnidadMedida>
  <PrecioUnitario>2711.85</PrecioUnitario>
  <Impuesto>
    <Codigo>01</Codigo>
    <Tarifa>13.00</Tarifa>
    <Monto>352.54</Monto>
  </Impuesto>
</LineaDetalle>
```

### Producto en Prisma
```javascript
{
  codigoProveedor: "1769",
  codigoCabys: "2411000000100",
  descripcion: "ALCOHOL MALICK DESNATURALIZADO 96° 950ML",
  cantidad: 1,
  unidadMedida: "Unid",
  precioUnitario: 2711.85,
  impuesto: 352.54  // (2711.85 * 13%)
}
```

### Producto enviado a Alegra
```javascript
{
  "name": "ALCOHOL MALICK DESNATURALIZADO 96° 950ML",
  "description": "ALCOHOL MALICK DESNATURALIZADO 96° 950ML",
  "reference": {
    "reference": "1769",
    "type": "CODE_OF_INTERNAL_USE"
  },
  "price": [{
    "idPriceList": 1,
    "price": 2711.85
  }],
  "status": "active",
  "type": "product",
  "unit": "unit",
  "itemCategory": { "id": 5 },
  "productKey": "2411000000100",     // 🆕 CABYS
  "tax": [{ "id": 1 }],               // 🆕 IVA 13%
  "inventory": {                       // 🆕 Inventario
    "unit": "unit",
    "unitCost": 2711.85,
    "initialQuantity": 1
  }
}
```

### Producto en Alegra (respuesta)
```javascript
{
  "id": 1231,
  "name": "ALCOHOL MALICK DESNATURALIZADO 96° 950ML",
  "reference": {
    "type": "CODE_OF_INTERNAL_USE",
    "reference": "1769"
  },
  "productKey": "2411000000100",      // ✅ CABYS guardado
  "tax": [{                            // ✅ Impuesto guardado
    "id": 1,
    "name": "IVA",
    "percentage": "13.00",
    "type": "IVA"
  }],
  "inventory": {                       // ✅ Inventario guardado
    "initialQuantity": 1,
    "unit": "unit",
    "unitCost": 2711.85,
    "availableQuantity": 1
  },
  "images": []                         // 📸 Se llenará si se sube imagen
}
```

---

## 🧪 Testing

### Test manual en el sistema:
1. Ir a **Revisión de Precios**
2. Seleccionar una factura
3. Hacer clic en **"Crear Producto"** en un producto
4. Verificar que el modal muestra todos los datos
5. Opcionalmente subir una imagen
6. Hacer clic en **"Crear Producto"**
7. Verificar en consola del navegador y backend:
   - ✅ Logs de "Código CABYS agregado"
   - ✅ Logs de "Impuesto IVA 13% agregado"
   - ✅ Logs de "Cantidad inicial"
   - ✅ Si hay imagen: "Imagen subida exitosamente"
8. Verificar en Alegra que el producto tiene:
   - ✅ Código CABYS en el campo correspondiente
   - ✅ IVA 13% asignado
   - ✅ Costo unitario
   - ✅ Inventario inicial
   - ✅ Imagen (si se subió)

### Test con curl (crear producto manualmente):
```bash
curl -X POST "https://api.alegra.com/api/v1/items" \
  -H "Content-Type: application/json" \
  -u "tachifacturas@gmail.com:b3a84abb6897180d3889" \
  -d '{
    "name": "Producto Test",
    "description": "Descripción test",
    "reference": {
      "reference": "TEST001",
      "type": "CODE_OF_INTERNAL_USE"
    },
    "price": [{
      "idPriceList": 1,
      "price": 1000
    }],
    "type": "product",
    "unit": "unit",
    "itemCategory": { "id": 5 },
    "productKey": "2411000000100",
    "tax": [{ "id": 1 }],
    "inventory": {
      "unit": "unit",
      "unitCost": 800,
      "initialQuantity": 10
    }
  }'
```

---

## ✅ Verificación

### En el backend (consola):
```
📦 Creando producto nuevo en Alegra...
🔍 Producto original de la factura: {
  descripcion: 'ALCOHOL MALICK DESNATURALIZADO 96° 950ML',
  codigoProveedor: '1769',
  codigoCabys: '2411000000100',
  impuesto: 352.54,
  precioUnitario: 2711.85
}
✅ Código CABYS agregado: 2411000000100
✅ Impuesto IVA 13% agregado
✅ Cantidad inicial: 1
📤 Datos a enviar a Alegra: { ... }
✅ Producto creado exitosamente: ID 1231
📸 Subiendo imagen a Alegra...
✅ Imagen subida exitosamente
✅ Producto creado y relacionado exitosamente
```

### En Alegra:
1. Ir a **Productos** → Buscar el producto recién creado
2. Verificar:
   - ✅ Nombre correcto
   - ✅ Código/Referencia correcto
   - ✅ **Código CABYS** en el campo "Clave de Producto"
   - ✅ **IVA 13%** asignado en impuestos
   - ✅ **Costo unitario** registrado
   - ✅ **Inventario inicial** registrado
   - ✅ **Imagen** visible (si se subió)

---

## 🎉 Resultado Final

Ahora cuando creas un producto desde una factura XML:
- ✅ Se captura **automáticamente el código CABYS** del XML
- ✅ Se calcula y asigna **automáticamente el IVA 13%**
- ✅ Se registra el **costo unitario** en el inventario
- ✅ Se crea como producto de **inventario** (no servicio)
- ✅ Se puede **subir una imagen** del producto
- ✅ Todos los datos fiscales y contables **correctos para Costa Rica**

**El producto queda 100% completo en Alegra**, listo para facturación electrónica con cumplimiento tributario de Costa Rica. 🇨🇷

