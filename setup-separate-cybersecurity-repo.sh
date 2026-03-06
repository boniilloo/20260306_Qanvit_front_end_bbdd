#!/bin/bash

# Script para configurar un repositorio separado para cybersecurity_report_20251127
# Uso: ./setup-separate-cybersecurity-repo.sh
#
# IMPORTANTE: Antes de usar este script:
# 1. Crea un repositorio público en GitHub
# 2. Reemplaza TU_USUARIO y TU_REPO en la variable PUBLIC_REPO_URL

set -e  # Salir si hay algún error

REPO_DIR="/home/david-bonillo/Documentos/FQ Source/20250617_Primera_version_web/FQ-V1-product"
CYBERSEC_DIR="cybersecurity_report_20251127"
# ⚠️ REEMPLAZA ESTA URL con la URL de tu repositorio público
PUBLIC_REPO_URL="git@github.com:TU_USUARIO/cybersecurity-reports.git"

cd "$REPO_DIR"

# Verificar que existe la carpeta
if [ ! -d "$CYBERSEC_DIR" ]; then
    echo "❌ Error: La carpeta $CYBERSEC_DIR no existe"
    exit 1
fi

# Verificar que la URL no es la por defecto
if [[ "$PUBLIC_REPO_URL" == *"TU_USUARIO"* ]]; then
    echo "❌ Error: Debes configurar PUBLIC_REPO_URL en el script con tu repositorio real"
    echo "   Edita el archivo setup-separate-cybersecurity-repo.sh y reemplaza TU_USUARIO y TU_REPO"
    exit 1
fi

# Verificar si ya es un repositorio git
if [ -d "$CYBERSEC_DIR/.git" ]; then
    echo "ℹ️  La carpeta ya es un repositorio git"
    cd "$CYBERSEC_DIR"
    
    # Verificar si ya tiene el remoto
    if git remote | grep -q "origin"; then
        echo "ℹ️  El remoto origin ya existe"
        git remote set-url origin "$PUBLIC_REPO_URL"
    else
        echo "➕ Añadiendo remoto origin..."
        git remote add origin "$PUBLIC_REPO_URL"
    fi
    
    echo "🔄 Sincronizando con el repositorio remoto..."
    git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || {
        echo "⚠️  No se pudo hacer push. Verifica que el repositorio remoto existe y está vacío."
        echo "   O que tienes permisos para hacer push."
    }
else
    echo "📦 Inicializando repositorio git en la carpeta..."
    cd "$CYBERSEC_DIR"
    git init
    git add .
    git commit -m "Initial commit: Cybersecurity reports"
    
    echo "➕ Conectando con el repositorio remoto..."
    git remote add origin "$PUBLIC_REPO_URL"
    git branch -M main
    
    echo "🔄 Subiendo al repositorio público..."
    git push -u origin main || {
        echo "⚠️  Error al hacer push. Verifica:"
        echo "   1. Que el repositorio remoto existe y está vacío"
        echo "   2. Que tienes permisos para hacer push"
        echo "   3. Que la URL del repositorio es correcta"
        exit 1
    }
fi

echo "✅ ¡Configuración completada!"
echo "   Repositorio público: $PUBLIC_REPO_URL"
echo ""
echo "📝 Para futuras sincronizaciones, ejecuta desde la carpeta:"
echo "   cd $CYBERSEC_DIR"
echo "   git add ."
echo "   git commit -m 'Update reports'"
echo "   git push"


