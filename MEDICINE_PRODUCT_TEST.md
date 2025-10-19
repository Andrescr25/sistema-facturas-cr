# Test de Creación de Productos Medicamento

## Cambios Realizados

### ✅ Frontend (RelacionarProductos.jsx)

1. **Eliminada detección automática por CABYS**: Ya no se detecta automáticamente si un producto es medicamento basándose en el prefijo del código CABYS.

2. **Nuevo Checkbox "¿Es medicamento?"**: 
   - Campo manual que permite al usuario indicar si el producto es un medicamento
   - Ubicado después del campo CABYS
   - Al marcarlo, se despliegan automáticamente los campos farmacéuticos

3. **Campos Farmacéuticos Condicionales**:
   - **Forma Farmacéutica** (obligatorio si es medicamento):
     - 01 - Líquidos (alcohol, jarabe, solución, suspensión)
     - 02 - Sólidos (tabletas, cápsulas, polvos)
     - 03 - Semisólidos (cremas, ungüentos, geles)
     - 04 - Gases (aerosoles, inhaladores)
     - 05 - Otros
   
   - **Registro Sanitario** (obligatorio si es medicamento):
     - Número de registro del Ministerio de Salud de Costa Rica
     - Formato ejemplo: M-12345-2024

4. **Sugerencia Automática**: Cuando se marca el checkbox, el sistema sugiere la forma farmacéutica basándose en la descripción del producto.

### ✅ Backend (productosRevision.js)

1. **Nuevo campo `registroSanitario`**: Se captura del formulario y se envía a Alegra
2. **Campo `formaFarmaceutica`**: Se mantiene y se envía correctamente
3. **Validación**: Los campos solo se envían si están presentes

### ✅ Backend Service (alegraService.js)

1. **Eliminado el workaround de cambiar a "service"**: Ya no se cambia el tipo de producto a "service" automáticamente
2. **Campo `pharmaceuticalForm`**: Se envía directamente a Alegra API
3. **Campo `sanitaryRegistry`**: Nuevo campo agregado para cumplir con normativa CR 2025

## Cómo Probar

### Paso 1: Acceder al Modal de Creación
1. Navegar a "Relacionar Productos"
2. Seleccionar una factura con productos sin relacionar
3. Click en "Relacionar" → "Crear Nuevo Producto en Alegra"

### Paso 2: Crear Producto NO Medicamento
1. Llenar los campos básicos (nombre, precio, costo, categoría)
2. **NO marcar** el checkbox "¿Es medicamento?"
3. Los campos de forma farmacéutica y registro sanitario NO deben aparecer
4. Click en "Crear Producto en Alegra"
5. ✅ Debe crearse correctamente sin campos farmacéuticos

### Paso 3: Crear Producto Medicamento
1. Llenar los campos básicos (nombre, precio, costo, categoría)
2. **Marcar** el checkbox "¿Es medicamento? 💊"
3. Los campos farmacéuticos deben aparecer:
   - Forma Farmacéutica (con sugerencia automática)
   - Registro Sanitario (campo vacío)
4. Completar:
   - Forma Farmacéutica: Seleccionar la correcta (ej: "02 - Sólidos" para tabletas)
   - Registro Sanitario: Ingresar número (ej: "M-12345-2024")
5. Click en "Crear Producto en Alegra"
6. ✅ Debe crearse correctamente con campos farmacéuticos

## Casos de Prueba

### Caso 1: Medicamento con CABYS 30-35
- **Producto**: ACETAMINOFEN 500MG TABLETAS
- **CABYS**: 30121500000000
- **¿Es medicamento?**: ✅ Marcado
- **Forma**: 02 - Sólidos
- **Registro**: M-56789-2024
- **Resultado Esperado**: Producto creado con todos los campos farmacéuticos

### Caso 2: Producto NO medicamento con CABYS 24
- **Producto**: ALCOHOL 70% GEL 500ML
- **CABYS**: 2413900000100
- **¿Es medicamento?**: ⬜ NO marcado
- **Forma**: N/A (no visible)
- **Registro**: N/A (no visible)
- **Resultado Esperado**: Producto creado sin campos farmacéuticos

### Caso 3: Medicamento tipo líquido
- **Producto**: JARABE PARA LA TOS 120ML
- **CABYS**: 30101500000000
- **¿Es medicamento?**: ✅ Marcado
- **Forma**: 01 - Líquidos (sugerido automáticamente)
- **Registro**: M-11111-2024
- **Resultado Esperado**: Forma sugerida correctamente, producto creado

### Caso 4: Medicamento tipo semisólido
- **Producto**: CREMA HIDRATANTE MEDICINAL 50G
- **CABYS**: 32151500000000
- **¿Es medicamento?**: ✅ Marcado
- **Forma**: 03 - Semisólidos (sugerido automáticamente)
- **Registro**: M-22222-2024
- **Resultado Esperado**: Forma sugerida correctamente, producto creado

## Verificación en Alegra

Después de crear un producto medicamento, verificar en Alegra:

1. **Producto → Productos y Servicios**
2. Buscar el producto recién creado
3. Verificar que tenga:
   - ✅ Nombre correcto
   - ✅ Precio y costo
   - ✅ Código CABYS
   - ✅ Forma farmacéutica (si es medicamento)
   - ✅ Registro sanitario (si es medicamento)

## Normativa Costa Rica 2025

Según la normativa vigente desde el 1 de enero de 2025 en Costa Rica:

- **Obligatorio para medicamentos humanos**:
  - Forma Farmacéutica
  - Registro Sanitario

- **Campos opcionales para otros productos**:
  - No se requieren estos campos para productos no farmacéuticos

## Notas Importantes

1. **Sugerencia Automática**: El sistema sugiere la forma farmacéutica basándose en palabras clave en la descripción:
   - "tableta", "cápsula", "comprimido" → Sólidos (02)
   - "crema", "ungüento", "gel" → Semisólidos (03)
   - "aerosol", "spray", "inhalador" → Gases (04)
   - Otros casos → Líquidos (01) por defecto

2. **Validación**: 
   - Si se marca "¿Es medicamento?", los campos de forma farmacéutica y registro sanitario son **obligatorios**
   - Si NO se marca, estos campos NO aparecen y NO se envían a Alegra

3. **Compatibilidad con Alegra**:
   - Los campos se envían usando la API oficial de Alegra
   - `pharmaceuticalForm`: Código de 2 dígitos (01-05)
   - `sanitaryRegistry`: Texto libre para el número de registro

## Problemas Conocidos y Soluciones

### Problema: Error "clave/referencia de producto requerida"
**Solución**: Asegurarse de que el campo "Código/Referencia" esté lleno en el formulario

### Problema: Error 403 al crear medicamento
**Solución**: Verificar que la cuenta de Alegra tenga permisos para crear productos con campos farmacéuticos. Contactar soporte de Alegra si es necesario.

### Problema: Campos farmacéuticos no aparecen
**Solución**: Verificar que el checkbox "¿Es medicamento?" esté marcado. Refrescar la página si es necesario.

## Logs de Debug

Para verificar que los datos se envían correctamente:

1. **Frontend**: Abrir DevTools → Console
   - Buscar: `📤 Datos a enviar` al crear producto
   
2. **Backend**: Revisar logs del servidor
   - Buscar: `📦 Creando producto nuevo en Alegra`
   - Buscar: `✅ Forma farmacéutica agregada`
   - Buscar: `✅ Registro sanitario agregado`

## API de Alegra - Campos Utilizados

```json
{
  "name": "ACETAMINOFEN 500MG TABLETAS",
  "description": "Analgésico y antipirético",
  "price": [{ "idPriceList": 1, "price": 2500 }],
  "status": "active",
  "type": "product",
  "unit": "unit",
  "reference": { "reference": "MED-001", "type": "CODE_OF_INTERNAL_USE" },
  "itemCategory": { "id": 123 },
  "productKey": "30121500000000",
  "pharmaceuticalForm": "02",
  "sanitaryRegistry": "M-56789-2024",
  "inventory": {
    "unit": "unit",
    "unitCost": 1500,
    "initialQuantity": 100
  },
  "tax": [{ "id": 1 }]
}
```

## Conclusión

✅ **Todos los cambios implementados correctamente**:
- ✅ Checkbox manual "¿Es medicamento?"
- ✅ Campos farmacéuticos condicionales
- ✅ Registro sanitario agregado
- ✅ Eliminada detección automática por CABYS
- ✅ Backend actualizado para manejar nuevos campos
- ✅ Integración con Alegra API completa

**Ready to Test! 🚀**


