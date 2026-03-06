#!/bin/bash

# Script para generar seed.sql con 200 empresas, sus productos y vectores
# desde la base de datos remota usando Supabase CLI

set -e

echo "Generando seed.sql con 200 empresas, productos y vectores..."
echo ""

# Directorio del proyecto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_FILE="$PROJECT_DIR/supabase/seed.sql"

# Verificar que supabase CLI esté instalado
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI no está instalado"
    exit 1
fi

# Verificar que estemos enlazados a un proyecto remoto
if ! supabase projects list &> /dev/null; then
    echo "Error: No estás autenticado con Supabase CLI. Ejecuta: supabase login"
    exit 1
fi

cd "$PROJECT_DIR"

# Crear un script SQL temporal que filtre los datos
TEMP_SQL=$(mktemp)
cat > "$TEMP_SQL" << 'EOFSQL'
-- Script para exportar 200 empresas, productos y vectores
-- Crear tablas temporales con los IDs seleccionados

CREATE TEMP TABLE temp_selected_companies AS
SELECT id FROM public.company 
ORDER BY created_at DESC NULLS LAST, id
LIMIT 200;

CREATE TEMP TABLE temp_selected_products AS
SELECT p.id FROM public.product p
INNER JOIN temp_selected_companies sc ON p.company_id = sc.id;

CREATE TEMP TABLE temp_selected_product_revisions AS
SELECT pr.id FROM public.product_revision pr
INNER JOIN temp_selected_products sp ON pr.product_id = sp.id;

-- Mostrar resumen
SELECT 
    (SELECT COUNT(*) FROM temp_selected_companies) as empresas,
    (SELECT COUNT(*) FROM temp_selected_products) as productos,
    (SELECT COUNT(*) FROM temp_selected_product_revisions) as revisiones,
    (SELECT COUNT(*) FROM public.embedding e 
     INNER JOIN temp_selected_product_revisions spr ON e.id_product_revision = spr.id 
     WHERE e.id_product_revision IS NOT NULL) as embeddings;
EOFSQL

echo "Obteniendo resumen de datos..."
supabase db dump --linked --data-only -t company -t product -t product_revision -t embedding --file "$SEED_FILE.tmp" 2>&1 | head -5 || true

# Ahora necesitamos filtrar el dump para solo incluir las 200 empresas
# Esto es más complejo, así que mejor usamos un script Python/Node más simple
# Por ahora, vamos a hacer el dump completo y luego filtrar

echo ""
echo "Haciendo dump completo de las tablas..."
supabase db dump --linked --data-only -t company -t product -t product_revision -t embedding --file "$SEED_FILE.tmp" 2>/dev/null || {
    echo "Error: No se pudo hacer dump. Verifica que estés enlazado al proyecto correcto."
    echo "Ejecuta: supabase link --project-ref fukzxedgbszcpakqkrjf"
    exit 1
}

# El problema es que pg_dump no permite filtrar por cantidad de filas fácilmente
# Necesitamos usar un script que procese el dump y filtre

echo ""
echo "⚠️  El dump completo se ha guardado en $SEED_FILE.tmp"
echo "Para filtrar a 200 empresas, necesitamos usar el script Node.js con SERVICE_ROLE_KEY"
echo ""
echo "Opciones:"
echo "1. Configurar SUPABASE_SERVICE_ROLE_KEY en .env.local y ejecutar: node scripts/generate-seed.js"
echo "2. Usar el dump completo (puede ser muy grande)"

rm -f "$TEMP_SQL"






