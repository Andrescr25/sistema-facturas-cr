#!/bin/bash

# Script de Deploy Rápido para Render
# Uso: ./deploy.sh

echo "🚀 Iniciando proceso de deploy..."
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "server-new.js" ]; then
    echo "❌ Error: No se encuentra server-new.js"
    echo "   Asegúrate de estar en el directorio /backend"
    exit 1
fi

# Paso 1: Backup del servidor actual
echo "📦 Paso 1: Creando backup del servidor actual..."
if [ -f "server.js" ]; then
    cp server.js server-backup-$(date +%Y%m%d-%H%M%S).js
    echo "   ✅ Backup creado"
else
    echo "   ⚠️  No hay server.js para respaldar"
fi

# Paso 2: Reemplazar servidor
echo ""
echo "🔄 Paso 2: Reemplazando servidor con nueva arquitectura..."
cp server-new.js server.js
echo "   ✅ Servidor reemplazado"

# Paso 3: Verificar que funciona localmente
echo ""
echo "🧪 Paso 3: Verificando funcionamiento local..."
echo "   Iniciando servidor por 3 segundos..."
npm start &
SERVER_PID=$!
sleep 3

# Hacer health check
HEALTH_CHECK=$(curl -s http://localhost:3000/health 2>/dev/null)
kill $SERVER_PID 2>/dev/null

if [[ $HEALTH_CHECK == *"OK"* ]]; then
    echo "   ✅ Health check pasó"
else
    echo "   ⚠️  Health check falló - revisa manualmente"
fi

# Paso 4: Verificar archivos en git
echo ""
echo "📋 Paso 4: Verificando archivos en git..."
if git ls-files | grep -q "src/"; then
    echo "   ✅ Directorio src/ está en git"
else
    echo "   ⚠️  Agregando directorio src/ a git..."
    git add src/
fi

# Paso 5: Hacer commit
echo ""
echo "💾 Paso 5: Preparando commit..."
git add server.js
git status

echo ""
echo "📝 Ingresa el mensaje del commit (o presiona Enter para usar el default):"
read -r COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="feat: Migrar a arquitectura modular

- Refactorizar código a módulos por dominio
- Separar integraciones en /integrations  
- Agregar utilidades compartidas en /utils
- Crear documentación completa
- Mantener compatibilidad con rutas existentes"
fi

git commit -m "$COMMIT_MSG"

# Paso 6: Push
echo ""
echo "🚀 Paso 6: Haciendo push a repositorio..."
echo "   ¿Deseas hacer push ahora? (s/n)"
read -r CONFIRM

if [[ $CONFIRM == "s" || $CONFIRM == "S" || $CONFIRM == "y" || $CONFIRM == "Y" ]]; then
    git push origin main
    echo ""
    echo "✅ Push completado!"
    echo ""
    echo "🎉 Deploy iniciado en Render!"
    echo ""
    echo "📊 Próximos pasos:"
    echo "   1. Ve a https://dashboard.render.com"
    echo "   2. Verifica que el deploy esté en progreso"
    echo "   3. Espera 2-3 minutos"
    echo "   4. Verifica con: curl https://sistema-facturas-cr-web.onrender.com/health"
    echo ""
else
    echo "❌ Push cancelado"
    echo "   Puedes hacer push manualmente con: git push origin main"
fi

echo ""
echo "✅ Script completado!"
