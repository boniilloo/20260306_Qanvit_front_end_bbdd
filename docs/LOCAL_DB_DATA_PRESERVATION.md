# Preservación de Datos en Base de Datos Local

## ⚠️ Importante: `supabase db reset` borra TODO

Cada vez que ejecutas `supabase db reset`, la base de datos local se **borra completamente** y se recrea desde cero aplicando todas las migraciones.

## Opciones para conservar datos

### Opción 1: Seed File (Recomendado para desarrollo) ⭐

**Cómo funciona:**
- Crea un archivo `supabase/seed.sql` con los datos que quieres conservar
- Este archivo se ejecuta **automáticamente** después de cada `db reset`
- Está configurado en `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

**Ventajas:**
- ✅ Automático - no necesitas recordar hacer backup/restore
- ✅ Versionable (si lo quitas del .gitignore)
- ✅ Perfecto para datos de prueba/desarrollo

**Desventajas:**
- ⚠️ Hay que mantenerlo actualizado manualmente
- ⚠️ No preserva datos que creas durante el desarrollo

**Cómo usar:**
1. Copia `supabase/seed.sql.example` a `supabase/seed.sql`
2. Añade tus datos de prueba (INSERTs, etc.)
3. Ejecuta `supabase db reset` normalmente
4. Los datos se cargarán automáticamente

**Ejemplo:**
```sql
-- supabase/seed.sql
INSERT INTO public.companies (id, name, slug) 
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Mi Empresa', 'mi-empresa')
ON CONFLICT (id) DO NOTHING;
```

---

### Opción 2: Script de Backup/Restore Manual

**Scripts disponibles:**
- `scripts/backup-and-restore-local-db.sh` - Backup y restore manual
- `scripts/reset-with-data-preservation.sh` - Reset automático con preservación

**Uso del script automático:**
```bash
# Hace backup, reset y restore automáticamente
./scripts/reset-with-data-preservation.sh
```

**Uso manual:**
```bash
# 1. Hacer backup antes del reset
./scripts/backup-and-restore-local-db.sh backup

# 2. Hacer reset
supabase db reset

# 3. Restaurar datos
./scripts/backup-and-restore-local-db.sh restore supabase/local_db_backup_YYYYMMDD_HHMMSS.sql
```

**Ventajas:**
- ✅ Preserva todos los datos actuales
- ✅ No necesitas mantener un seed file

**Desventajas:**
- ⚠️ Más pasos manuales
- ⚠️ Puede fallar si hay cambios de esquema incompatibles

---

### Opción 3: Dump desde Remoto (Para datos de producción)

Si quieres usar datos reales del remoto:

```bash
# Hacer dump de datos del remoto (excluyendo embeddings que son muy grandes)
supabase db dump --linked --data-only -x public.embedding -f supabase/seed_data.sql

# Cargar en local después de un reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_data.sql
```

**Nota:** El archivo `seed_data.sql` está en `.gitignore` porque puede ser muy grande.

---

## Recomendación

Para desarrollo local, usa **Opción 1 (Seed File)**:
- Crea `supabase/seed.sql` con datos de prueba esenciales
- Los datos se cargan automáticamente después de cada reset
- Mantén el seed file actualizado con los datos que necesitas

Para casos especiales donde necesitas preservar datos actuales:
- Usa `scripts/reset-with-data-preservation.sh`

---

## Notas Importantes

1. **El seed file está en .gitignore** por defecto (puede contener datos sensibles)
2. **Los embeddings son muy grandes** - exclúyelos de los dumps con `-x public.embedding`
3. **Los cambios de esquema** pueden hacer que los datos antiguos sean incompatibles
4. **Solo afecta a la base de datos local** - el remoto nunca se toca con `db reset`







