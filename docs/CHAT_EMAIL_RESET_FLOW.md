# Chat Email Notification Reset Flow

## 🔄 Comportamiento Actualizado

El sistema ahora permite **emails reutilizables** por sesión de mensajes no leídos.

### Flujo Completo

```
1. Supplier envía mensaje a Buyer
   └─> Mensaje almacenado en rfx_supplier_chat_messages
   
2. Pasa 20 minutos sin que Buyer lo lea
   └─> Cron detecta candidato (get_unread_chat_email_candidates)
   └─> Email enviado a Buyer
   └─> Estado guardado en rfx_chat_unread_email_state
   
3. Buyer abre el chat (marca como leído)
   └─> UPDATE en rfx_chat_read_status.last_read_at
   └─> TRIGGER: borra fila de rfx_chat_unread_email_state
   └─> ✅ Estado reseteado
   
4. Supplier envía OTRO mensaje
   └─> Pasa 20 minutos sin leer
   └─> ✅ Email enviado de nuevo (porque el estado se reseteó)
```

---

## 🔐 Componentes Técnicos

### Tabla: `rfx_chat_read_status`
- Registra cuándo cada usuario leyó por última vez cada chat
- Se actualiza automáticamente cuando el usuario abre el chat (componente `RFXSupplierChat`)

### Tabla: `rfx_chat_unread_email_state`
- Rastrea emails enviados (previene spam)
- **Se borra automáticamente** cuando el usuario lee el chat (trigger)

### Trigger: `trigger_reset_email_on_read`
- Se ejecuta en: `INSERT` o `UPDATE OF last_read_at` en `rfx_chat_read_status`
- Acción: `DELETE` de `rfx_chat_unread_email_state` para ese (user_id, rfx_id)

---

## 🧪 Testing del Flujo

### Escenario 1: Primer Email
```sql
-- 1. Verificar que hay mensajes sin leer > 20 min
SELECT * FROM public.get_unread_chat_email_candidates(20);

-- 2. Ejecutar cron (simular)
SELECT public.cron_run_chat_unread_email_notifier();

-- 3. Verificar que se registró el email
SELECT * FROM public.rfx_chat_unread_email_state
WHERE context = 'rfx_supplier_chat'
ORDER BY sent_at DESC;

-- Resultado esperado: 1 fila por cada candidato
```

### Escenario 2: Usuario Lee el Chat
```sql
-- Simular que el usuario lee el chat (esto lo hace el frontend automáticamente)
INSERT INTO public.rfx_chat_read_status (rfx_id, supplier_company_id, user_id, last_read_at)
VALUES (
  '5a04d0f5-38ab-42b1-ac66-2509c5b0915e', -- rfx_id
  '341e2052-8b9d-4558-a001-157dba6b1fa0', -- supplier_company_id
  '000fc6c2-34cd-4bec-b653-a8fc326ecafb', -- user_id
  now()
)
ON CONFLICT (rfx_id, supplier_company_id, user_id) 
DO UPDATE SET last_read_at = now();

-- Verificar que el trigger borró el estado de email
SELECT * FROM public.rfx_chat_unread_email_state
WHERE user_id = '000fc6c2-34cd-4bec-b653-a8fc326ecafb'
  AND rfx_id = '5a04d0f5-38ab-42b1-ac66-2509c5b0915e';

-- Resultado esperado: 0 filas (borrado por trigger)
```

### Escenario 3: Nuevos Mensajes → Nuevo Email
```sql
-- (Esperar a que haya nuevos mensajes sin leer > 20 min)

-- Ejecutar cron de nuevo
SELECT public.cron_run_chat_unread_email_notifier();

-- Verificar que se envió OTRO email
SELECT * FROM public.rfx_chat_unread_email_state
WHERE context = 'rfx_supplier_chat'
ORDER BY sent_at DESC;

-- Resultado esperado: Nueva fila con sent_at reciente
```

---

## 📊 Monitoring en Producción

### Ver logs del cron
```sql
SELECT 
  executed_at,
  status,
  error_message,
  EXTRACT(EPOCH FROM (now() - executed_at))/60 as minutes_ago
FROM public.cron_execution_log
ORDER BY executed_at DESC
LIMIT 20;
```

### Ver emails enviados (con reseteos)
```sql
SELECT 
  es.rfx_id,
  r.name as rfx_name,
  es.user_id,
  au.email,
  es.sent_at,
  es.unread_count_at_send,
  EXTRACT(EPOCH FROM (now() - es.sent_at))/60 as minutes_ago
FROM public.rfx_chat_unread_email_state es
JOIN auth.users au ON au.id = es.user_id
JOIN public.rfxs r ON r.id = es.rfx_id
WHERE context = 'rfx_supplier_chat'
ORDER BY es.sent_at DESC
LIMIT 20;
```

### Contar cuántos resets por usuario
```sql
-- Esta query requeriría una tabla de audit si quisieras tracking histórico
-- Por ahora, solo vemos el estado actual
SELECT 
  COUNT(*) as emails_pendientes,
  COUNT(DISTINCT user_id) as usuarios_con_emails_pendientes
FROM public.rfx_chat_unread_email_state
WHERE context = 'rfx_supplier_chat';
```

---

## ⚙️ Configuración

- **Frecuencia del cron**: Cada 30 minutos (`*/30 * * * *`)
- **Tiempo mínimo sin leer**: 20 minutos (configurable en `get_unread_chat_email_candidates(20)`)
- **Timeout HTTP**: 30 segundos
- **Anti-spam**: Un email por "sesión" de mensajes no leídos
- **Reducción de carga**: De 60 a 2 ejecuciones por hora (97% menos carga computacional)

---

## 🔧 Troubleshooting

### El email no se resetea al leer
**Causa**: El frontend no está actualizando `rfx_chat_read_status.last_read_at`

**Solución**: Verificar que `RFXSupplierChat.tsx` llama a `markAsRead()` correctamente:
```typescript
await supabase.from('rfx_chat_read_status').upsert({
  rfx_id: rfxId,
  supplier_company_id: companyId,
  user_id: currentUserId,
  last_read_at: new Date().toISOString(),
});
```

### Se envían múltiples emails sin leer
**Causa**: El trigger no está funcionando

**Solución**: Verificar que el trigger existe:
```sql
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trigger_reset_email_on_read';
```

---

## 📝 Notas

- El reseteo es **automático** cuando el usuario abre el chat (no requiere acción manual)
- El sistema **no** envía un email por cada mensaje individual, sino uno por "sesión" de mensajes no leídos
- Si el usuario nunca lee el chat, **solo recibirá un email** (no spam infinito)

