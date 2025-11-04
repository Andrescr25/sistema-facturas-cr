# 🚀 Quick Start - Nueva Arquitectura Modular

## 📋 Índice Rápido
1. [Iniciar el Servidor](#iniciar-el-servidor)
2. [Verificar Funcionamiento](#verificar-funcionamiento)
3. [Probar Endpoints](#probar-endpoints)
4. [Estructura Visual](#estructura-visual)
5. [Resolver Problemas](#resolver-problemas)

---

## 🏃 Iniciar el Servidor

### Opción 1: Probar sin modificar nada (RECOMENDADO PRIMERO)

```bash
cd backend
PORT=3001 node server-new.js
```

Esto inicia el nuevo servidor en el puerto 3001 sin afectar tu servidor actual.

### Opción 2: Reemplazar el servidor actual (después de probar)

```bash
cd backend
cp server.js server-backup.js  # Respaldo
cp server-new.js server.js     # Reemplazar
npm start                      # Iniciar
```

---

## ✅ Verificar Funcionamiento

### 1. Health Check

```bash
curl http://localhost:3000/health
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

### 2. API Info

```bash
curl http://localhost:3000/api
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

---

## 🧪 Probar Endpoints

### Módulo: Invoices (Facturas)

```bash
# Buscar factura por número
curl http://localhost:3000/api/alegra/facturas/buscar/numero/3072

# Buscar facturas por cliente
curl http://localhost:3000/api/alegra/facturas/buscar/cliente/NOMBRE_CLIENTE

# Obtener siguiente consecutivo
curl http://localhost:3000/api/alegra/facturas/siguiente-consecutivo

# Obtener facturas pendientes de reimpresión
curl http://localhost:3000/api/alegra/facturas/pendientes-reimpresion
```

### Módulo: Products (Productos)

```bash
# Listar productos (paginado)
curl "http://localhost:3000/api/alegra/productos?page=1&limit=10"

# Buscar productos
curl "http://localhost:3000/api/alegra/productos/buscar?query=arroz"

# Obtener estadísticas
curl http://localhost:3000/api/alegra/productos/estadisticas/sincronizacion

# Productos sin proveedor
curl http://localhost:3000/api/alegra/productos/sin-proveedor
```

### Módulo: Reports (Reportes)

```bash
# Reporte de faltantes por cliente
curl http://localhost:3000/api/alegra/reportes/faltantes/cliente

# Reporte de faltantes por proveedor
curl http://localhost:3000/api/alegra/reportes/faltantes/proveedor

# Historial de procesamientos
curl http://localhost:3000/api/alegra/reportes/historial
```

---

## 📁 Estructura Visual

```
Tu servidor ahora tiene esta estructura:

┌─────────────────────────────────────────┐
│         Express Application              │
│         (src/app.js)                     │
└─────────────────┬───────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐         ┌───────▼────────┐
│  Módulos  │         │ Integraciones  │
│           │         │                │
│ invoices  │         │    alegra/     │
│ products  │         │    email/      │
│ reports   │         └────────────────┘
└───────────┘
      │
┌─────▼─────────────────────────────┐
│         Utilidades                │
│                                   │
│  database.helper.js               │
│  response.helper.js               │
│  validators.js                    │
└───────────────────────────────────┘
```

---

## 🔍 Verificar Archivos Creados

```bash
cd backend

# Ver estructura de módulos
tree -L 3 src/modules/

# Ver estructura de integraciones
tree -L 3 src/integrations/

# Ver utilidades
ls -lh src/utils/

# Ver documentación
ls -lh *.md
```

**Deberías ver:**
- ✅ `MIGRATION_GUIDE.md` - Guía de migración
- ✅ `ARCHITECTURE.md` - Documentación de arquitectura
- ✅ `REFACTORING_SUMMARY.md` - Resumen del trabajo
- ✅ `QUICK_START.md` - Este archivo

---

## 🐛 Resolver Problemas

### Problema: "Cannot find module"

```bash
# Asegúrate de que las dependencias estén instaladas
cd backend
npm install
```

### Problema: "Port already in use"

```bash
# Usa un puerto diferente
PORT=3001 node server-new.js

# O detén el proceso en el puerto
lsof -ti:3000 | xargs kill -9
```

### Problema: "Database connection failed"

```bash
# Verifica el archivo .env
cat .env | grep DATABASE_URL

# Verifica que la BD esté accesible
psql $DATABASE_URL -c "SELECT 1"
```

### Problema: Rutas retornan 404

**Causa:** Probablemente estás usando el servidor viejo

**Solución:**
```bash
# Verifica qué servidor está corriendo
ps aux | grep node

# Detén todos los procesos de Node
killall node

# Inicia el servidor nuevo
node server-new.js
```

---

## 📊 Comparar Antes vs Ahora

### Antes
```bash
# Archivo gigante de 4000+ líneas
wc -l routes/alegra.js
# Output: 4034 routes/alegra.js
```

### Ahora
```bash
# Archivos modulares pequeños
wc -l src/modules/*/*.js
# Output:
#   133 src/modules/invoices/index.js
#  8000 src/modules/invoices/invoice.controller.js
#  1400 src/modules/invoices/invoice.routes.js
# 16000 src/modules/invoices/invoice.service.js
#   ... (todos < 500 líneas)
```

---

## 🎯 Checklist de Validación

Marca cuando completes cada paso:

- [ ] ✅ Servidor arranca sin errores
- [ ] ✅ Health check retorna OK
- [ ] ✅ Endpoint de facturas funciona
- [ ] ✅ Endpoint de productos funciona
- [ ] ✅ Endpoint de reportes funciona
- [ ] ✅ Base de datos conecta correctamente
- [ ] ✅ No hay errores en consola
- [ ] ✅ Frontend se conecta correctamente

---

## 🔗 Recursos Adicionales

### Documentación
- 📖 [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Guía completa de migración
- 📖 [ARCHITECTURE.md](./ARCHITECTURE.md) - Documentación de arquitectura
- 📖 [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Resumen ejecutivo

### Comandos Útiles

```bash
# Ver logs en tiempo real
tail -f logs/app.log

# Reiniciar servidor con PM2
pm2 restart server-new

# Ver estado de procesos
pm2 status

# Monitorear en tiempo real
pm2 monit
```

---

## 💡 Tips y Trucos

### Tip 1: Testing Rápido
```bash
# Usa un script de testing
cat > test-endpoints.sh << 'EOF'
#!/bin/bash
echo "Testing Health..."
curl -s http://localhost:3000/health | jq

echo "\nTesting Facturas..."
curl -s http://localhost:3000/api/alegra/facturas/buscar/numero/3072 | jq

echo "\nTesting Productos..."
curl -s "http://localhost:3000/api/alegra/productos?page=1&limit=5" | jq
EOF

chmod +x test-endpoints.sh
./test-endpoints.sh
```

### Tip 2: Desarrollo con Nodemon
```bash
# Instalar nodemon si no lo tienes
npm install -g nodemon

# Usar para auto-reload
nodemon server-new.js
```

### Tip 3: Debug Mode
```bash
# Activar debug de Node
NODE_ENV=development DEBUG=* node server-new.js
```

---

## 🎉 ¡Todo Listo!

Si llegaste hasta aquí y todos los checks están ✅, entonces:

**🚀 Tu servidor está corriendo con la nueva arquitectura modular.**

### Próximos Pasos

1. ✅ Probar con tu frontend
2. ✅ Revisar logs por posibles warnings
3. ✅ Leer MIGRATION_GUIDE.md para más detalles
4. ✅ Considerar migrar endpoints restantes

---

## 📞 ¿Necesitas Ayuda?

Si algo no funciona:
1. Revisa los logs del servidor
2. Verifica el archivo `.env`
3. Consulta [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
4. Revisa [ARCHITECTURE.md](./ARCHITECTURE.md)

---

**¡Feliz codificación! 🎊**

*Última actualización: 2025-11-04*
*Versión: 2.0.0*
