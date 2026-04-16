# Guía: Edge Functions en Local

## 🚀 Inicio Rápido

### 1. Iniciar Supabase Local
```bash
supabase start
```

Esto iniciará todos los servicios, incluyendo el edge runtime que ejecuta las funciones.

### 2. URLs de las Edge Functions

Todas las edge functions están disponibles en:
```
http://127.0.0.1:54321/functions/v1/[nombre-función]
```

#### Lista de Edge Functions Disponibles:

- **create-subscription**: `http://127.0.0.1:54321/functions/v1/create-subscription`
- **manage-subscription**: `http://127.0.0.1:54321/functions/v1/manage-subscription`
- **send-notification-email**: `http://127.0.0.1:54321/functions/v1/send-notification-email`
- **send-rfx-review-email**: `http://127.0.0.1:54321/functions/v1/send-rfx-review-email`
- **send-company-invitation-email**: `http://127.0.0.1:54321/functions/v1/send-company-invitation-email`
- **send-admin-notification**: `http://127.0.0.1:54321/functions/v1/send-admin-notification`
- **auth-onboarding-email**: `http://127.0.0.1:54321/functions/v1/auth-onboarding-email`
- **geocode-location**: `http://127.0.0.1:54321/functions/v1/geocode-location`
- **cleanup-temp-files**: `http://127.0.0.1:54321/functions/v1/cleanup-temp-files`
- **crypto-service**: `http://127.0.0.1:54321/functions/v1/crypto-service`

### 3. Configurar Secrets (Variables de Entorno)

Los secrets ya están configurados. Para verlos:
```bash
supabase secrets list
```

Para añadir o actualizar un secret:
```bash
supabase secrets set NOMBRE_SECRET=valor
```

Para configurar múltiples secrets a la vez:
```bash
supabase secrets set SECRET1=valor1 SECRET2=valor2
```

**Importante**: Los secrets configurados con `supabase secrets set` son para el entorno **local**. Para producción, debes configurarlos en el dashboard de Supabase.

### 4. Probar una Edge Function

#### Ejemplo con cURL:

```bash
# Ejemplo: Probar send-admin-notification
curl -X POST http://127.0.0.1:54321/functions/v1/send-admin-notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TU_ANON_KEY_O_SERVICE_ROLE_KEY]" \
  -d '{
    "userId": "uuid-del-usuario",
    "companyId": "uuid-de-la-empresa",
    "notificationType": "approval",
    "companyName": "Nombre Empresa"
  }'
```

#### Ejemplo con JavaScript/TypeScript:

```typescript
const response = await fetch('http://127.0.0.1:54321/functions/v1/create-subscription', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({
    userId: 'uuid-del-usuario',
    companyId: 'uuid-de-la-empresa',
    email: 'email@ejemplo.com',
  }),
});

const data = await response.json();
console.log(data);
```

### 5. Obtener las Keys Locales

Para obtener las keys necesarias para autenticación:

```bash
supabase status
```

Esto mostrará:
- **API URL**: `http://127.0.0.1:54321`
- **anon key**: La key pública (anon key)
- **service_role key**: La key de servicio (más permisos)

También puedes obtenerlas directamente:
```bash
# Anon key
supabase status | grep "anon key"

# Service role key (para funciones que requieren permisos elevados)
supabase status | grep "service_role key"
```

### 6. Hot Reload

Las edge functions tienen **hot reload** habilitado por defecto (configurado en `config.toml` con `policy = "per_worker"`). Esto significa que:

- ✅ Los cambios en las funciones se reflejan automáticamente
- ✅ No necesitas reiniciar Supabase después de editar una función
- ✅ Solo necesitas guardar el archivo y la función se recargará

### 7. Debugging

Para debuggear las edge functions:

1. **Logs en consola**: Los `console.log()` aparecerán en la terminal donde ejecutaste `supabase start`

2. **Chrome Inspector**: El puerto de debugging está configurado en `config.toml`:
   - Inspector port: `8083`
   - Puedes conectar Chrome DevTools a `chrome://inspect` y seleccionar el proceso

3. **Ver logs específicos**:
   ```bash
   # Ver logs de todas las funciones
   supabase functions logs
   
   # Ver logs de una función específica
   supabase functions logs [nombre-función]
   ```

### 8. Variables de Entorno que Necesitan las Funciones

Basado en el código, estas son las variables que necesitas configurar:

#### Funciones de Email (Resend):
- `RESEND_API_KEY`

#### Variables Generales:
- `SUPABASE_URL` o `EDGE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_KEY`
- `FRONTEND_BASE_URL` (opcional, default: "https://fqsource.com")
- `FRONTEND_ALLOWED_ORIGINS` (opcional)

#### Funciones Específicas:
- `MAPBOX_PUBLIC_TOKEN` (solo para geocode-location)
- `MASTER_ENCRYPTION_KEY` (solo para crypto-service)

### 9. Configurar para Desarrollo Local

Para que tu aplicación frontend use las edge functions locales, asegúrate de:

1. **Configurar la URL base**:
   ```typescript
   const EDGE_FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1';
   ```

2. **Usar la anon key local** (no la de producción):
   ```bash
   supabase status
   # Copia la "anon key" que aparece
   ```

### 10. Troubleshooting

#### Las funciones no responden:
1. Verifica que Supabase esté corriendo: `supabase status`
2. **Verifica que el edge runtime esté activo**: Si ves `supabase_edge_runtime_...` en la lista de "Stopped services", el edge runtime está detenido. Para solucionarlo:
   ```bash
   supabase stop && supabase start
   ```
   Esto reiniciará todos los servicios, incluyendo el edge runtime.
3. Revisa los logs: `supabase functions logs`

#### Error de autenticación:
- Asegúrate de usar la `anon key` o `service_role key` local (no la de producción)
- Verifica que el header `Authorization` esté correctamente formateado

#### Variables de entorno no encontradas:
- Verifica que los secrets estén configurados: `supabase secrets list`
- Algunas funciones tienen valores por defecto, pero otras fallarán si faltan variables críticas

#### Hot reload no funciona:
- Verifica en `config.toml` que `policy = "per_worker"` esté configurado
- Si tienes problemas, puedes cambiar a `policy = "oneshot"` y reiniciar

### 11. Comandos Útiles

```bash
# Iniciar Supabase
supabase start

# Ver estado
supabase status

# Ver logs de funciones
supabase functions logs

# Ver logs de una función específica
supabase functions logs create-subscription

# Listar secrets
supabase secrets list

# Detener Supabase
supabase stop

# Reiniciar Supabase
supabase stop && supabase start
```

## 📝 Notas Importantes

- Las edge functions locales usan **Deno runtime** (versión 2 según tu config)
- Los cambios en las funciones se reflejan automáticamente (hot reload)
- Los secrets locales son independientes de los de producción
- Para producción, debes hacer deploy: `supabase functions deploy [nombre-función]`
- El puerto por defecto para las funciones es `54321` (mismo que la API)








