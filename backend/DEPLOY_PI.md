# 🥧 Despliegue en Raspberry Pi

Guía para ejecutar el sistema 24/7 en Raspberry Pi.

---

## 🚀 Método 1: PM2 (Recomendado)

### 1. Instalar Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Preparar Proyecto

```bash
cd /home/pi/sistema-facturas-cr/backend
npm install
npx prisma generate
```

### 3. Verificar .env

```bash
nano .env
```

Debe incluir:
```env
DATABASE_URL=...
ALEGRA_USER=...
ALEGRA_TOKEN=...
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=...
IMAP_PASSWORD=...
ENABLE_EMAIL_MONITORING=true
```

### 4. Instalar PM2

```bash
sudo npm install -g pm2
```

### 5. Iniciar Servicio

```bash
pm2 start server.js --name "facturas-monitor"
```

### 6. Configurar Auto-Inicio

```bash
pm2 save
pm2 startup
# Ejecuta el comando que PM2 muestre
```

### 7. Comandos Útiles

```bash
pm2 list                              # Ver procesos
pm2 logs facturas-monitor             # Ver logs
pm2 restart facturas-monitor          # Reiniciar
pm2 stop facturas-monitor             # Detener
pm2 monit                             # Monitor en tiempo real
```

---

## 🔧 Método 2: systemd

### 1. Crear Servicio

```bash
sudo nano /etc/systemd/system/facturas-monitor.service
```

Contenido:
```ini
[Unit]
Description=Sistema de Monitoreo de Facturas
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/sistema-facturas-cr/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=facturas-monitor

[Install]
WantedBy=multi-user.target
```

### 2. Activar Servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable facturas-monitor.service
sudo systemctl start facturas-monitor.service
```

### 3. Comandos Útiles

```bash
sudo systemctl status facturas-monitor    # Ver estado
sudo systemctl restart facturas-monitor   # Reiniciar
sudo systemctl stop facturas-monitor      # Detener
sudo journalctl -u facturas-monitor -f    # Ver logs en vivo
```

---

## 🔍 Troubleshooting

### Ver logs del sistema

**PM2:**
```bash
pm2 logs facturas-monitor --lines 100
```

**systemd:**
```bash
sudo journalctl -u facturas-monitor -n 100 --no-pager
```

### Verificar que está corriendo

```bash
# PM2
pm2 list

# systemd
sudo systemctl status facturas-monitor

# Verificar proceso
ps aux | grep node
```

### Verificar conexión IMAP

```bash
pm2 logs facturas-monitor | grep "IMAP"
```

Deberías ver:
```
📧 Conectado al buzón de Gmail
📧 ✅ Conectado al buzón de Gmail
```

### Reiniciar si hay problemas

**PM2:**
```bash
pm2 restart facturas-monitor
```

**systemd:**
```bash
sudo systemctl restart facturas-monitor
```

---

## 📊 Monitoreo

### Ver uso de recursos

```bash
# Con PM2
pm2 monit

# Con htop
htop
```

### Ver estadísticas

```bash
# CPU y memoria del proceso
pm2 show facturas-monitor
```

---

## 🔄 Actualizar el Código

```bash
# Ir al proyecto
cd /home/pi/sistema-facturas-cr

# Actualizar desde Git
git pull

# Instalar dependencias nuevas (si hay)
cd backend
npm install

# Regenerar Prisma (si cambió el schema)
npx prisma generate

# Reiniciar servicio
pm2 restart facturas-monitor
# o
sudo systemctl restart facturas-monitor
```

---

## 🆘 Problemas Comunes

### Error: "ECONNREFUSED" al conectar a BD

```bash
# Verificar que PostgreSQL está accesible
ping -c 3 aws-0-us-east-2.pooler.supabase.com
```

### Error: "Invalid credentials" IMAP

```bash
# Verificar password en .env (sin espacios)
cat .env | grep IMAP_PASSWORD
```

### Servicio no inicia

```bash
# Ver error específico
pm2 logs facturas-monitor --err
# o
sudo journalctl -u facturas-monitor -n 50
```

### Falta memoria

```bash
# Ver memoria disponible
free -h

# Configurar swap si es necesario
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

---

## ✅ Checklist Final

- [ ] Node.js instalado
- [ ] Proyecto clonado/copiado
- [ ] Dependencias instaladas (`npm install`)
- [ ] Prisma generado (`npx prisma generate`)
- [ ] `.env` configurado correctamente
- [ ] PM2 o systemd configurado
- [ ] Servicio iniciado
- [ ] Auto-inicio configurado
- [ ] Logs verificados (conexión IMAP exitosa)

---

**Última actualización:** Octubre 2024

