# 📧 Sistema de Monitoreo Continuo de Emails

## 🎯 Descripción

Sistema automático que monitorea el buzón de correo (Gmail) buscando facturas electrónicas de Costa Rica de proveedores. Procesa XMLs adjuntos y relaciona productos automáticamente con Alegra.

## ⚡ Inicio Rápido

### 1. Configurar Gmail (5 minutos)

**Crear Contraseña de Aplicación:**
1. Ve a https://myaccount.google.com/security
2. Activa **Verificación en dos pasos**
3. Ve a **Contraseñas de aplicaciones**
4. Selecciona **Correo** > Genera
5. Copia la contraseña (16 caracteres)

### 2. Configurar Variables en `.env`

```env
# Configuración IMAP (Gmail)
IMAP_HOST="imap.gmail.com"
IMAP_PORT=993
IMAP_USER="tu_email@gmail.com"
IMAP_PASSWORD="xxxxxxxxxxxx"  # Sin espacios
ENABLE_EMAIL_MONITORING=true
```

### 3. Iniciar Servidor

```bash
npm run dev  # o npm start
```

Verás:
```
📧 Iniciando monitoreo de emails...
📧 ✅ Conectado al buzón de Gmail
⏰ Próxima revisión en 15 minutos...
```

## 🔄 Funcionamiento

### Ciclo de Monitoreo

1. **Conexión Inicial**: Se conecta al buzón IMAP
2. **Búsqueda**: Busca emails de los últimos 30 días
3. **Filtrado**: Identifica emails con facturas (asunto + adjuntos XML)
4. **Procesamiento**: Extrae y procesa cada factura XML
5. **Relacionado**: Relaciona automáticamente productos con Alegra
6. **Espera**: Espera 15 minutos
7. **Repite**: Vuelve al paso 1

### Qué Busca

El sistema busca:
- ✅ Emails con asunto que contenga: "factura", "invoice", "FE-", "documento", "comprobante"
- ✅ Emails con adjuntos XML
- ✅ Facturas electrónicas de Costa Rica (clave de 50 dígitos)
- ✅ Formatos: FE-, TE-, NC-, ND- (Facturas, Tiquetes, Notas)

### Qué Ignora

- ❌ Facturas duplicadas (ya procesadas)
- ❌ Facturas de tu propia empresa (cédula: 204050474)
- ❌ Emails sin adjuntos XML
- ❌ Documentos que no sean de Costa Rica

## 📊 Proceso de una Factura

```
Email recibido
    ↓
Detectar XML adjunto
    ↓
Parsear factura XML
    ↓
Guardar en base de datos
    ↓
Para cada producto:
    ├─ Buscar en mapeos existentes
    ├─ Si no existe → Buscar similares en Alegra
    ├─ Si confianza ≥ 80% → Relacionar automáticamente
    └─ Si confianza < 80% → Marcar para revisión manual
    ↓
Actualizar estado de factura
    ├─ RELACIONADA (todos los productos relacionados)
    └─ PROCESADA (algunos productos pendientes)
```

## 🛠️ Gestión del Servicio

### Detener el Monitoreo

Puedes detener el servicio de dos formas:

1. **Temporal** (mientras el servidor esté corriendo):
   ```env
   ENABLE_EMAIL_MONITORING=false
   ```
   Reinicia el servidor.

2. **Detener el servidor** (cierre graceful):
   - Presiona `Ctrl+C`
   - El servicio cerrará las conexiones correctamente

### Ver Logs

El sistema registra toda la actividad en consola:

```
🔍 Buscando facturas de los últimos 30 días...
📬 Emails encontrados: 45
📄 Documento electrónico CR detectado: FE-1234567890.xml
📋 NUEVA FACTURA ENCONTRADA:
📄 Factura 00100001010000001234
🏢 Proveedor: Proveedor SA
📅 Fecha: 2024-10-14
📦 Productos: 15
💰 Total: CRC 125,000.00
✅ Relacionado automáticamente (95%)
⏰ Próxima revisión en 15 minutos...
```

### Reintentos Automáticos

Si la conexión falla:
- Reintenta hasta 5 veces
- Con delays incrementales (30s, 60s, 90s, etc.)
- Después espera al próximo ciclo de 15 minutos

## 🔐 Seguridad

- ✅ Conexión TLS/SSL (puerto 993)
- ✅ Usa contraseñas de aplicación (no tu contraseña principal)
- ✅ Las credenciales se almacenan solo en `.env` (nunca en código)
- ✅ Los emails NO se marcan como leídos
- ✅ No se eliminan emails del buzón

## 📈 Estadísticas

El sistema registra:
- Número de emails revisados
- Facturas encontradas y procesadas
- Productos relacionados automáticamente
- Productos pendientes de revisión manual

## 🐛 Solución de Problemas

| Error | Solución |
|-------|----------|
| "Invalid credentials" | Usa contraseña de aplicación (no tu contraseña normal) |
| "IMAP no autenticado" | Verifica internet y que Gmail tiene IMAP activado |
| "No encuentra facturas" | Verifica que emails tengan XML adjuntos de facturas CR |
| Muchos reintentos | Verifica conexión estable a internet |

## 📝 Archivos del Sistema

- `config/imap.js` - Configuración IMAP
- `services/emailService.js` - Monitoreo principal
- `services/databaseService.js` - Operaciones BD
- `services/xmlParser.js` - Parser de facturas XML

---

**Versión**: 1.0 | Octubre 2024

