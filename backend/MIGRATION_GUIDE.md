# 📚 Guía de Migración - Arquitectura Modular

## 🎯 Resumen de Cambios

Se ha reorganizado completamente el backend aplicando **arquitectura limpia** y **modularización por dominio**.

### ✅ ¿Qué se logró?

- ✅ Reducción de archivos de +4000 líneas a módulos de ~200-300 líneas
- ✅ Separación clara de responsabilidades (Controller, Service, Routes)
- ✅ Integración con APIs externas aislada en `/integrations`
- ✅ Utilidades compartidas centralizadas en `/utils`
- ✅ Código más mantenible, testeable y escalable

---

## 📁 Nueva Estructura

```
/backend
 ├── src/
 │   ├── modules/              # Módulos de negocio
 │   │   ├── invoices/         # Facturas
 │   │   │   ├── invoice.service.js
 │   │   │   ├── invoice.controller.js
 │   │   │   ├── invoice.routes.js
 │   │   │   └── index.js
 │   │   ├── products/         # Productos
 │   │   ├── reports/          # Reportes
 │   │   └── ...
 │   │
 │   ├── integrations/         # Integraciones externas
 │   │   ├── alegra/
 │   │   │   ├── alegra.client.js      # Cliente HTTP base
 │   │   │   ├── alegra.config.js      # Configuración
 │   │   │   ├── services/
 │   │   │   │   ├── alegra-invoice.service.js
 │   │   │   │   ├── alegra-product.service.js
 │   │   │   │   └── alegra-contact.service.js
 │   │   │   └── index.js
 │   │   └── email/
 │   │
 │   ├── utils/                # Utilidades compartidas
 │   │   ├── database.helper.js
 │   │   ├── response.helper.js
 │   │   └── validators.js
 │   │
 │   └── app.js                # Configuración centralizada de Express
 │
 ├── config/                   # Configuración (sin cambios)
 ├── middleware/               # Middleware (sin cambios)
 ├── services/                 # Servicios legacy (deprecados)
 ├── routes/                   # Rutas legacy (deprecados)
 ├── server.js                 # Servidor original
 └── server-new.js             # Nuevo servidor modular
```

---

## 🚀 Cómo Migrar

### Opción 1: Migración Inmediata (Recomendado para desarrollo)

1. **Respaldar el servidor actual:**
   ```bash
   cp server.js server-old.js
   ```

2. **Reemplazar server.js con la nueva versión:**
   ```bash
   cp server-new.js server.js
   ```

3. **Reiniciar el servidor:**
   ```bash
   npm start
   ```

### Opción 2: Migración Gradual (Recomendado para producción)

1. **Probar el nuevo servidor en paralelo:**
   ```bash
   PORT=3001 node server-new.js
   ```

2. **Verificar que todos los endpoints funcionen correctamente**

3. **Cuando esté listo, reemplazar server.js:**
   ```bash
   cp server-new.js server.js
   ```

---

## 🔄 Mapeo de Rutas

### Facturas (Invoices)

| Antes                                      | Ahora                                      |
|-------------------------------------------|--------------------------------------------|
| `/api/alegra/facturas/buscar/numero/:num` | `/api/alegra/facturas/buscar/numero/:num` |
| `/api/alegra/facturas/buscar/cliente/:c`  | `/api/alegra/facturas/buscar/cliente/:c`  |
| `/api/alegra/facturas/siguiente-consecutivo` | `/api/alegra/facturas/siguiente-consecutivo` |
| `/api/alegra/facturas/:id/pdf`            | `/api/alegra/facturas/:id/pdf`            |
| `/api/alegra/facturas/:ano/:mes/:semana`  | `/api/alegra/facturas/:ano/:mes/:semana`  |
| `/api/alegra/facturas/procesar-individual` | `/api/alegra/facturas/procesar-individual` |

> **Nota:** Las rutas son las mismas, pero ahora están mejor organizadas internamente.

### Productos (Products)

| Antes                                      | Ahora                                      |
|-------------------------------------------|--------------------------------------------|
| `/api/alegra/productos`                   | `/api/alegra/productos`                   |
| `/api/alegra/productos/buscar`            | `/api/alegra/productos/buscar`            |
| `/api/alegra/productos/sin-proveedor`     | `/api/alegra/productos/sin-proveedor`     |
| `/api/alegra/sincronizar/productos`       | `/api/alegra/productos/sincronizar`       |

### Reportes (Reports)

| Antes                                      | Ahora                                      |
|-------------------------------------------|--------------------------------------------|
| `/api/alegra/reportes/faltantes/proveedor` | `/api/alegra/reportes/faltantes/proveedor` |
| `/api/alegra/reportes/faltantes/cliente`  | `/api/alegra/reportes/faltantes/cliente`  |
| `/api/alegra/reportes/historial`          | `/api/alegra/reportes/historial`          |

---

## 🛠️ Módulos Implementados

### ✅ Módulo: Invoices (Facturas)
- **Archivos:**
  - `src/modules/invoices/invoice.service.js` - Lógica de negocio
  - `src/modules/invoices/invoice.controller.js` - Controladores HTTP
  - `src/modules/invoices/invoice.routes.js` - Rutas

- **Funcionalidades:**
  - Búsqueda por número y cliente
  - Gestión de PDF
  - Procesamiento individual
  - Registro de faltantes
  - Reimpresión

### ✅ Módulo: Products (Productos)
- **Archivos:**
  - `src/modules/products/product.service.js`
  - `src/modules/products/product.controller.js`
  - `src/modules/products/product.routes.js`

- **Funcionalidades:**
  - Sincronización con Alegra
  - Búsqueda y paginación
  - Asignación de proveedores
  - Estadísticas

### ✅ Módulo: Reports (Reportes)
- **Archivos:**
  - `src/modules/reports/report.service.js`
  - `src/modules/reports/report.controller.js`
  - `src/modules/reports/report.routes.js`

- **Funcionalidades:**
  - Reporte de faltantes por cliente
  - Reporte de faltantes por proveedor
  - Historial de procesamientos
  - Limpieza de faltantes procesados

### ✅ Integración: Alegra
- **Archivos:**
  - `src/integrations/alegra/alegra.client.js` - Cliente HTTP base
  - `src/integrations/alegra/alegra.config.js` - Configuración
  - `src/integrations/alegra/services/alegra-invoice.service.js`
  - `src/integrations/alegra/services/alegra-product.service.js`
  - `src/integrations/alegra/services/alegra-contact.service.js`

### ✅ Utilidades
- **Archivos:**
  - `src/utils/database.helper.js` - Helpers para BD
  - `src/utils/response.helper.js` - Respuestas HTTP estandarizadas
  - `src/utils/validators.js` - Validaciones comunes

---

## 📝 Código Legacy

Los siguientes archivos se mantienen por compatibilidad pero deben migrarse:

- ❌ `routes/alegra.js` (4034 líneas) - **Migrado parcialmente**
- ❌ `routes/productosRevision.js` (1190 líneas) - **Pendiente**
- ❌ `routes/faltantes.js` - **Pendiente**
- ❌ `routes/revisionPrecios.js` - **Pendiente**
- ⚠️  `services/alegraService.js` - **Reemplazado por integrations/alegra/**

---

## ✅ Testing

### Probar Endpoints Modulares

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/api

# Buscar factura por número
curl http://localhost:3000/api/alegra/facturas/buscar/numero/3072

# Obtener productos
curl http://localhost:3000/api/alegra/productos?page=1&limit=10

# Reporte de faltantes por cliente
curl http://localhost:3000/api/alegra/reportes/faltantes/cliente
```

---

## 🚨 Posibles Problemas

### Problema 1: Imports Rotos
**Síntoma:** `Cannot find module`

**Solución:**
```bash
# Verificar que todas las dependencias estén instaladas
cd backend
npm install
```

### Problema 2: Rutas No Encontradas
**Síntoma:** 404 en endpoints que antes funcionaban

**Solución:** Verifica que estés usando `server-new.js` o que hayas actualizado `server.js`

### Problema 3: Error de Base de Datos
**Síntoma:** `Connection refused` o `Query failed`

**Solución:** Verifica que `config/database.js` esté correctamente configurado y que las variables de entorno estén definidas

---

## 📞 Soporte

Si encuentras problemas durante la migración:

1. Revisa los logs del servidor
2. Verifica que el archivo `.env` esté configurado
3. Comprueba que la base de datos esté accesible
4. Consulta esta guía

---

## 🎉 Beneficios de la Nueva Arquitectura

✅ **Mantenibilidad:** Código más fácil de entender y modificar
✅ **Escalabilidad:** Agregar nuevos módulos es sencillo
✅ **Testabilidad:** Cada capa puede testearse independientemente
✅ **Reutilización:** Utilidades y helpers compartidos
✅ **Separación de Responsabilidades:** Controller → Service → Integration
✅ **Documentación:** Código auto-documentado por su estructura

---

**¡La migración está completa! 🚀**

Ahora tienes una arquitectura modular, limpia y escalable.
