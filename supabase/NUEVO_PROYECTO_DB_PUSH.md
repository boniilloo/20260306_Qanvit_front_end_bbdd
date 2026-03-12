# Conectar a la base de datos del proyecto NUEVO y primer db push

**Importante:** La base de datos antigua no se toca. Todo lo que sigue afecta solo al proyecto nuevo de Supabase.

## 1. Proyecto configurado

El proyecto nuevo está configurado con Reference ID **bymbfjkezrwsuvbsaycg** (URL: https://bymbfjkezrwsuvbsaycg.supabase.co) en `config.toml` y en todas las migraciones.

## 2. Enlazar el CLI al proyecto nuevo

Desde la raíz del frontend (`front_end_bbdd`):

```bash
npx supabase link --project-ref bymbfjkezrwsuvbsaycg
```

Te pedirá la contraseña de la base de datos del proyecto nuevo (Dashboard → Settings → Database → Database password). Así el CLI solo hablará con el proyecto nuevo.

## 3. Primer db push (solo al proyecto nuevo)

```bash
npx supabase db push
```

Esto aplica todas las migraciones en `supabase/migrations/` a la base de datos del proyecto nuevo. La antigua no se modifica.

---

## 4. Cuando quieras usar la app contra la base nueva: cambiar credenciales

Cuando te indique (o cuando quieras pasar el front a la base nueva), cambia solo estos sitios:

### Frontend (variables de entorno)

Crea o edita `.env` o `.env.local` en la raíz de `front_end_bbdd`:

```env
VITE_USE_LOCAL_SUPABASE=false
VITE_SUPABASE_URL=https://bymbfjkezrwsuvbsaycg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # Dashboard → Settings → API → anon public
```

URL del proyecto nuevo: `https://bymbfjkezrwsuvbsaycg.supabase.co`. Obtén la **anon key** en: **Dashboard → Settings → API → anon public**.

### Edge Functions (Supabase)

En **Dashboard del proyecto nuevo → Settings → Edge Functions** (o en cada función que use secretos), configura las variables que usen las funciones (por ejemplo las que lean de `supabase/functions/.env` en local). En producción se suelen definir en el Dashboard.

### Resumen de dónde cambian credenciales

| Dónde | Qué |
|-------|-----|
| Frontend `.env` / `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Código con fallbacks hardcodeados | `src/integrations/supabase/client.ts` y otros que usen la URL/anon key por defecto (opcional si usas siempre .env) |
| Dashboard Supabase (proyecto nuevo) | Database password (solo para el CLI), API keys, secrets de Edge Functions |

No hace falta tocar la base de datos antigua ni sus credenciales.
