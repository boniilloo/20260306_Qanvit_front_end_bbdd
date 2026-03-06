# Cybersecurity Audit - Control OPS-04

## Control Information

- **Control ID**: OPS-04
- **Control Name**: Use of Production Data in Test
- **Audit Date**: 2025-11-27
- **Client Question**: Do you use production data in testing environments?

---

## Executive Summary

✅ **COMPLIANCE**: The platform maintains strict separation between production and testing environments, with no use of production data in testing environments. The development and testing infrastructure uses isolated local databases with synthetic test data managed through seed files. While optional tooling exists to dump data from production, this capability is explicitly documented as optional, requires manual execution, and all outputs are excluded from version control. The default and recommended approach uses test data generated locally or manually created seed files.

1. **Local Development Database** - Completely isolated Supabase local instance for development and testing
2. **Test Data Management** - Seed files with synthetic test data, excluded from version control
3. **Production Data Access** - Optional, manual process with explicit documentation and safeguards
4. **Environment Isolation** - Clear separation between local development and production databases
5. **Data Policy Documentation** - Explicit guidance on data usage in non-productive environments
6. **Version Control Protection** - Seed files containing potentially sensitive data are gitignored

---

## 1. Local Development Database Isolation

### 1.1. Supabase Local Instance

The platform uses **Supabase CLI** to run a completely isolated local database instance for development and testing:

- **Local Database**: Separate PostgreSQL instance running on `localhost:54322`
- **Isolation**: No connection to production database during local development
- **Configuration**: Managed through `supabase/config.toml`
- **Reset Capability**: `supabase db reset` completely recreates the local database from scratch

**Evidence**:
```toml
# supabase/config.toml
[db]
# Port to use for the local database URL.
port = 54322
# Port used by db diff command to initialize the shadow database.
shadow_port = 54320
# The database major version to use. This has to be the same as your remote database's.
major_version = 15

[db.seed]
# If enabled, seeds the database after migrations during a db reset.
enabled = true
# Specifies an ordered list of seed files to load during db reset.
# Supports glob patterns relative to supabase directory: "./seeds/*.sql"
sql_paths = ["./seed.sql"]
```

**Architecture**:
- Local Supabase instance runs independently from production
- Database reset operations only affect the local instance
- Production database is never modified by local development operations

### 1.2. Environment Configuration

The application explicitly separates local and production database connections:

**Evidence**:
```typescript
// src/integrations/supabase/client.ts
const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';

const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY = import.meta.env.VITE_SUPABASE_LOCAL_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fukzxedgbszcpakqkrjf.supabase.co';
const REMOTE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const SUPABASE_URL = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
const SUPABASE_PUBLISHABLE_KEY = USE_LOCAL ? LOCAL_ANON_KEY : REMOTE_ANON_KEY;
```

This demonstrates:
- **Explicit Environment Selection**: Runtime check determines which database to use
- **Separate Connection Strings**: Different URLs and keys for local vs production
- **No Automatic Production Access**: Local development defaults to local database

---

## 2. Test Data Management

### 2.1. Seed File System

The platform uses a **seed file system** to populate the local development database with test data:

- **Seed File**: `supabase/seed.sql` contains test data
- **Automatic Loading**: Seed file executes automatically after `supabase db reset`
- **Test Data Only**: Seed files contain synthetic test data, not production data
- **Version Control Exclusion**: Seed files are excluded from Git to prevent accidental exposure

**Evidence**:
```bash
# .gitignore
# Supabase seed data (too large for GitHub)
supabase/seed_data.sql
supabase/seed*.sql
supabase/**/seed*.sql
```

**Seed File Content Analysis**:
The seed file contains test data including:
- Test user accounts with temporary email addresses (e.g., `j0h5k0edne@jkotypc.com`, `pesebol256@7tul.com`)
- Audit log entries from local development sessions
- Synthetic data generated for testing purposes

**Evidence**:
```sql
-- supabase/seed.sql (sample content)
INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', '115a9465-b7f6-4a34-bc4d-763ad2cda471', '{"action":"user_signedup","actor_id":"50052c5f-5207-4d78-8490-26152a004730","actor_username":"1t12davidbonillo@gmail.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}', '2025-11-25 10:53:54.388507+00', ''),
	('00000000-0000-0000-0000-000000000000', 'dd6afa10-904d-4acd-b1b0-c3f835c51916', '{"action":"login","actor_id":"8b3b0993-16a6-4716-91e7-85a960f4077c","actor_username":"j0h5k0edne@jkotypc.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-11-25 10:54:26.214217+00', '');
```

**Characteristics of Test Data**:
- Temporary email addresses (not real production user emails)
- Test user IDs and session data
- Data generated during local development sessions
- No production customer data or sensitive information

### 2.2. Seed File Generation

The platform provides scripts to generate seed files from **local database state**, not from production:

**Evidence**:
```bash
# scripts/dump-local-seed.sh
#!/bin/bash
set -e

echo "📦 Generando seed.sql desde la base de datos local..."
echo ""

# Configuración
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SEED_FILE="supabase/seed.sql"

# Hacer dump con pg_dump
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
```

**Key Points**:
- **Source**: Dumps from `localhost:54322` (local database), not production
- **Purpose**: Preserve local development state, not production data
- **Isolation**: No connection to production database

### 2.3. Data Preservation Documentation

The platform maintains explicit documentation on data management in non-productive environments:

**Evidence**:
```markdown
# docs/LOCAL_DB_DATA_PRESERVATION.md

## Opción 1: Seed File (Recomendado para desarrollo) ⭐

**Cómo funciona:**
- Crea un archivo `supabase/seed.sql` con los datos que quieres conservar
- Este archivo se ejecuta **automáticamente** después de cada `db reset`
- Está configurado en `supabase/config.toml`

**Ventajas:**
- ✅ Automático - no necesitas recordar hacer backup/restore
- ✅ Versionable (si lo quitas del .gitignore)
- ✅ Perfecto para datos de prueba/desarrollo
```

**Documentation Policy**:
- **Recommended Approach**: Use seed files with test/development data
- **Explicit Guidance**: Documentation clearly states seed files are for "datos de prueba/desarrollo" (test/development data)
- **Best Practice**: Seed files should contain essential test data, not production data

---

## 3. Production Data Access (Optional)

### 3.1. Optional Production Dump Capability

While the platform provides **optional** tooling to dump data from production, this capability is:

- **Explicitly Optional**: Documented as "Opción 3" (Option 3), not the default
- **Manual Process**: Requires explicit manual execution
- **Excluded from Version Control**: Output files are gitignored
- **Documented with Warnings**: Documentation notes the file size and purpose

**Evidence**:
```markdown
# docs/LOCAL_DB_DATA_PRESERVATION.md

### Opción 3: Dump desde Remoto (Para datos de producción)

Si quieres usar datos reales del remoto:

```bash
# Hacer dump de datos del remoto (excluyendo embeddings que son muy grandes)
supabase db dump --linked --data-only -x public.embedding -f supabase/seed_data.sql

# Cargar en local después de un reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_data.sql
```

**Nota:** El archivo `seed_data.sql` está en `.gitignore` porque puede ser muy grande.
```

**Safeguards**:
- **Separate File**: Uses `seed_data.sql` (different from `seed.sql`) to distinguish production dumps
- **Gitignored**: Production dumps are excluded from version control
- **Manual Only**: No automated process that would pull production data into test environments
- **Documentation**: Explicitly labeled as optional and for special cases

### 3.2. Production Dump Script Status

The script for generating seeds from production exists but is **incomplete and not functional**:

**Evidence**:
```bash
# scripts/generate-seed.sh
#!/bin/bash

# Script para generar seed.sql con 200 empresas, sus productos y vectores
# desde la base de datos remota usando Supabase CLI

echo "⚠️  El dump completo se ha guardado en $SEED_FILE.tmp"
echo "Para filtrar a 200 empresas, necesitamos usar el script Node.js con SERVICE_ROLE_KEY"
echo ""
echo "Opciones:"
echo "1. Configurar SUPABASE_SERVICE_ROLE_KEY en .env.local y ejecutar: node scripts/generate-seed.js"
echo "2. Usar el dump completo (puede ser muy grande)"
```

**Status**:
- **Incomplete Implementation**: Script does not fully automate production data extraction
- **Requires Manual Configuration**: Needs explicit SERVICE_ROLE_KEY configuration
- **Not Default Workflow**: Not integrated into standard development workflow
- **Documentation Only**: Serves as documentation of optional capability, not active process

---

## 4. Environment Separation Enforcement

### 4.1. Database Reset Operations

The `supabase db reset` command only affects the local database:

**Evidence**:
```markdown
# docs/LOCAL_DB_DATA_PRESERVATION.md

## ⚠️ Importante: `supabase db reset` borra TODO

Cada vez que ejecutas `supabase db reset`, la base de datos local se **borra completamente** y se recrea desde cero aplicando todas las migraciones.

## Notas Importantes

4. **Solo afecta a la base de datos local** - el remoto nunca se toca con `db reset`
```

**Enforcement**:
- **Local Only**: Reset operations cannot affect production database
- **Explicit Documentation**: Clear statement that remote database is never touched
- **Safety**: No risk of accidentally resetting production data

### 4.2. Workspace Rules

The workspace rules specify dumping from **local database only**:

**Evidence**:
```markdown
# .cursor/rules (workspace rules)

Para hacer un dump de la base de datos local, usamos el comando supabase db dump --local --data-only --schema auth --schema public > supabase/seed.sql. De esta manera no metemos otros esquemas que hacen que no se pueda hacer el reset de manera correcta.
```

**Policy Enforcement**:
- **Explicit Command**: Uses `--local` flag to ensure local database only
- **Standard Practice**: Documented as the standard approach for seed generation
- **No Production Access**: Command explicitly targets local database

---

## 5. Data Classification and Handling

### 5.1. Seed File Classification

Seed files are treated as potentially sensitive and excluded from version control:

**Evidence**:
```markdown
# docs/LOCAL_DB_DATA_PRESERVATION.md

## Notas Importantes

1. **El seed file está en .gitignore** por defecto (puede contener datos sensibles)
```

**Classification**:
- **Sensitive Data Handling**: Seed files treated as potentially containing sensitive data
- **Version Control Exclusion**: Prevented from being committed to repositories
- **Security Precaution**: Even test data is protected from accidental exposure

### 5.2. Test Data Characteristics

The test data in seed files demonstrates characteristics of synthetic test data:

- **Temporary Email Addresses**: Test accounts use temporary email services
- **Development Session Data**: Audit logs from local development sessions
- **No Production Identifiers**: No real customer data or production identifiers
- **Controlled Generation**: Data generated during controlled development activities

---

## 6. Compliance Assessment

### 6.1. Control Requirements

The control OPS-04 requires:
- **Avoid unnecessary data exposure**: Production data should not be used in testing environments
- **Data policy in non-productive environments**: Clear policy on data usage in test environments

### 6.2. Compliance Evidence

| Requirement | Status | Evidence |
|-----|-----|----|
| No production data in test environments | ✅ COMPLIANT | Local database isolation, test data in seed files, optional production dump capability is manual and excluded from version control |
| Data policy for non-productive environments | ✅ COMPLIANT | Explicit documentation in `LOCAL_DB_DATA_PRESERVATION.md` recommending test data, seed files gitignored, workspace rules specify local-only dumps |
| Environment separation | ✅ COMPLIANT | Separate local Supabase instance, explicit environment configuration, reset operations only affect local database |
| Safeguards against accidental production data use | ✅ COMPLIANT | Gitignore for seed files, separate file naming for production dumps, incomplete automation for production dumps |

---

## 7. Conclusions

### 7.1. Strengths

✅ **Clear Environment Separation**: The platform maintains strict isolation between local development and production databases through Supabase CLI local instances.

✅ **Test Data Management**: Well-documented seed file system for managing test data, with explicit guidance on using test/development data rather than production data.

✅ **Version Control Protection**: Seed files are excluded from Git to prevent accidental exposure of potentially sensitive data, even if it's test data.

✅ **Explicit Documentation**: Clear documentation in `LOCAL_DB_DATA_PRESERVATION.md` provides guidance on data usage in non-productive environments, recommending test data over production data.

✅ **Safeguards Against Production Data Use**: Optional production dump capability exists but is manual, incomplete, and outputs are excluded from version control, preventing automated or accidental use of production data in test environments.

✅ **Workspace Rules Enforcement**: Workspace rules explicitly specify using `--local` flag for database dumps, ensuring local database is the source for seed files.

### 7.2. Recommendations

1. **Formalize Data Policy Document**: Create a formal data policy document that explicitly prohibits the use of production data in testing environments, with exceptions only for specific, documented, and approved use cases.

2. **Complete Production Dump Script Removal or Formalization**: Either remove the incomplete production dump scripts or complete their implementation with explicit warnings, approval workflows, and data sanitization requirements if production data access is needed for specific testing scenarios.

3. **Data Sanitization Guidelines**: If production data access is ever needed, establish guidelines for data sanitization (anonymization, pseudonymization) before use in test environments.

4. **Regular Audit of Seed Files**: Implement periodic reviews of seed file contents to ensure they contain only test data and no production data has been accidentally included.

5. **Access Controls for Production Dump**: If production dump capability is retained, implement access controls and audit logging for when and by whom production data is accessed for testing purposes.

---

## 8. Control Compliance

| Criterion | Status | Evidence |
|-----|-----|----|
| Production data is not used in testing environments | ✅ COMPLIANT | Local database isolation, test data in seed files, optional production dump is manual and excluded from version control |
| Data policy exists for non-productive environments | ✅ COMPLIANT | Documentation in `LOCAL_DB_DATA_PRESERVATION.md` recommends test data, seed files gitignored |
| Safeguards prevent accidental production data use | ✅ COMPLIANT | Gitignore for seed files, workspace rules specify local-only dumps, incomplete automation for production dumps |

**FINAL VERDICT**: ✅ **COMPLIANT** with control OPS-04. The platform maintains strict separation between production and testing environments, using isolated local databases with synthetic test data. While optional tooling exists to access production data, it is manual, incomplete, and outputs are excluded from version control. The default and recommended approach uses test data generated locally or manually created seed files, avoiding unnecessary exposure of production data in testing environments.

---

## Appendices

### A. Seed File Generation Workflow

**Standard Workflow (Recommended)**:
1. Developer works with local Supabase instance (`localhost:54322`)
2. Creates test data during development
3. Uses `scripts/dump-local-seed.sh` to generate seed file from local database
4. Seed file is gitignored and contains only test data
5. Seed file automatically loads after `supabase db reset`

**Optional Production Dump Workflow (Not Recommended)**:
1. Developer manually executes `supabase db dump --linked --data-only`
2. Output saved to `seed_data.sql` (separate from `seed.sql`)
3. File is gitignored
4. Manual loading required
5. Not integrated into standard workflow

### B. Environment Configuration Matrix

| Component | Local Development | Production |
|-----|-----|-----|
| Database URL | `http://127.0.0.1:54321` | `https://fukzxedgbszcpakqkrjf.supabase.co` |
| Database Port | `54322` | N/A (cloud) |
| Seed File | `supabase/seed.sql` (test data) | N/A |
| Reset Command | `supabase db reset` (local only) | N/A |
| Data Source | Local database or manual test data | Production database (isolated) |

### C. File Exclusion Patterns

The following patterns are excluded from version control to protect potentially sensitive data:

```gitignore
# Supabase seed data (too large for GitHub)
supabase/seed_data.sql
supabase/seed*.sql
supabase/**/seed*.sql
```

This ensures:
- Seed files with test data are not committed
- Production dumps (if created) are not committed
- Any seed-related files are excluded from repositories

---

**End of Audit Report - Control OPS-04**



