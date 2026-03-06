#!/bin/bash
# Script para hacer backup y restore de la base de datos local
# Uso: ./scripts/backup-and-restore-local-db.sh [backup|restore]

ACTION=${1:-backup}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase/local_db_backup_${TIMESTAMP}.sql"

if [ "$ACTION" = "backup" ]; then
    echo "Haciendo backup de la base de datos local..."
    supabase db dump --local --data-only -f "$BACKUP_FILE"
    echo "✅ Backup guardado en: $BACKUP_FILE"
    echo "💡 Para restaurar: ./scripts/backup-and-restore-local-db.sh restore $BACKUP_FILE"
elif [ "$ACTION" = "restore" ]; then
    RESTORE_FILE=${2:-$BACKUP_FILE}
    if [ ! -f "$RESTORE_FILE" ]; then
        echo "❌ Error: Archivo de backup no encontrado: $RESTORE_FILE"
        exit 1
    fi
    echo "Restaurando datos desde: $RESTORE_FILE"
    psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f "$RESTORE_FILE"
    echo "✅ Datos restaurados"
else
    echo "Uso: $0 [backup|restore] [archivo_backup]"
    exit 1
fi







