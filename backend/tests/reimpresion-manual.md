# 🧪 Tests Manuales: Flujo de Reimpresión

## Cambios Realizados

### Backend
1. **Filtrado de facturas sin cambios**: En `/facturas/pendientes-reimpresion`, solo se devuelven facturas con `requiere_actualizacion: true`
2. **Marcado como procesada**: En `/facturas/procesar-individual`, al reimprimir se marca la factura como `procesada` en `facturas_reimpresion`

### Frontend
- No requiere cambios, ya funciona correctamente con los nuevos cambios del backend

---

## Tests Manuales a Realizar

### Test 1: Facturas sin cambios NO aparecen en pendientes ✅

**Objetivo**: Verificar que facturas donde todos los productos llegaron completos NO se muestran

**Pasos**:
1. Ir a la página de Reimpresión
2. Verificar la pestaña "Facturas Pendientes"
3. **Resultado esperado**: Solo deben aparecer facturas con badge "⚠️ Requiere Cambios"
4. **NO** deben aparecer facturas con badge "✅ Solo Resuelto"

**Validación**:
```
✓ Solo facturas con requiere_actualizacion: true se muestran
✓ El contador muestra solo facturas que requieren cambios
✓ En consola del backend debe aparecer: "Facturas filtradas: X requieren cambios (Y sin cambios ocultas)"
```

---

### Test 2: Facturas CON cambios SÍ aparecen en pendientes ✅

**Objetivo**: Verificar que facturas con productos parcialmente entregados o no entregados SÍ se muestran

**Pasos**:
1. Buscar una factura que tenga ajustes con:
   - `estado: 'parcial'` (llegó parte del producto)
   - `estado: 'no_llego'` (no llegó nada)
   - Con `requiere_actualizacion: true`

2. **Resultado esperado**: Esta factura DEBE aparecer en pendientes con:
   - Badge "⚠️ Requiere Cambios" en amarillo
   - Mostrar los ajustes realizados
   - Botón "Reimprimir" disponible

**Validación**:
```
✓ Factura con cambios aparece en la lista
✓ Badge amarillo "Requiere Cambios"
✓ Detalles de ajustes visibles
✓ Total de ajustes correcto
```

---

### Test 3: Al reimprimir, factura se mueve a historial ✅

**Objetivo**: Verificar que al hacer clic en "Guardar e Imprimir", la factura desaparece de pendientes y aparece en procesadas

**Pasos**:
1. En "Facturas Pendientes", seleccionar una factura
2. Hacer clic en "Reimprimir"
3. En el formulario que aparece, hacer clic en "Guardar e Imprimir" o "Guardar"
4. Esperar confirmación: "✅ Factura XXXX procesada exitosamente"

5. **Verificar en frontend**:
   - La factura YA NO debe aparecer en "Facturas Pendientes"
   - Cambiar a la pestaña "Facturas Procesadas (7 días)"
   - La factura DEBE aparecer aquí con:
     - Badge "✅ Procesada" en verde
     - Fecha de procesamiento
     - "X días restantes para recuperar"
     - Botón "Ver PDF" y "Recuperar" (si está dentro de 7 días)

6. **Verificar en backend (consola del servidor)**:
   ```
   ✅ Factura XXXX marcada como 'procesada' en reimpresión
   ```

**Validación**:
```
✓ Factura desaparece de pendientes
✓ Factura aparece en procesadas con estado correcto
✓ Fecha de procesamiento registrada
✓ Días restantes calculados correctamente
✓ Botones de acción disponibles (Ver PDF, Recuperar)
```

---

### Test 4: Recuperar factura del historial ✅

**Objetivo**: Verificar que se puede recuperar una factura procesada y vuelve a pendientes

**Pasos**:
1. En "Facturas Procesadas (7 días)", seleccionar una factura procesada recientemente
2. Hacer clic en "Recuperar"
3. Confirmar la acción
4. **Resultado esperado**:
   - Mensaje: "✅ Factura XXXX recuperada"
   - La factura desaparece de "Procesadas"
   - Cambiar a "Facturas Pendientes"
   - La factura DEBE aparecer nuevamente allí

**Validación**:
```
✓ Factura se recupera exitosamente
✓ Desaparece de procesadas
✓ Reaparece en pendientes
✓ Mantiene sus ajustes originales
```

---

### Test 5: Facturas procesadas hace más de 7 días no se pueden recuperar ⚠️

**Objetivo**: Verificar que el período de recuperación de 7 días se respeta

**Pasos**:
1. Buscar en la base de datos una factura procesada hace más de 7 días (si existe)
2. **Resultado esperado**:
   - NO debe aparecer en "Facturas Procesadas (7 días)"
   - O si aparece, el botón "Recuperar" NO debe estar disponible
   - Debe mostrar: "❌ Período de recuperación expirado"

**Validación**:
```
✓ Facturas antiguas no recuperables están ocultas o sin botón
✓ Mensaje de expiración visible
✓ Solo se muestran facturas de últimos 7 días
```

---

## Flujo Completo Integrado

**Escenario**: Desde registrar faltantes hasta reimprimir factura

1. **Registrar faltantes** (página Registrar Faltantes)
   - Buscar factura
   - Marcar productos que no llegaron o llegaron parcialmente
   - Guardar ajustes

2. **Limpiar y preparar reimpresión** (página Registrar Faltantes)
   - Hacer clic en "Limpiar y Preparar Reimpresión"
   - Confirmar acción

3. **Verificar en Reimpresión**
   - Ir a página de Reimpresión
   - Verificar que:
     - Si todos los productos llegaron completos → NO aparece en pendientes ✅
     - Si hay productos pendientes → SÍ aparece en pendientes ✅

4. **Procesar factura**
   - Hacer clic en "Reimprimir"
   - Revisar cambios automáticos o editar manualmente
   - Hacer clic en "Guardar e Imprimir"

5. **Verificar resultado**
   - Factura desaparece de pendientes ✅
   - PDF se abre con precios actualizados ✅
   - Factura aparece en procesadas ✅

---

## Logs Esperados en Backend

### Al obtener pendientes:
```
📋 Obteniendo facturas pendientes de reimpresión...
✅ Facturas filtradas: 5 requieren cambios (3 sin cambios ocultas)
```

### Al procesar factura:
```
📋 Procesando factura individual...
💾 Guardando 2 ajustes en base de datos...
💾 Ajuste guardado: PROD-001 → entregado 3 (parcial)
💾 Ajuste guardado: PROD-002 → entregado 0 (no_llego)
✅ Factura 3072 marcada como 'procesada' en reimpresión
✅ Factura 3072 procesada individualmente:
   📋 Faltantes marcados como procesados
   💾 2 ajustes guardados permanentemente
🔄 Estado: En reimpresión → Historial
```

---

## Checklist de Validación

- [ ] Test 1: Facturas sin cambios NO aparecen ✅
- [ ] Test 2: Facturas con cambios SÍ aparecen ✅  
- [ ] Test 3: Al reimprimir, va a historial ✅
- [ ] Test 4: Se puede recuperar del historial ✅
- [ ] Test 5: No se puede recuperar después de 7 días ⚠️
- [ ] Flujo completo funciona correctamente ✅

---

## Notas

- Los tests automáticos requieren configuración de base de datos
- Estos tests manuales son suficientes para validar el comportamiento
- Ejecutar estos tests después de hacer commit de los cambios
- Marcar cada test como completado (✅) al verificarlo manualmente

