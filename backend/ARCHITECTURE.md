# 🏗️ Arquitectura del Sistema - Arquitectura Modular

## 📋 Índice
1. [Visión General](#visión-general)
2. [Estructura de Carpetas](#estructura-de-carpetas)
3. [Patrones de Diseño](#patrones-de-diseño)
4. [Flujo de Datos](#flujo-de-datos)
5. [Módulos](#módulos)
6. [Integraciones](#integraciones)
7. [Utilidades](#utilidades)

---

## 🎯 Visión General

Sistema de gestión de facturas y faltantes construido con **arquitectura limpia** y **modularización por dominio**. Cada módulo es independiente y se comunica a través de interfaces bien definidas.

### Principios Aplicados

- ✅ **Separation of Concerns:** Cada capa tiene una responsabilidad única
- ✅ **DRY (Don't Repeat Yourself):** Código reutilizable en utilidades compartidas
- ✅ **SOLID Principles:** Especialmente Single Responsibility y Dependency Injection
- ✅ **Clean Architecture:** Separación entre lógica de negocio e infraestructura

---

## 📁 Estructura de Carpetas

```
/backend
 ├── src/                          # Código fuente principal
 │   │
 │   ├── modules/                  # Módulos de dominio
 │   │   ├── invoices/             # Módulo de Facturas
 │   │   │   ├── invoice.service.js      # Lógica de negocio
 │   │   │   ├── invoice.controller.js   # Manejo de HTTP
 │   │   │   ├── invoice.routes.js       # Definición de rutas
 │   │   │   └── index.js                # Punto de entrada
 │   │   │
 │   │   ├── products/             # Módulo de Productos
 │   │   ├── reports/              # Módulo de Reportes
 │   │   ├── clients/              # (Futuro) Módulo de Clientes
 │   │   ├── suppliers/            # (Futuro) Módulo de Proveedores
 │   │   └── missing-items/        # (Futuro) Módulo de Faltantes
 │   │
 │   ├── integrations/             # Integraciones con APIs externas
 │   │   ├── alegra/               # Integración con Alegra
 │   │   │   ├── alegra.client.js        # Cliente HTTP base
 │   │   │   ├── alegra.config.js        # Configuración
 │   │   │   ├── services/               # Servicios específicos
 │   │   │   │   ├── alegra-invoice.service.js
 │   │   │   │   ├── alegra-product.service.js
 │   │   │   │   └── alegra-contact.service.js
 │   │   │   └── index.js
 │   │   │
 │   │   └── email/                # (Futuro) Integración con email
 │   │
 │   ├── utils/                    # Utilidades compartidas
 │   │   ├── database.helper.js    # Operaciones de BD genéricas
 │   │   ├── response.helper.js    # Respuestas HTTP estandarizadas
 │   │   └── validators.js         # Validaciones comunes
 │   │
 │   ├── shared/                   # Recursos compartidos
 │   │   ├── constants.js          # (Futuro) Constantes globales
 │   │   └── types.js              # (Futuro) Tipos TypeScript
 │   │
 │   └── app.js                    # Configuración de Express
 │
 ├── config/                       # Configuración
 │   ├── database.js               # Conexión a BD
 │   ├── external-database.js      # (Legacy)
 │   └── imap.js                   # Configuración IMAP
 │
 ├── middleware/                   # Middleware Express
 │   ├── auth.js                   # Autenticación
 │   └── validation.js             # Validación de requests
 │
 ├── services/                     # Servicios legacy (deprecado)
 ├── routes/                       # Rutas legacy (deprecado)
 │
 ├── server.js                     # Punto de entrada
 ├── server-new.js                 # Nuevo servidor modular
 └── package.json                  # Dependencias
```

---

## 🎨 Patrones de Diseño

### 1. Layered Architecture (Arquitectura en Capas)

```
┌─────────────────────────────────┐
│   Capa de Presentación (Routes) │
│   - Rutas HTTP                   │
│   - Middleware                   │
└─────────────────┬───────────────┘
                  │
┌─────────────────▼───────────────┐
│   Capa de Controladores          │
│   - Validación de entrada        │
│   - Manejo de errores HTTP       │
│   - Formateo de respuestas       │
└─────────────────┬───────────────┘
                  │
┌─────────────────▼───────────────┐
│   Capa de Servicios (Business)   │
│   - Lógica de negocio            │
│   - Orquestación de operaciones  │
│   - Transformación de datos      │
└─────────────────┬───────────────┘
                  │
┌─────────────────▼───────────────┐
│   Capa de Integración            │
│   - APIs externas (Alegra)       │
│   - Base de datos                │
│   - Servicios externos           │
└─────────────────────────────────┘
```

### 2. Dependency Injection

Los servicios se inyectan a través de constructores:

```javascript
// invoice.controller.js
class InvoiceController {
  constructor() {
    this.invoiceService = new InvoiceService();
  }
}

// invoice.service.js
class InvoiceService {
  constructor() {
    this.alegraInvoiceService = getAlegraInvoiceService();
  }
}
```

### 3. Singleton Pattern

Para clientes HTTP y conexiones:

```javascript
// alegra.client.js
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new AlegraClient();
    }
    return instance;
  }
};
```

### 4. Factory Pattern

Para crear instancias de servicios:

```javascript
// integrations/alegra/index.js
module.exports = {
  getInvoiceService: () => new AlegraInvoiceService(),
  getProductService: () => new AlegraProductService(),
  getContactService: () => new AlegraContactService()
};
```

---

## 🔄 Flujo de Datos

### Ejemplo: Buscar Factura por Número

```
1. Cliente HTTP
     │
     ├─► GET /api/alegra/facturas/buscar/numero/3072
     │
2. Route Handler (invoice.routes.js)
     │
     ├─► router.get('/buscar/numero/:numero', controller.searchByNumber)
     │
3. Controller (invoice.controller.js)
     │
     ├─► Valida parámetros
     ├─► Llama al Service
     │
4. Service (invoice.service.js)
     │
     ├─► Aplica lógica de negocio
     ├─► Llama a Alegra Integration
     │
5. Alegra Integration (alegra-invoice.service.js)
     │
     ├─► Construye request
     ├─► Llama a Alegra API
     │
6. Alegra API
     │
     ├─► Retorna datos
     │
7. Respuesta fluye de vuelta:
    Integration → Service → Controller → Route → Cliente
```

---

## 📦 Módulos

### Módulo: Invoices (Facturas)

**Responsabilidad:** Gestión completa de facturas

**Archivos:**
- `invoice.service.js` - Lógica de negocio
- `invoice.controller.js` - Controladores HTTP
- `invoice.routes.js` - Definición de rutas

**Endpoints:**
- `GET /buscar/numero/:numero` - Buscar por número
- `GET /buscar/cliente/:cliente` - Buscar por cliente
- `GET /siguiente-consecutivo` - Obtener siguiente número
- `GET /:id/pdf` - Obtener PDF
- `GET /:ano/:mes/:semana?` - Obtener por período
- `POST /procesar-individual` - Procesar factura
- `POST /:id/recuperar` - Recuperar factura procesada
- `POST /:id/faltantes` - Registrar faltantes

### Módulo: Products (Productos)

**Responsabilidad:** Gestión de productos y sincronización con Alegra

**Endpoints:**
- `GET /` - Listar productos (paginado)
- `GET /buscar` - Buscar productos
- `GET /sin-proveedor` - Productos sin proveedor
- `PUT /:id/proveedor` - Asignar proveedor
- `POST /sincronizar` - Sincronizar con Alegra
- `GET /estadisticas/sincronizacion` - Estadísticas

### Módulo: Reports (Reportes)

**Responsabilidad:** Generación de reportes

**Endpoints:**
- `GET /faltantes/proveedor` - Reporte por proveedor
- `GET /faltantes/cliente` - Reporte por cliente
- `DELETE /faltantes/proveedor/limpiar` - Limpiar faltantes
- `GET /historial` - Historial de procesamientos

---

## 🔌 Integraciones

### Alegra API

**Estructura:**
```
integrations/alegra/
├── alegra.client.js          # Cliente HTTP base
├── alegra.config.js          # Configuración (credenciales, URLs)
├── services/
│   ├── alegra-invoice.service.js    # Operaciones de facturas
│   ├── alegra-product.service.js    # Operaciones de productos
│   └── alegra-contact.service.js    # Operaciones de contactos
└── index.js                  # Exportación centralizada
```

**Características:**
- ✅ Manejo centralizado de autenticación
- ✅ Interceptores para logging
- ✅ Manejo de errores estandarizado
- ✅ Rate limiting
- ✅ Retry logic

---

## 🛠️ Utilidades

### database.helper.js

Operaciones CRUD genéricas sobre la base de datos:

```javascript
// Ejemplo de uso
const result = await DatabaseHelper.getById('facturas', 123);
const insertResult = await DatabaseHelper.insert('productos', { nombre: 'Producto X' });
```

### response.helper.js

Respuestas HTTP estandarizadas:

```javascript
// Éxito
ResponseHelper.success(res, data, 'Operación exitosa');

// Error
ResponseHelper.error(res, 'Mensaje de error', 400);

// Paginación
ResponseHelper.paginated(res, data, page, limit, total);
```

### validators.js

Validaciones comunes:

```javascript
Validators.required(value, 'Campo X');
Validators.email(email);
Validators.number(cantidad, 'Cantidad');
```

---

## 🚀 Extensibilidad

### Agregar un Nuevo Módulo

1. **Crear estructura:**
```bash
mkdir -p src/modules/nuevo-modulo
cd src/modules/nuevo-modulo
touch nuevo-modulo.service.js
touch nuevo-modulo.controller.js
touch nuevo-modulo.routes.js
touch index.js
```

2. **Implementar Service:**
```javascript
// nuevo-modulo.service.js
class NuevoModuloService {
  async operacion() {
    // Lógica de negocio
  }
}
```

3. **Implementar Controller:**
```javascript
// nuevo-modulo.controller.js
class NuevoModuloController {
  constructor() {
    this.service = new NuevoModuloService();
  }

  operacion = async (req, res) => {
    // Manejo HTTP
  };
}
```

4. **Definir Routes:**
```javascript
// nuevo-modulo.routes.js
const router = express.Router();
const controller = new NuevoModuloController();

router.get('/', controller.operacion);

module.exports = router;
```

5. **Registrar en app.js:**
```javascript
const nuevoModuloRoutes = require('./modules/nuevo-modulo');
app.use('/api/nuevo-modulo', nuevoModuloRoutes);
```

---

## 📊 Métricas y Monitoreo

### Health Check

```bash
GET /health
```

Retorna:
```json
{
  "status": "OK",
  "database": "Connected",
  "architecture": "Modular",
  "timestamp": "2025-11-04T12:00:00.000Z"
}
```

### API Info

```bash
GET /api
```

Retorna:
```json
{
  "message": "API Sistema de Faltantes - Arquitectura Modular",
  "version": "2.0.0",
  "modules": ["invoices", "products", "reports"],
  "timestamp": "2025-11-04T12:00:00.000Z"
}
```

---

## 🧪 Testing

### Testing por Capas

**Unit Tests:**
- Services (lógica de negocio)
- Utils (funciones puras)

**Integration Tests:**
- Controllers + Services
- Integrations (mocked)

**End-to-End Tests:**
- Flujo completo de endpoints

### Ejemplo de Test

```javascript
// invoice.service.test.js
describe('InvoiceService', () => {
  it('should search invoice by number', async () => {
    const service = new InvoiceService();
    const result = await service.searchByNumber('3072');
    expect(result.success).toBe(true);
  });
});
```

---

## 📝 Convenciones de Código

### Naming Conventions

- **Archivos:** `kebab-case.js` (e.g., `invoice.service.js`)
- **Clases:** `PascalCase` (e.g., `InvoiceService`)
- **Funciones:** `camelCase` (e.g., `searchByNumber`)
- **Constantes:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)

### Estructura de Archivos

```javascript
// 1. Imports
const Service = require('./service');

// 2. Clase principal
class Controller {
  constructor() {
    // Inicialización
  }

  // 3. Métodos públicos
  metodoPublico = async (req, res) => {
    // Implementación
  };

  // 4. Métodos privados
  _metodoPrivado() {
    // Implementación
  }
}

// 5. Export
module.exports = Controller;
```

---

## 🔐 Seguridad

### Buenas Prácticas Implementadas

- ✅ Validación de entrada en controladores
- ✅ Sanitización de datos
- ✅ Protección CORS configurada
- ✅ Helmet para headers de seguridad
- ✅ Variables de entorno para credenciales
- ✅ Logging de errores sin exponer información sensible

---

## 📚 Referencias

- [Clean Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

**Última actualización:** 2025-11-04
**Versión:** 2.0.0
