#!/bin/bash
# Script para hacer reset preservando datos
# Uso: ./scripts/reset-with-data-preservation.sh

echo "🔄 Haciendo backup de datos antes del reset..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase/local_db_backup_${TIMESTAMP}.sql"

# Hacer backup de los datos
supabase db dump --local --data-only -f "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup guardado en: $BACKUP_FILE"
    echo "🔄 Haciendo reset de la base de datos..."
    
    # Hacer reset
    supabase db reset
    
    if [ $? -eq 0 ]; then
        echo "✅ Reset completado"
        echo "🔄 Restaurando datos..."
        
        # Restaurar datos
        psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f "$BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✅ Datos restaurados exitosamente"
        else
            echo "❌ Error al restaurar datos"
            exit 1
        fi
    else
        echo "❌ Error al hacer reset"
        exit 1
    fi
else
    echo "❌ Error al hacer backup"
    exit 1
fi







