# ⚡ Guía de Instalación Completa

## Prerrequisitos

Asegúrate de tener instalado:
- ✅ Node.js 18 o superior
- ✅ PostgreSQL (local o remoto)
- ✅ Git
- ✅ Token API de Alegra

## Paso 1: Clonar Repositorio

```bash
git clone [tu-repositorio]
cd sistema-facturas-cr
```

## Paso 2: Configurar Base de Datos

### Opción A: PostgreSQL Local

1. Crear base de datos:
```sql
CREATE DATABASE facturas_cr;
```

2. Ejecutar migraciones:
```bash
cd backend
npx prisma migrate dev
```

### Opción B: PostgreSQL Remoto

Usa tu URL de conexión en el archivo `.env`

## Paso 3: Configurar Backend

```bash
cd backend
npm install
```

Crear archivo `.env`:
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/facturas_cr"
ALEGRA_USER="tu_email@gmail.com"
ALEGRA_TOKEN="tu_token_de_alegra"
PORT=3000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

Generar Prisma Client:
```bash
npx prisma generate
```

## Paso 4: Configurar Frontend

```bash
cd ../frontend
npm install
```

## Paso 5: Iniciar la Aplicación

Abre **DOS terminales**:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

Deberías ver:
```
✅ Backend corriendo en http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Deberías ver:
```
➜  Local:   http://localhost:5173/
```

## Paso 6: Verificar Instalación

1. Abrir navegador: http://localhost:5173
2. Deberías ver el Dashboard
3. Click en "Revisión de Precios" para verificar la nueva funcionalidad

## Paso 7: Sincronizar Productos de Alegra

Desde la terminal o Postman:
```bash
curl -X POST http://localhost:3000/api/alegra/sincronizar
```

O desde el frontend ir a Configuración → Sincronizar Productos

## 🎯 Verificación de Salud

```bash
# Backend
curl http://localhost:3000/health

# Debería responder:
# {"status":"OK","timestamp":"..."}
```

## 📱 Configuración Email (Opcional)

Para recepción automática de facturas por email, agrega a `.env`:

```env
IMAP_USER="tu_email@gmail.com"
IMAP_PASSWORD="tu_password_app"
IMAP_HOST="imap.gmail.com"
IMAP_PORT=993
IMAP_TLS=true
```

**Nota:** Para Gmail necesitas una "Contraseña de Aplicación", no tu contraseña normal.

## 🐛 Solución de Problemas

### Error: "Cannot find module '@prisma/client'"
```bash
cd backend
rm -rf node_modules
npm install
npx prisma generate
```

### Error: "ECONNREFUSED ::1:5432"
- Verifica que PostgreSQL esté corriendo
- Verifica la URL de conexión en `.env`

### Error: "Prisma schema not found"
```bash
cd backend
npx prisma generate
```

### Puerto 3000 en uso
Cambia el puerto en `backend/.env`:
```env
PORT=3001
```

Y actualiza la URL en `frontend/src/services/api.js`

### CORS Error
Verifica que `FRONTEND_URL` en backend `.env` coincida con la URL del frontend

## 🔄 Actualizar la Aplicación

```bash
git pull
cd backend && npm install && npx prisma generate
cd ../frontend && npm install
```

## 🚀 Despliegue a Producción

### Backend (Render, Railway, etc)

1. Configura variables de entorno
2. Ejecuta:
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm start
```

### Frontend (Vercel, Netlify)

1. Build:
```bash
cd frontend
npm run build
```

2. Deploy carpeta `dist/`

## 📊 Comandos Útiles

```bash
# Ver logs del backend
cd backend && npm run dev

# Regenerar Prisma
cd backend && npx prisma generate

# Ver BD en navegador
cd backend && npx prisma studio

# Build frontend
cd frontend && npm run build

# Preview build
cd frontend && npm run preview
```

## ✅ Checklist Final

- [ ] Node.js instalado
- [ ] PostgreSQL corriendo
- [ ] Backend dependencies instaladas
- [ ] Frontend dependencies instaladas
- [ ] .env configurado
- [ ] Prisma generado
- [ ] Backend corriendo en :3000
- [ ] Frontend corriendo en :5173
- [ ] Productos de Alegra sincronizados
- [ ] Dashboard carga correctamente
- [ ] "Revisión de Precios" funciona

## 🎉 ¡Listo!

Tu sistema está instalado y listo para usar.

**Siguiente paso:** Sincroniza productos de Alegra y comienza a procesar facturas.

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs del backend
2. Revisa la consola del navegador (F12)
3. Verifica que PostgreSQL esté accesible
4. Confirma las credenciales de Alegra
