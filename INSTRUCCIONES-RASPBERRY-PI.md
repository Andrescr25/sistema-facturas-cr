# 🥧 Instalación en Raspberry Pi - Guía Paso a Paso

## 📋 Información de Conexión

```
Host: 192.168.0.18
Usuario: andres
Contraseña: 112233
```

---

## 🚀 Opción 1: Instalación Automática (Recomendada)

### Desde tu computadora Windows:

#### 1. Conectarte por SSH:
```bash
ssh andres@192.168.0.18
# Contraseña: 112233
```

#### 2. Una vez dentro, ejecutar:
```bash
# Descargar el script
curl -o setup.sh https://raw.githubusercontent.com/Andrescr25/sistema-facturas-cr/main/setup-raspberry-pi.sh

# O si no está en GitHub aún, copiarlo manualmente (ver abajo)

# Dar permisos de ejecución
chmod +x setup.sh

# Ejecutar
./setup.sh
```

### Copiar el script manualmente:

Si el script no está en GitHub, puedes copiarlo así:

```bash
# Crear el archivo
nano setup.sh

# Pegar TODO el contenido del archivo setup-raspberry-pi.sh
# (Ctrl+X, Y, Enter para guardar)

# Dar permisos
chmod +x setup.sh

# Ejecutar
./setup.sh
```

---

## 🛠️ Opción 2: Instalación Manual (Paso por Paso)

Si prefieres entender cada paso:

### 1. Conectar por SSH
```bash
ssh andres@192.168.0.18
# Contraseña: 112233
```

### 2. Actualizar el sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Instalar Node.js 18
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # Verificar
```

### 4. Instalar PostgreSQL
```bash
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 5. Configurar Base de Datos
```bash
sudo -u postgres psql
```

Dentro de PostgreSQL:
```sql
CREATE DATABASE facturas_cr;
CREATE USER facturas WITH PASSWORD 'facturas123';
GRANT ALL PRIVILEGES ON DATABASE facturas_cr TO facturas;
ALTER DATABASE facturas_cr OWNER TO facturas;
\q
```

### 6. Clonar el Repositorio
```bash
cd ~
git clone https://github.com/Andrescr25/sistema-facturas-cr.git
cd sistema-facturas-cr
```

### 7. Configurar Backend
```bash
cd backend
nano .env
```

Contenido:
```env
DATABASE_URL="postgresql://facturas:facturas123@localhost:5432/facturas_cr"
ALEGRA_USER=tachifacturas@gmail.com
ALEGRA_TOKEN=b3a84abb6897180d3889
IMAP_USER=tachifacturas@gmail.com
IMAP_PASSWORD="oozu fknp hhrt vidt"
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
NODE_ENV=production
PORT=3000
```

```bash
npm install
npx prisma generate
npx prisma db push
```

### 8. Configurar Frontend
```bash
cd ../frontend
nano .env
```

Contenido:
```env
VITE_API_URL=http://192.168.0.18:3000
```

```bash
npm install
npm run build
```

### 9. Instalar PM2
```bash
sudo npm install -g pm2
```

### 10. Iniciar Backend con PM2
```bash
cd ~/sistema-facturas-cr/backend
pm2 start server.js --name "facturas-backend"
pm2 save
pm2 startup
```

### 11. Instalar Nginx
```bash
sudo apt install nginx -y
```

### 12. Configurar Nginx
```bash
sudo nano /etc/nginx/sites-available/facturas
```

Contenido:
```nginx
server {
    listen 80;
    server_name _;

    root /home/andres/sistema-facturas-cr/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/facturas /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## ✅ Verificación

### Desde la Raspberry Pi:
```bash
# Ver estado del backend
pm2 status

# Ver logs
pm2 logs facturas-backend

# Verificar servicios
sudo systemctl status nginx
sudo systemctl status postgresql
```

### Desde tu navegador:
```
http://192.168.0.18
```

---

## 🔄 Comandos Útiles

### Actualizar el sistema:
```bash
cd ~/sistema-facturas-cr
git pull

# Actualizar backend
cd backend
npm install
pm2 restart facturas-backend

# Actualizar frontend
cd ../frontend
npm install
npm run build
sudo systemctl restart nginx
```

### Ver logs:
```bash
# Backend
pm2 logs facturas-backend

# Nginx
sudo tail -f /var/log/nginx/facturas-access.log
sudo tail -f /var/log/nginx/facturas-error.log
```

### Reiniciar servicios:
```bash
pm2 restart facturas-backend
sudo systemctl restart nginx
sudo systemctl restart postgresql
```

### Ver estado:
```bash
pm2 status
pm2 monit  # Monitor en tiempo real
```

---

## 🐛 Troubleshooting

### Backend no inicia:
```bash
pm2 logs facturas-backend
# Verificar errores en los logs
```

### Frontend muestra página en blanco:
```bash
# Verificar que el build existe
ls ~/sistema-facturas-cr/frontend/dist

# Reconstruir
cd ~/sistema-facturas-cr/frontend
npm run build
```

### Error de base de datos:
```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar conexión
psql -U facturas -d facturas_cr -h localhost
# Password: facturas123
```

### Puerto 3000 ya en uso:
```bash
# Ver qué está usando el puerto
sudo lsof -i :3000

# Matar proceso
pm2 delete facturas-backend
pm2 start server.js --name "facturas-backend"
```

---

## 📱 Acceso desde otros dispositivos

Desde cualquier dispositivo en tu red local:
```
http://192.168.0.18
```

Asegúrate de que tu firewall permita conexiones al puerto 80.

---

## 🌐 Acceso desde Internet (Opcional)

### Opción 1: Port Forwarding
1. En tu router, configura port forwarding:
   - Puerto externo: 80
   - IP interna: 192.168.0.18
   - Puerto interno: 80

2. Usa tu IP pública para acceder

### Opción 2: Cloudflare Tunnel (Recomendado)
```bash
# Instalar cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

# Configurar tunnel
cloudflared tunnel login
cloudflared tunnel create facturas

# Iniciar con PM2
pm2 start cloudflared -- tunnel run facturas
pm2 save
```

---

## ✅ Checklist de Instalación

- [ ] SSH conectado
- [ ] Sistema actualizado
- [ ] Node.js instalado
- [ ] PostgreSQL instalado y configurado
- [ ] Base de datos creada
- [ ] Repositorio clonado
- [ ] Backend configurado (.env)
- [ ] Frontend configurado (.env)
- [ ] PM2 instalado
- [ ] Backend corriendo con PM2
- [ ] Nginx instalado y configurado
- [ ] Acceso desde navegador funcionando

---

## 🎉 ¡Listo!

Tu sistema ahora está corriendo en la Raspberry Pi 24/7.

**Acceso:** http://192.168.0.18

**Usuario de la base de datos:** facturas  
**Contraseña de la base de datos:** facturas123
