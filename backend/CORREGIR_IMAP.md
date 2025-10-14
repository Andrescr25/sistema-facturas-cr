# 🚨 Corregir Error IMAP "Invalid credentials"

## El Problema

Ves este error constantemente en los logs:
```
❌ Error IMAP: Invalid credentials (Failure)
🔄 Reintentando conexión...
```

## ✅ Solución

### 1. **Quitar Espacios de la Contraseña**

Tu archivo `.env` tiene espacios en `IMAP_PASSWORD`:

```bash
# ❌ INCORRECTO (con espacios):
IMAP_PASSWORD="zgyh mcuy zyyi mlms"

# ✅ CORRECTO (sin espacios):
IMAP_PASSWORD="zgyhcuyymlms"
```

### 2. **Editar el archivo .env**

```bash
# En Render.com
1. Ve a tu servicio backend
2. Settings → Environment
3. Edita IMAP_PASSWORD
4. Quita los espacios
5. Save Changes
6. Redeploy

# En local o Raspberry Pi
nano backend/.env
# Edita IMAP_PASSWORD y quita los espacios
# Guarda: Ctrl+O, Enter, Ctrl+X
# Reinicia: pm2 restart facturas-monitor
```

### 3. **Si Sigue sin Funcionar**

#### Opción A: Generar Nueva Contraseña de App

1. Ve a https://myaccount.google.com/apppasswords
2. Genera una nueva contraseña para "Correo"
3. Copia la contraseña **sin espacios**
4. Actualiza `IMAP_PASSWORD` en `.env`

#### Opción B: Verificar Gmail

1. **Verificar 2FA activado:**
   - https://myaccount.google.com/security
   - "Verificación en dos pasos" debe estar activada

2. **Activar acceso IMAP:**
   - Gmail → Configuración → Ver todos los ajustes
   - Pestaña "Reenvío y correo POP/IMAP"
   - "Habilitar IMAP"

### 4. **Desactivar Monitoreo IMAP (Opcional)**

Si no necesitas el monitoreo automático de emails:

```bash
# En .env
ENABLE_EMAIL_MONITORING=false
```

## 🔍 Verificar que Funciona

Después de corregir, deberías ver en los logs:

```
✅ Conectado a IMAP: INBOX
📧 Buscando facturas de los últimos 30 días...
```

## ⚠️ Nota Importante

Después de esta corrección, el sistema **no reintentará automáticamente** si las credenciales son inválidas. Necesitas reiniciar el servidor después de corregir el `.env`.

