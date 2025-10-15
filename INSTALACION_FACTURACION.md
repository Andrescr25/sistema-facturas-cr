# 📦 Instalación - Sistema de Facturación

## 🚀 Pasos de Instalación

### 1. Instalar Dependencias NPM

El sistema requiere las siguientes librerías adicionales:

```bash
# Navegar al directorio del frontend
cd frontend

# Instalar jsPDF y jsPDF-AutoTable para generación de PDFs
npm install jspdf jspdf-autotable
```

### 2. Verificar Instalación

Después de instalar, verifica que las dependencias estén en `package.json`:

```json
{
  "dependencies": {
    ...
    "jspdf": "^2.5.1",
    "jspdf-autotable": "^3.8.2"
  }
}
```

### 3. Verificar Variables de Entorno

Las credenciales de Alegra ya están configuradas en el backend:

```env
# backend/.env o variables de entorno de Render
ALEGRA_USER=tachifacturas@gmail.com
ALEGRA_EMAIL=tachifacturas@gmail.com
ALEGRA_TOKEN=b3a84abb6897180d3889
ALEGRA_BASE_URL=https://api.alegra.com/api/v1
```

### 4. Iniciar Aplicación

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5. Primera Vez - Descargar Catálogo

Al abrir la aplicación por primera vez:

1. Navega a **"Facturación"** en el menú
2. Asegúrate de tener conexión a internet
3. Haz click en el botón **"Actualizar"** 
4. Espera ~5-10 segundos mientras descarga:
   - ~1600 productos de Alegra
   - Todos los clientes
   - Impuestos configurados

**¡Listo! Ahora puedes usar el sistema offline.**

## ✅ Verificación

### Test de Funcionamiento

1. **Online**: Crea una factura con internet
   - ✅ Debe crear factura en Alegra
   - ✅ Debe descargar PDF automáticamente
   - ✅ Indicador debe mostrar "Online" (verde)

2. **Offline**: Desconecta internet y crea una factura
   - ✅ Debe guardar factura localmente
   - ✅ Debe descargar PDF automáticamente
   - ✅ Indicador debe mostrar "Offline" (naranja)
   - ✅ Debe aparecer en "Facturas Pendientes"

3. **Sincronización**: Reconecta internet
   - ✅ Debe detectar conexión automáticamente
   - ✅ Debe sincronizar facturas pendientes
   - ✅ Debe mostrar notificación de sincronización exitosa

### Verificar IndexedDB

1. Abre Chrome DevTools (F12)
2. Ve a la pestaña **"Application"**
3. En el menú izquierdo, expande **"IndexedDB"**
4. Deberías ver: `SistemaFacturasCR`
5. Expande y verifica:
   - ✅ `productos` (debe tener ~1600 registros)
   - ✅ `clientes` (debe tener los clientes de Alegra)
   - ✅ `facturas_pendientes` (vacío inicialmente)
   - ✅ `configuracion` (debe tener timestamps)

## 📱 Dispositivos Soportados

### Navegadores Requeridos

| Navegador | Versión Mínima | Soporte |
|-----------|----------------|---------|
| Chrome | 80+ | ✅ Completo |
| Firefox | 75+ | ✅ Completo |
| Safari | 13+ | ✅ Completo |
| Edge | 80+ | ✅ Completo |
| Opera | 67+ | ✅ Completo |

**No soportado:**
- ❌ Internet Explorer (cualquier versión)
- ❌ Navegadores muy antiguos (sin IndexedDB)

### Dispositivos Móviles

- ✅ Android 8.0+ (Chrome)
- ✅ iOS 13+ (Safari)
- ✅ Tablets (iPad, Android tablets)

## 🔧 Solución de Problemas Comunes

### Error: "Cannot find module 'jspdf'"

```bash
cd frontend
npm install jspdf jspdf-autotable
```

### Error: "IndexedDB is not available"

**Causas posibles:**
1. Navegador en modo incógnito/privado
2. IndexedDB deshabilitado en configuración
3. Navegador muy antiguo

**Solución:**
1. Usar navegador en modo normal
2. Actualizar navegador a última versión
3. Verificar que IndexedDB esté habilitado

### Error: "Failed to fetch products"

**Causas posibles:**
1. Sin conexión a internet
2. Backend no está corriendo
3. Credenciales de Alegra incorrectas
4. Alegra API caída

**Solución:**
1. Verificar conexión a internet
2. Verificar que backend esté corriendo (`npm start`)
3. Verificar logs del backend para más detalles
4. Verificar status de Alegra: https://status.alegra.com

### Productos no se buscan correctamente

**Solución:**
1. Hacer click en "Actualizar" para refrescar cache
2. Verificar que haya productos en IndexedDB (DevTools)
3. Limpiar cache del navegador y volver a descargar

### PDF no se descarga

**Causas posibles:**
1. Bloqueador de pop-ups activado
2. Extensión de navegador bloqueando descargas
3. Error en datos de la factura

**Solución:**
1. Permitir descargas en el navegador
2. Desactivar extensiones temporalmente
3. Verificar consola del navegador para errores

## 📊 Estructura de Archivos Nuevos

```
proyecto/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── FacturacionRapida.jsx          # ✨ NUEVO
│   │   ├── services/
│   │   │   ├── indexedDBService.js            # ✨ NUEVO
│   │   │   └── facturacionService.js          # ✨ NUEVO
│   │   └── utils/
│   │       └── pdfGenerator.js                # ✨ NUEVO
│   └── package.json                           # MODIFICADO (nuevas deps)
├── backend/
│   └── routes/
│       └── alegra.js                          # MODIFICADO (nuevos endpoints)
├── FACTURACION_RAPIDA_README.md              # ✨ NUEVO (documentación)
└── INSTALACION_FACTURACION.md                # ✨ NUEVO (este archivo)
```

## 🎯 Próximos Pasos

1. ✅ Instalar dependencias
2. ✅ Verificar que todo funciona
3. ✅ Descargar catálogo inicial
4. ✅ Probar crear factura online
5. ✅ Probar crear factura offline
6. ✅ Probar sincronización

## 📞 Contacto

Si tienes problemas con la instalación:
- Email: tachifacturas@gmail.com
- Revisar logs del backend
- Revisar consola del navegador (F12)

---

**¡Sistema listo para producción! 🚀**

