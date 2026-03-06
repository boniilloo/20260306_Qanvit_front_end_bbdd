#!/bin/bash

# Script para sincronizar la carpeta cybersecurity_report_20251127 con un repositorio público
# Uso: ./sync-cybersecurity-reports.sh
#
# IMPORTANTE: Antes de usar este script:
# 1. Crea un repositorio público en GitHub
# 2. Reemplaza TU_USUARIO y TU_REPO en la variable PUBLIC_REPO_URL

set -e  # Salir si hay algún error

REPO_DIR="/home/david-bonillo/Documentos/FQ Source/20250617_Primera_version_web/FQ-V1-product"
CYBERSEC_DIR="cybersecurity_report_20251127"
# URL del repositorio público
PUBLIC_REPO_URL="git@github.com:boniilloo/FQ-Source-Cybersecurity-20251202.git"

cd "$REPO_DIR"

# Verificar que estamos en un repositorio git
if [ ! -d ".git" ]; then
    echo "❌ Error: No estás en un repositorio git"
    exit 1
fi

# Verificar que existe la carpeta
if [ ! -d "$CYBERSEC_DIR" ]; then
    echo "❌ Error: La carpeta $CYBERSEC_DIR no existe"
    exit 1
fi

# Verificar que la URL no es la por defecto
if [[ "$PUBLIC_REPO_URL" == *"TU_USUARIO"* ]]; then
    echo "❌ Error: Debes configurar PUBLIC_REPO_URL en el script con tu repositorio real"
    echo "   Edita el archivo sync-cybersecurity-reports.sh y reemplaza TU_USUARIO y TU_REPO"
    exit 1
fi

# Verificar si ya existe el remoto para el subtree
if git remote | grep -q "cybersecurity-public"; then
    echo "ℹ️  El remoto cybersecurity-public ya existe"
    # Actualizar la URL por si acaso cambió
    git remote set-url cybersecurity-public "$PUBLIC_REPO_URL"
else
    echo "➕ Añadiendo remoto para el repositorio público..."
    git remote add cybersecurity-public "$PUBLIC_REPO_URL"
fi

# Verificar que hay cambios para commitear
if git diff --quiet -- "$CYBERSEC_DIR" && git diff --cached --quiet -- "$CYBERSEC_DIR"; then
    echo "ℹ️  No hay cambios en $CYBERSEC_DIR para sincronizar"
else
    echo "📝 Hay cambios sin commitear. ¿Quieres hacer commit antes de sincronizar? (s/n)"
    read -r response
    if [[ "$response" =~ ^[Ss]$ ]]; then
        git add "$CYBERSEC_DIR"
        git commit -m "Update cybersecurity reports"
    fi
fi

# Push del subtree al repositorio público
echo "🔄 Sincronizando carpeta con el repositorio público..."
git subtree push --prefix="$CYBERSEC_DIR" cybersecurity-public main

echo "✅ ¡Sincronización completada!"
echo "   Repositorio público: $PUBLIC_REPO_URL"

