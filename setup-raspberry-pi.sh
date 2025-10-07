#!/bin/bash

# ================================================
# 🥧 Script de Instalación Automática
# Sistema de Facturas CR - Raspberry Pi
# ================================================

set -e  # Detener en caso de error

echo "================================================"
echo "🥧 Instalación Sistema Facturas CR"
echo "================================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# ================================================
# 1. Actualizar Sistema
# ================================================
print_info "Actualizando sistema..."
sudo apt update && sudo apt upgrade -y
print_success "Sistema actualizado"

# ================================================
# 2. Instalar Node.js 18
# ================================================
print_info "Instalando Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_info "Node.js ya está instalado: $(node -v)"
fi
print_success "Node.js instalado: $(node -v)"

# ================================================
# 3. Instalar PostgreSQL
# ================================================
print_info "Instalando PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
print_success "PostgreSQL instalado"

# ================================================
# 4. Configurar Base de Datos
# ================================================
print_info "Configurando base de datos..."
sudo -u postgres psql -c "CREATE DATABASE facturas_cr;" 2>/dev/null || print_info "Base de datos ya existe"
sudo -u postgres psql -c "CREATE USER facturas WITH PASSWORD 'facturas123';" 2>/dev/null || print_info "Usuario ya existe"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE facturas_cr TO facturas;"
sudo -u postgres psql -c "ALTER DATABASE facturas_cr OWNER TO facturas;"
print_success "Base de datos configurada"

# ================================================
# 5. Clonar Repositorio
# ================================================
print_info "Clonando repositorio..."
cd ~
if [ -d "sistema-facturas-cr" ]; then
    print_info "Repositorio ya existe, actualizando..."
    cd sistema-facturas-cr
    git pull
else
    git clone https://github.com/Andrescr25/sistema-facturas-cr.git
    cd sistema-facturas-cr
fi
print_success "Repositorio listo"

# ================================================
# 6. Configurar Backend
# ================================================
print_info "Configurando backend..."
cd ~/sistema-facturas-cr/backend

# Crear .env
cat > .env << 'EOF'
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
EOF

print_success ".env creado"

# Instalar dependencias
print_info "Instalando dependencias del backend..."
npm install
print_success "Dependencias instaladas"

# Generar Prisma
print_info "Generando Prisma Client..."
npx prisma generate
print_success "Prisma Client generado"

# Aplicar migraciones
print_info "Aplicando migraciones de base de datos..."
npx prisma db push || print_info "Migraciones ya aplicadas"
print_success "Base de datos lista"

# ================================================
# 7. Configurar Frontend
# ================================================
print_info "Configurando frontend..."
cd ~/sistema-facturas-cr/frontend

# Crear .env
cat > .env << 'EOF'
VITE_API_URL=http://192.168.0.18:3000
EOF

print_success ".env del frontend creado"

# Instalar dependencias
print_info "Instalando dependencias del frontend..."
npm install
print_success "Dependencias instaladas"

# Compilar
print_info "Compilando frontend (esto puede tardar un poco)..."
npm run build
print_success "Frontend compilado"

# ================================================
# 8. Instalar PM2
# ================================================
print_info "Instalando PM2..."
sudo npm install -g pm2
print_success "PM2 instalado"

# ================================================
# 9. Configurar PM2 para Backend
# ================================================
print_info "Configurando PM2 para el backend..."
cd ~/sistema-facturas-cr/backend

# Detener si está corriendo
pm2 stop facturas-backend 2>/dev/null || true
pm2 delete facturas-backend 2>/dev/null || true

# Iniciar
pm2 start server.js --name "facturas-backend" --time
pm2 save
print_success "Backend configurado con PM2"

# ================================================
# 10. Instalar y Configurar Nginx
# ================================================
print_info "Instalando Nginx..."
sudo apt install nginx -y

# Crear configuración
print_info "Configurando Nginx..."
sudo tee /etc/nginx/sites-available/facturas > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Servir frontend
    root /home/andres/sistema-facturas-cr/frontend/dist;
    index index.html;

    # Logs
    access_log /var/log/nginx/facturas-access.log;
    error_log /var/log/nginx/facturas-error.log;

    # Frontend - SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
    }

    # Disable caching for index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
EOF

# Activar sitio
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/facturas /etc/nginx/sites-enabled/

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
print_success "Nginx configurado"

# ================================================
# 11. Configurar PM2 para iniciar al arranque
# ================================================
print_info "Configurando PM2 para inicio automático..."
pm2 startup systemd -u andres --hp /home/andres | grep -v "PM2" | sudo bash || true
pm2 save
print_success "PM2 configurado para inicio automático"

# ================================================
# 12. Verificar instalación
# ================================================
echo ""
echo "================================================"
echo "🎉 ¡INSTALACIÓN COMPLETADA!"
echo "================================================"
echo ""
print_info "Verificando servicios..."

# Verificar PostgreSQL
if sudo systemctl is-active --quiet postgresql; then
    print_success "PostgreSQL: Corriendo"
else
    print_error "PostgreSQL: No está corriendo"
fi

# Verificar Backend
if pm2 describe facturas-backend > /dev/null 2>&1; then
    print_success "Backend: Corriendo"
else
    print_error "Backend: No está corriendo"
fi

# Verificar Nginx
if sudo systemctl is-active --quiet nginx; then
    print_success "Nginx: Corriendo"
else
    print_error "Nginx: No está corriendo"
fi

echo ""
echo "================================================"
echo "📋 Información del Sistema"
echo "================================================"
echo ""
echo "🌐 Acceso al sistema:"
echo "   http://192.168.0.18"
echo ""
echo "🔧 Backend API:"
echo "   http://192.168.0.18:3000/health"
echo ""
echo "📊 Ver logs del backend:"
echo "   pm2 logs facturas-backend"
echo ""
echo "🔄 Reiniciar backend:"
echo "   pm2 restart facturas-backend"
echo ""
echo "📈 Estado de PM2:"
echo "   pm2 status"
echo ""
echo "🗄️  Base de datos:"
echo "   Usuario: facturas"
echo "   Base de datos: facturas_cr"
echo "   Puerto: 5432"
echo ""
echo "================================================"
echo ""

# Mostrar estado de PM2
pm2 status

echo ""
print_success "¡Todo listo! Accede a http://192.168.0.18"
echo ""
