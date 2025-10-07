# 🚀 Guía de Deploy en Render

## ⚠️ IMPORTANTE: Variables de Entorno Actualizadas

Después de la migración, necesitas actualizar la configuración en Render.

---

## 📋 Variables de Entorno para Backend

Ve a tu servicio en Render → **Environment** y configura:

```bash
# Base de Datos
DATABASE_URL=postgresql://usuario:password@host:5432/db_name

# Alegra API
ALEGRA_USER=tachifacturas@gmail.com
ALEGRA_TOKEN=b3a84abb6897180d3889

# Email (Opcional)
IMAP_USER=tu_email@gmail.com
IMAP_PASSWORD=tu_password_app
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true

# Servidor
PORT=3000
NODE_ENV=production

# Frontend URL (IMPORTANTE - Actualizar con tu URL de Render)
FRONTEND_URL=https://tu-frontend.onrender.com
```

---

## 🔄 Cambios en la Estructura

### Antes:
```
sistema-facturas-cr/
├── server.js          ← Punto de entrada
├── package.json
└── ...
```

### Ahora:
```
sistema-facturas-cr/
├── backend/
│   ├── server.js      ← NUEVO punto de entrada
│   └── package.json
└── frontend/
    └── ...
```

---

## ⚙️ Configuración del Backend en Render

### 1. Build Command
```bash
cd backend && npm install && npx prisma generate
```

### 2. Start Command
```bash
cd backend && npm start
```

### 3. Root Directory
Dejar en **/** (raíz) o cambiar a **/backend** si Render lo permite

---

## 🎨 Configuración del Frontend en Render

### 1. Build Command
```bash
cd frontend && npm install && npm run build
```

### 2. Publish Directory
```
frontend/dist
```

### 3. Root Directory
Dejar en **/** (raíz)

---

## 🔄 Migraciones de Base de Datos

Si necesitas ejecutar migraciones:

```bash
cd backend && npx prisma migrate deploy
```

Puedes agregarlo al **Build Command**:
```bash
cd backend && npm install && npx prisma generate && npx prisma migrate deploy
```

---

## ✅ Checklist de Deploy

### Backend
- [ ] Variables de entorno actualizadas
- [ ] Build Command actualizado
- [ ] Start Command actualizado
- [ ] DATABASE_URL configurado
- [ ] Prisma migraciones ejecutadas
- [ ] FRONTEND_URL configurado para CORS

### Frontend
- [ ] Build Command actualizado
- [ ] Publish Directory configurado a `frontend/dist`
- [ ] API URL apunta al backend correcto

---

## 🧪 Verificar Deploy

Después del deploy, verifica:

```bash
# Backend Health Check
curl https://tu-backend.onrender.com/health

# Debería responder:
# {"status":"OK","timestamp":"..."}
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module"
**Solución:** Asegúrate que el Build Command incluya `cd backend`

### Error: "Prisma Client not found"
**Solución:** Agrega `npx prisma generate` al Build Command

### Error: CORS
**Solución:** Verifica que `FRONTEND_URL` en backend apunte a tu frontend de Render

### Error: "Cannot connect to database"
**Solución:** Verifica `DATABASE_URL` en las variables de entorno

---

## 📝 Ejemplo Completo de Configuración

### Backend Service en Render:
```yaml
Name: sistema-facturas-backend
Environment: Node
Build Command: cd backend && npm install && npx prisma generate
Start Command: cd backend && npm start
Environment Variables:
  - DATABASE_URL=postgresql://...
  - ALEGRA_USER=tachifacturas@gmail.com
  - ALEGRA_TOKEN=b3a84abb6897180d3889
  - NODE_ENV=production
  - PORT=3000
  - FRONTEND_URL=https://tu-frontend.onrender.com
```

### Frontend Service en Render:
```yaml
Name: sistema-facturas-frontend
Environment: Static Site
Build Command: cd frontend && npm install && npm run build
Publish Directory: frontend/dist
Environment Variables:
  - VITE_API_URL=https://tu-backend.onrender.com
```

---

## 🔄 Próximos Pasos

1. **Actualizar variables de entorno en Render**
2. **Modificar Build/Start Commands**
3. **Hacer push del código:**
   ```bash
   git add .
   git commit -m "feat: Migración completa a React"
   git push
   ```
4. **Render automáticamente re-deployará**
5. **Verificar que todo funcione**

---

**¡Listo para deploy!** 🚀
