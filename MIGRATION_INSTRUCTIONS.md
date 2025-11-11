# Instrucciones de Migración - Optimización de Reporte de Proveedores

## 📋 Cambios Implementados

Se ha optimizado drásticamente el reporte de proveedores guardando la asignación de proveedor en la BD en lugar de recalcularla cada vez.

### Antes (LENTO ❌)
- Cada carga: Buscar mappings + Calcular precios → **5-10 segundos**
- Recalcular en cada request
- Puede sobreescribir asignaciones manuales

### Ahora (RÁPIDO ✅)
- Asignación automática al registrar faltante → **1 vez**
- Asignaciones guardadas en BD → **< 1 segundo**
- Respeta asignaciones manuales

---

## 🔧 Migración Requerida

**IMPORTANTE**: Debes ejecutar el archivo de migración SQL en Render antes de que el nuevo código funcione correctamente.

### Paso 1: Acceder a la Base de Datos en Render

1. Ve a tu dashboard de Render
2. Selecciona tu base de datos PostgreSQL
3. Clic en "Connect" → "External Connection"
4. Usa las credenciales para conectarte con un cliente PostgreSQL (ej: TablePlus, pgAdmin, psql)

### Paso 2: Ejecutar la Migración

```bash
# Opción 1: Desde psql (terminal)
psql "postgresql://usuario:password@host:puerto/database" < backend/migrations/add_proveedor_asignacion_to_faltantes.sql

# Opción 2: Copiar/pegar el contenido del archivo SQL en Render Console
```

### Paso 3: Verificar

```sql
-- Verificar que las columnas se crearon
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'faltantes' 
AND column_name IN ('proveedor_asignado', 'proveedor_cedula', 'precio_asignado', 'asignacion_tipo', 'fecha_asignacion', 'mapping_id');
```

Deberías ver 6 filas con las nuevas columnas.

---

## 🎯 Beneficios

1. **Velocidad**: Reporte 10x más rápido
2. **Estabilidad**: No recalcula cada vez
3. **Respeto**: Las asignaciones manuales NO se sobreescriben
4. **Escalabilidad**: Funciona con miles de faltantes

---

## ⚠️ Notas Importantes

- Los faltantes **antiguos** (antes de esta migración) NO tendrán asignación guardada
- Se asignarán automáticamente en la próxima carga del reporte
- Las asignaciones **manuales** futuras se marcarán correctamente y NO se sobreescribirán

---

## 🐛 Si Algo Falla

Si ves errores después del deploy:

```
ERROR: column "proveedor_asignado" does not exist
```

**Solución**: Ejecutar manualmente la migración SQL en Render.

