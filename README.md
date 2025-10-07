# 🏢 Sistema de Gestión Integrado - Distribuidora Tachi

Sistema completo de gestión de faltantes y revisión de precios con integración a Alegra.

## 🚀 Inicio Rápido

### 1. Instalar Backend
```bash
cd backend
npm install
npx prisma generate
```

### 2. Configurar Variables de Entorno
Crea `backend/.env` basado en `.env.example`:
```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/db_name"
ALEGRA_USER="tu_email@gmail.com"
ALEGRA_TOKEN="tu_token_alegra"
PORT=3000
```

### 3. Instalar Frontend
```bash
cd ../frontend
npm install
```

### 4. Iniciar Aplicación

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Abrir: http://localhost:5173

## 📋 Características

### ✅ Gestión de Faltantes
- Registro de productos faltantes
- Reportes por proveedor y cliente
- Seguimiento de entregas
- Reimpresión de facturas

### ✅ Revisión de Precios (Nuevo)
- Procesamiento de facturas electrónicas CR
- Relacionado inteligente con Alegra
- Sugerencias automáticas
- Actualización de precios sincronizada
- Análisis y comparación

### ✅ Integración Alegra
- Sincronización de productos
- Actualización en tiempo real
- Cache local optimizado
- Búsqueda avanzada

## 📐 Estructura del Proyecto

```
sistema-facturas-cr/
├── backend/
│   ├── config/           # Configuración DB
│   ├── middleware/       # Auth y validación
│   ├── routes/           # Endpoints API
│   ├── services/         # Lógica de negocio
│   ├── prisma/           # Schema DB
│   └── server.js         # Servidor Express
│
└── frontend/
    └── src/
        ├── pages/        # Páginas React
        ├── components/   # Componentes reutilizables
        └── services/     # APIs cliente
```

## 🎯 Navegación

- 📊 Dashboard
- 🔍 Buscar Factura
- 📦 Registrar Faltantes
- 👥 Reporte Proveedores
- 📈 Reporte Clientes
- 💰 **Revisión de Precios** ← Nuevo
- 🖨️ Reimpresión
- ⚙️ Configuración

## 🛠️ Tecnologías

**Frontend:**
- React 18 + Vite
- Tailwind CSS
- React Router
- Axios

**Backend:**
- Node.js + Express
- Prisma ORM
- PostgreSQL
- Axios

## 📊 API Endpoints

### Facturas
```
GET/POST  /api/facturas
GET       /api/facturas/:id
GET       /api/facturas/buscar/:termino
```

### Faltantes
```
GET/POST  /api/faltantes
GET       /api/faltantes/factura/:id
```

### Revisión de Precios
```
GET   /api/revision-precios/facturas
GET   /api/revision-precios/productos-pendientes
POST  /api/revision-precios/confirmar-producto
POST  /api/revision-precios/actualizar-precio
```

### Productos (Revisión)
```
GET     /api/productos-revision/relacionados
POST    /api/productos-revision/ajustar
PUT     /api/productos-revision/:id/editar-relacion
DELETE  /api/productos-revision/:id/relacion
GET     /api/productos-revision/buscar-alegra
```

### Alegra
```
GET   /api/alegra/productos
POST  /api/alegra/sincronizar
```

## 🔧 Scripts Disponibles

### Backend
```bash
npm start     # Producción
npm run dev   # Desarrollo con nodemon
```

### Frontend
```bash
npm run dev      # Desarrollo
npm run build    # Build producción
npm run preview  # Preview build
```

## 📝 Requisitos

- Node.js 18+
- PostgreSQL
- Cuenta Alegra con API token

## 🐛 Troubleshooting

### Error: Prisma Client
```bash
cd backend
npm install
npx prisma generate
```

### Error: CORS
Verifica `FRONTEND_URL` en `.env` del backend

### Sincronizar Productos
```bash
curl -X POST http://localhost:3000/api/alegra/sincronizar
```

## 📄 Licencia

MIT

---

**Versión**: 2.0  
**Estado**: ✅ Producción