# ⚙️ Configuración de SPA en Render

## Problema
Al recargar páginas como `/revision-precios` o `/gestionar-relaciones`, se muestra un error 404.

## Causa
Render Static Sites busca archivos físicos y no encuentra `/revision-precios.html`, porque React Router maneja las rutas en el cliente.

---

## ✅ Solución: Configurar Rewrite Rules en Render

### Paso 1: Ir a tu Static Site en Render
1. Ve a: https://dashboard.render.com
2. Click en tu Static Site: **sistema-facturas-cr**

### Paso 2: Configurar Redirects & Rewrites
1. En el menú lateral, click en **"Redirects/Rewrites"**
2. Click en **"Add Rule"**
3. Configura la regla:

```
Source:        /*
Destination:   /index.html
Action:        Rewrite
```

**Explicación:**
- `Source: /*` = Todas las rutas
- `Destination: /index.html` = Servir el index.html
- `Action: Rewrite` = Rewrite (no redirect)

### Paso 3: Guardar
1. Click en **"Save"**
2. Las reglas se aplican inmediatamente (sin necesidad de redeploy)

---

## 🧪 Probar

Después de configurar, prueba:
1. Ir a: `https://sistema-facturas-cr.onrender.com/revision-precios`
2. Presionar F5 para recargar
3. ✅ Debería cargar correctamente sin error 404

**Otras rutas para probar:**
- `/gestionar-relaciones`
- `/buscar-factura`
- `/reimpresion`
- `/configuracion`

---

## 📋 Alternativa: Archivo `_redirects`

Ya existe el archivo `frontend/public/_redirects` con:
```
/*    /index.html   200
```

Este archivo **debería** funcionar automáticamente, pero Render a veces no lo reconoce correctamente. Por eso, la configuración en el Dashboard es más confiable.

---

## ❓ ¿Por qué pasa esto?

**Sin configuración:**
```
Usuario → https://sistema-facturas-cr.onrender.com/revision-precios
         ↓
Render busca archivo: /revision-precios.html
         ↓
❌ No existe → Error 404
```

**Con configuración:**
```
Usuario → https://sistema-facturas-cr.onrender.com/revision-precios
         ↓
Render rewrite: /index.html
         ↓
React Router carga
         ↓
✅ Muestra página de Revisión de Precios
```

---

## 🎯 Resumen

1. Ve al Dashboard de Render
2. Click en tu Static Site
3. Ve a "Redirects/Rewrites"
4. Agrega regla: `/* → /index.html` (Rewrite)
5. Guardar
6. ✅ ¡Listo! Todas las rutas funcionarán

---

**Documentación oficial:**
https://render.com/docs/deploy-create-react-app#using-client-side-routing

