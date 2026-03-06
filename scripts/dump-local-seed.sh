#!/bin/bash
set -e

echo "📦 Generando seed.sql desde la base de datos local..."
echo ""

# Configuración
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SEED_FILE="supabase/seed.sql"
TEMP_FILE="supabase/seed.sql.tmp"

# Verificar que Supabase esté corriendo
if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Error: Supabase local no está corriendo"
    echo "Ejecuta: supabase start"
    exit 1
fi

# Mostrar resumen de datos
echo "📊 Resumen de datos en la BD local:"
psql "$DB_URL" -c "
SELECT 
    'auth.users' as tabla,
    COUNT(*) as registros
FROM auth.users
UNION ALL
SELECT 
    'public.company' as tabla,
    COUNT(*) as registros
FROM public.company
UNION ALL
SELECT 
    'public.product' as tabla,
    COUNT(*) as registros
FROM public.product
UNION ALL
SELECT 
    'public.embedding' as tabla,
    COUNT(*) as registros
FROM public.embedding
ORDER BY tabla;
"

echo ""
read -p "¿Continuar con el dump? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operación cancelada"
    exit 1
fi

# Backup del seed anterior si existe
if [ -f "$SEED_FILE" ]; then
    BACKUP_FILE="${SEED_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "💾 Haciendo backup del seed anterior: $BACKUP_FILE"
    cp "$SEED_FILE" "$BACKUP_FILE"
fi

# Hacer dump con pg_dump
echo "🔄 Generando dump de los esquemas auth y public..."

pg_dump \
    --host=127.0.0.1 \
    --port=54322 \
    --username=postgres \
    --no-owner \
    --no-privileges \
    --data-only \
    --schema=auth \
    --schema=public \
    --column-inserts \
    --rows-per-insert=1 \
    "$DB_URL" 2>/dev/null > "$TEMP_FILE"

# Verificar que el dump tenga contenido
if [ ! -s "$TEMP_FILE" ]; then
    echo "❌ Error: El dump está vacío"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Agregar header con session_replication_role
echo "📝 Agregando header al seed..."
cat > "$SEED_FILE" << 'EOF'
SET session_replication_role = replica;

EOF

cat "$TEMP_FILE" >> "$SEED_FILE"
rm -f "$TEMP_FILE"

# Mostrar estadísticas del archivo generado
FILE_SIZE=$(du -h "$SEED_FILE" | cut -f1)
LINE_COUNT=$(wc -l < "$SEED_FILE")
INSERT_COUNT=$(grep -c "^INSERT INTO" "$SEED_FILE" || echo "0")

echo ""
echo "✅ Seed generado exitosamente!"
echo ""
echo "📊 Estadísticas:"
echo "   - Archivo: $SEED_FILE"
echo "   - Tamaño: $FILE_SIZE"
echo "   - Líneas: $LINE_COUNT"
echo "   - INSERTs: $INSERT_COUNT"
echo ""

# Verificar tablas incluidas
echo "📋 Tablas incluidas en el seed:"
grep "^INSERT INTO" "$SEED_FILE" | sed 's/INSERT INTO "\([^"]*\)"\."[^"]*".*/\1/' | sort | uniq -c

echo ""
echo "🎉 ¡Listo! Ahora puedes usar el seed con:"
echo "   supabase db reset"
echo "   O manualmente:"
echo "   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f $SEED_FILE"

