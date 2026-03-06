#!/bin/bash
set -e

echo "🔍 Verificando imágenes de storage-api..."

# Verificar si existe una versión problemática (v1.29.0 o v1.32.0 real, no la taggeada desde v1.11.8)
PROBLEMATIC_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep "storage-api:v1.29.0\|storage-api:v1.32.0" || true)

if [ -n "$PROBLEMATIC_IMAGES" ]; then
    # Verificar si alguna es realmente problemática (no es la v1.11.8 taggeada)
    NEEDS_FIX=false
    
    while IFS= read -r line; do
        IMAGE_ID=$(echo "$line" | awk '{print $2}')
        # Verificar si esta imagen NO es la v1.11.8
        NOT_SAFE=$(docker images --format "{{.ID}} {{.Repository}}:{{.Tag}}" | grep "$IMAGE_ID" | grep -v "v1.11.8" | grep "v1.29.0\|v1.32.0" || true)
        
        if [ -n "$NOT_SAFE" ]; then
            NEEDS_FIX=true
            break
        fi
    done <<< "$PROBLEMATIC_IMAGES"
    
    if [ "$NEEDS_FIX" = true ]; then
        echo "⚠️  Versión problemática de storage-api detectada. Aplicando fix..."
        
        # Eliminar todas las imágenes de storage-api
        echo "🗑️  Eliminando imágenes problemáticas..."
        docker images | grep "storage-api" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
        
        # Descargar versión estable
        echo "📦 Descargando storage-api v1.11.8..."
        docker pull public.ecr.aws/supabase/storage-api:v1.11.8
        
        # Etiquetar como v1.29.0
        echo "🏷️  Etiquetando como v1.29.0..."
        docker tag public.ecr.aws/supabase/storage-api:v1.11.8 public.ecr.aws/supabase/storage-api:v1.29.0
        
        echo "✅ Fix aplicado correctamente"
    else
        echo "✅ Ya tienes la versión segura de storage-api"
    fi
else
    echo "ℹ️  No se encontró storage-api v1.29.0/v1.32.0. Descargando versión segura..."
    
    # Verificar si ya tenemos v1.11.8
    HAS_SAFE_VERSION=$(docker images | grep "storage-api:v1.11.8" || true)
    
    if [ -z "$HAS_SAFE_VERSION" ]; then
        echo "📦 Descargando storage-api v1.11.8..."
        docker pull public.ecr.aws/supabase/storage-api:v1.11.8
    fi
    
    # Etiquetar como v1.29.0
    echo "🏷️  Etiquetando como v1.29.0..."
    docker tag public.ecr.aws/supabase/storage-api:v1.11.8 public.ecr.aws/supabase/storage-api:v1.29.0
fi

echo ""
echo "✅ Iniciando Supabase..."
supabase start

echo ""
echo "🎉 Supabase iniciado correctamente!"
echo ""
supabase status

