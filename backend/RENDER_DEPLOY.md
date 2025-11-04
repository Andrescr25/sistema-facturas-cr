# 🚀 Guía de Despliegue en Render - Nueva Arquitectura

## 📋 Pasos para Desplegar en Render

### Opción 1: Reemplazar server.js (RECOMENDADO - Más Sencillo)

Esta opción no requiere cambios en la configuración de Render.

```bash
cd backend

# 1. Hacer backup del servidor actual
cp server.js server-old.js

# 2. Reemplazar con el nuevo servidor
cp server-new.js server.js

# 3. Verificar que funciona localmente
npm start

# 4. Hacer commit y push
git add .
git commit -m "feat: Migrar a arquitectura modular"
git push origin main
```

**Render detectará el cambio automáticamente y hará el deploy.**

---

### Opción 2: Cambiar el Script de Start

Si prefieres mantener ambos servidores por un tiempo:

#### Paso 1: Actualizar package.json

Edita `backend/package.json` y cambia:

```json
{
  "scripts": {
    "start": "node server-new.js",
    "start:old": "node server.js",
    "dev": "nodemon server-new.js"
  }
}
```

#### Paso 2: Commit y Push

```bash
git add backend/package.json
git commit -m "feat: Actualizar script de start para nueva arquitectura"
git push origin main
```

---

## ✅ Verificación del Deploy

### 1. Espera a que Render termine el deploy

Ve a tu dashboard de Render:
```
https://dashboard.render.com
```

Verás algo como:
```
✓ Build successful
✓ Deploy live
```

### 2. Verifica el Health Check

```bash
curl https://sistema-facturas-cr-web.onrender.com/health
```

**Respuesta esperada:**
```json
{
  "status": "OK",
  "database": "Connected",
  "architecture": "Modular",
  "timestamp": "2025-11-04T..."
}
```

### 3. Verifica la Info de API

```bash
curl https://sistema-facturas-cr-web.onrender.com/api
```

**Respuesta esperada:**
```json
{
  "message": "API Sistema de Faltantes - Arquitectura Modular",
  "version": "2.0.0",
  "modules": ["invoices", "products", "reports"],
  "timestamp": "2025-11-04T..."
}
```

### 4. Prueba un Endpoint Real

```bash
curl https://sistema-facturas-cr-web.onrender.com/api/alegra/facturas/buscar/numero/3072
```

---

## 🔧 Configuración de Render (Ya debería estar lista)

Tu configuración actual de Render debería ser:

```yaml
Build Command: npm install
Start Command: npm start
```

**No necesitas cambiar nada si usas la Opción 1.**

Si usas la Opción 2, asegúrate de que el Start Command sea:
```
npm start
```

---

## 📝 Variables de Entorno en Render

Verifica que tengas estas variables configuradas en Render:

```bash
# Base de datos
DATABASE_URL=postgresql://...

# Alegra API
ALEGRA_TOKEN=tu_token
ALEGRA_USER=tu_usuario

# Email (opcional)
IMAP_HOST=imap.gmail.com
IMAP_USER=tu_email@gmail.com
IMAP_PASSWORD=tu_password
IMAP_PORT=993

# Configuración
NODE_ENV=production
```

---

## 🚨 Solución de Problemas

### Problema 1: Deploy falla con "Cannot find module"

**Solución:**
```bash
# Verifica que src/ esté en el repositorio
git add src/
git commit -m "fix: Agregar carpeta src/"
git push
```

### Problema 2: "Port already in use"

**Causa:** Render asigna el puerto automáticamente

**Solución:** No necesitas hacer nada, el código ya usa `process.env.PORT`

### Problema 3: Rutas retornan 404

**Verificar:**
1. Que estés usando `server-new.js` o que hayas reemplazado `server.js`
2. Que los archivos de `src/` estén en el repositorio
3. Que el deploy haya terminado exitosamente

**Comando para verificar archivos:**
```bash
git ls-files | grep "src/"
```

Si no ves archivos de `src/`, necesitas agregarlos:
```bash
git add src/
git commit -m "fix: Agregar directorio src/"
git push
```

### Problema 4: Error de base de datos

**Verificar variables de entorno en Render:**
1. Ve a tu servicio en Render Dashboard
2. Click en "Environment"
3. Verifica que `DATABASE_URL` esté configurado correctamente

---

## 📦 Estructura de Archivos en Render

Después del deploy, Render tendrá esta estructura:

```
/opt/render/project/src/backend/
├── src/                    ← NUEVA CARPETA
│   ├── modules/
│   ├── integrations/
│   ├── utils/
│   └── app.js
├── config/
├── middleware/
├── services/
├── routes/
├── server.js              ← Reemplazado o usando server-new.js
├── package.json
└── node_modules/
```

---

## 🎯 Checklist de Deploy

Antes de hacer push a Render, verifica:

- [ ] ✅ Funciona localmente con `npm start`
- [ ] ✅ Health check responde en local
- [ ] ✅ Todos los archivos de `src/` están en git
- [ ] ✅ `server.js` está actualizado (Opción 1) o `package.json` modificado (Opción 2)
- [ ] ✅ No hay errores en consola local
- [ ] ✅ Variables de entorno están configuradas en Render

---

## 🔄 Proceso Completo Paso a Paso

### Para Desarrollo Local

```bash
# 1. Navega al directorio backend
cd backend

# 2. Crea backup
cp server.js server-backup.js

# 3. Reemplaza con nuevo servidor
cp server-new.js server.js

# 4. Prueba localmente
npm install
npm start

# 5. Verifica en otra terminal
curl http://localhost:3000/health
```

### Para Deploy en Render

```bash
# 6. Si todo funciona, haz commit
git add .
git commit -m "feat: Implementar arquitectura modular

- Refactorizar código a módulos por dominio
- Separar integraciones en /integrations
- Agregar utilidades compartidas en /utils
- Crear documentación completa
- Mantener compatibilidad con rutas existentes"

# 7. Push a GitHub/GitLab
git push origin main

# 8. Render detectará el cambio automáticamente
# Ve al dashboard: https://dashboard.render.com

# 9. Espera a que el deploy termine (1-3 minutos)

# 10. Verifica el deploy
curl https://sistema-facturas-cr-web.onrender.com/health
curl https://sistema-facturas-cr-web.onrender.com/api

# 11. Prueba un endpoint real
curl https://sistema-facturas-cr-web.onrender.com/api/alegra/facturas/buscar/numero/3072
```

---

## 🎉 ¡Deploy Exitoso!

Si todos los checks pasaron:

✅ Tu nueva arquitectura modular está en producción
✅ Todas las rutas funcionan igual que antes
✅ El código es ahora más mantenible
✅ La documentación está disponible

---

## 📊 Monitoreo Post-Deploy

### Ver Logs en Render

1. Ve a tu dashboard de Render
2. Click en tu servicio
3. Click en la pestaña "Logs"
4. Busca estos mensajes:

```
🚀 SERVIDOR INICIADO
📦 ARQUITECTURA MODULAR ACTIVA
   ✅ Módulo: Invoices (Facturas)
   ✅ Módulo: Products (Productos)
   ✅ Módulo: Reports (Reportes)
```

### Verificar Métricas

Render te mostrará:
- **CPU Usage:** Debería ser similar al anterior
- **Memory:** Podría ser ligeramente menor (código más eficiente)
- **Response Time:** Debería ser igual o mejor

---

## 🔙 Rollback (Si algo sale mal)

Si necesitas volver al servidor anterior:

```bash
# Opción 1: Si reemplazaste server.js
cp server-backup.js server.js
git add server.js
git commit -m "rollback: Volver a servidor anterior temporalmente"
git push

# Opción 2: Si cambiaste package.json
# Edita package.json y regresa a:
{
  "scripts": {
    "start": "node server.js"
  }
}
git add package.json
git commit -m "rollback: Volver a script de start anterior"
git push
```

---

## 💡 Tips Adicionales

### Tip 1: Deploy con Auto-Deploy Desactivado

Si quieres más control:

1. Ve a Render Dashboard
2. Click en tu servicio
3. Settings → Build & Deploy
4. Desactiva "Auto-Deploy"
5. Ahora debes hacer deploy manual desde el dashboard

### Tip 2: Preview Deploys (Branches)

Para probar en una rama separada:

```bash
# Crea una rama para testing
git checkout -b feature/modular-architecture

# Haz los cambios
cp server-new.js server.js

# Push a la rama
git push origin feature/modular-architecture

# En Render, crea un Preview Deploy desde esa rama
```

### Tip 3: Variables de Entorno por Ambiente

Si tienes staging y producción:

**Staging:**
```
NODE_ENV=staging
ENABLE_EMAIL_MONITORING=false
```

**Producción:**
```
NODE_ENV=production
ENABLE_EMAIL_MONITORING=true
```

---

## 📚 Recursos

- [Render Docs](https://render.com/docs)
- [QUICK_START.md](./QUICK_START.md) - Testing local
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Guía completa
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Documentación técnica

---

**¡Listo para deploy! 🚀**

Cualquier duda, revisa los logs en Render o esta documentación.
