# Guía de Integración de Stripe - Gestión Completa de Suscripciones

## 📋 Resumen de la Implementación

Se ha implementado un sistema completo de gestión de suscripciones con Stripe que incluye:

- ✅ Creación de suscripciones con descuentos
- ✅ Gestión completa del ciclo de vida de suscripciones
- ✅ Manejo de fallos de pago y reintentos
- ✅ Descarga de facturas
- ✅ Cancelación y reactivación de suscripciones
- ✅ Actualización de métodos de pago
- ✅ Registro de eventos para auditoría

## 🗄️ Estructura de Base de Datos

### Tabla: `stripe_customers`
Almacena información del cliente y su suscripción:
- `subscription_id`: ID de la suscripción en Stripe
- `subscription_status`: Estado actual (active, past_due, canceled, etc.)
- `current_period_start`: Inicio del período actual
- `current_period_end`: Fin del período actual (próxima renovación)
- `cancel_at_period_end`: Si la suscripción se cancelará al final del período
- `canceled_at`: Fecha de cancelación
- `trial_end`: Fin del período de prueba (si aplica)

### Tabla: `stripe_payment_history`
Registro de todos los pagos:
- `stripe_invoice_id`: ID de la factura
- `stripe_payment_intent_id`: ID del payment intent
- `amount`: Monto pagado
- `status`: Estado del pago
- `description`: Descripción del pago
- `payment_date`: Fecha del pago

### Tabla: `stripe_payment_failures`
Registro de fallos de pago:
- `stripe_invoice_id`: ID de la factura fallida
- `failure_code`: Código del error
- `failure_message`: Mensaje del error
- `attempt_count`: Número de intentos
- `next_payment_attempt`: Próximo intento programado
- `resolved`: Si el fallo fue resuelto

### Tabla: `stripe_subscription_events`
Auditoría de eventos de suscripción:
- `subscription_id`: ID de la suscripción
- `event_type`: Tipo de evento
- `event_data`: Datos del evento (JSONB)

## 🔧 Edge Functions

### 1. `create-subscription`
**Propósito:** Crear una nueva suscripción con descuento del 75%

**Endpoint:** `https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/create-subscription`

**Método:** POST

**Body:**
```json
{
  "userId": "uuid",
  "companyId": "uuid",
  "email": "user@example.com",
  "companyName": "Nombre de la Empresa",
  "successUrl": "https://fqsource.com/subscription/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://fqsource.com/subscription/cancel"
}
```

**Respuesta:**
```json
{
  "url": "https://checkout.stripe.com/pay/cs_..."
}
```

---

### 2. `manage-subscription`
**Propósito:** Ver información de suscripción y redirigir al Billing Portal de Stripe

**Endpoint:** `https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/manage-subscription`

**Método:** POST

**Autenticación:** Requiere token de Supabase Auth

**Filosofía:** Esta función SOLO lee datos y redirige al portal de Stripe. Todas las modificaciones (cancelar, cambiar tarjeta, etc.) se hacen en el Billing Portal de Stripe.

#### Acciones Disponibles:

##### a) Obtener información de la suscripción
```json
{
  "action": "get_info",
  "companyId": "uuid",
  "userId": "uuid"
}
```

**Respuesta:**
```json
{
  "status": "active",
  "subscription_status": "active",
  "current_period_end": "2025-12-05T00:00:00Z",
  "current_period_start": "2025-11-05T00:00:00Z",
  "cancel_at_period_end": false,
  "canceled_at": null,
  "stripe_subscription": {
    "id": "sub_...",
    "status": "active",
    "current_period_start": "2025-11-05T00:00:00Z",
    "current_period_end": "2025-12-05T00:00:00Z",
    "cancel_at_period_end": false,
    "items": [
      {
        "price_id": "price_...",
        "amount": 200000,
        "currency": "eur",
        "interval": "year"
      }
    ]
  },
  "payment_method": {
    "type": "card",
    "card": {
      "brand": "visa",
      "last4": "4242",
      "exp_month": 12,
      "exp_year": 2026
    }
  },
  "latest_invoice": {
    "id": "in_...",
    "amount_paid": 50000,
    "status": "paid",
    "invoice_pdf": "https://...",
    "hosted_invoice_url": "https://..."
  },
  "payment_failures": []
}
```

##### b) Abrir Billing Portal (para gestionar suscripción)
```json
{
  "action": "open_billing_portal",
  "companyId": "uuid",
  "userId": "uuid"
}
```

**Respuesta:**
```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

**En el Billing Portal el usuario puede:**
- ✅ Cancelar suscripción
- ✅ Reactivar suscripción cancelada
- ✅ Actualizar método de pago
- ✅ Ver todas las facturas
- ✅ Descargar facturas en PDF
- ✅ Actualizar dirección de facturación

##### c) Listar facturas
```json
{
  "action": "list_invoices",
  "companyId": "uuid",
  "userId": "uuid"
}
```

**Respuesta:**
```json
{
  "invoices": [
    {
      "id": "in_...",
      "number": "FAC-0001",
      "amount_paid": 50000,
      "currency": "eur",
      "status": "paid",
      "created": "2025-11-05T14:16:00Z",
      "invoice_pdf": "https://...",
      "hosted_invoice_url": "https://...",
      "description": "Subscription",
      "lines": [...]
    }
  ]
}
```

##### d) Descargar factura
```json
{
  "action": "download_invoice",
  "companyId": "uuid",
  "userId": "uuid",
  "invoiceId": "in_..."
}
```

**Respuesta:**
```json
{
  "invoice_pdf": "https://pay.stripe.com/invoice/.../pdf",
  "hosted_invoice_url": "https://invoice.stripe.com/i/...",
  "invoice_number": "FAC-0001",
  "amount": 50000,
  "currency": "eur",
  "status": "paid"
}
```

---

### 3. `billing-webhook`
**Propósito:** Recibir y procesar eventos de Stripe (checkout, suscripciones, etc.)

**Endpoint:** `https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/billing-webhook`

**Autenticación:** Verificación de firma de Stripe (no requiere JWT)

## 🔔 Eventos de Stripe a Configurar

### Eventos Obligatorios

Debes configurar estos eventos en tu webhook de Stripe:

1. **Pagos y Facturas:**
   - `checkout.session.completed` - Cuando se completa el checkout
   - `invoice.paid` - Cuando se paga una factura
   - `invoice.payment_failed` - Cuando falla un pago
   - `invoice.payment_action_required` - Cuando se requiere acción (3D Secure)

2. **Suscripciones:**
   - `customer.subscription.created` - Nueva suscripción
   - `customer.subscription.updated` - Suscripción actualizada
   - `customer.subscription.deleted` - Suscripción cancelada/eliminada
   - `customer.subscription.trial_will_end` - Aviso de fin de prueba

3. **Pagos:**
   - `payment_intent.succeeded` - Pago exitoso
   - `payment_method.attached` - Método de pago añadido

4. **Schedules (si usas fases):**
   - `subscription_schedule.updated`
   - `subscription_schedule.released`
   - `subscription_schedule.canceled`

### Cómo Configurar los Eventos

1. Ve a: https://dashboard.stripe.com/webhooks
2. Selecciona tu webhook existente o crea uno nuevo
3. URL del webhook: `https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/billing-webhook`
4. Haz clic en "Add events"
5. Selecciona todos los eventos listados arriba
6. Guarda los cambios

## 🎯 Casos de Uso Implementados

### 1. ✅ Crear Suscripción
Usuario hace checkout → Se crea suscripción → Se guarda en BD

### 2. ✅ Pago Exitoso
Stripe procesa pago → Webhook recibe `invoice.paid` → Se registra en `stripe_payment_history` → Estado = "active"

### 3. ✅ Fallo de Pago
Pago rechazado → Webhook recibe `invoice.payment_failed` → Se registra en `stripe_payment_failures` → Estado = "past_due" → Usuario puede ver el error y reintentar

### 4. ✅ Cancelar Suscripción
Usuario cancela → API `manage-subscription` con action="cancel" → Se marca `cancel_at_period_end` → Sigue activa hasta fin de período

### 5. ✅ Reactivar Suscripción
Usuario reactiva antes del fin → API con action="reactivate" → Se desmarca `cancel_at_period_end`

### 6. ✅ Ver Próxima Renovación
API con action="get_info" → Retorna `current_period_end` (fecha de próxima renovación)

### 7. ✅ Descargar Facturas
API con action="list_invoices" → Lista todas las facturas → Usuario selecciona → action="download_invoice" → PDF de Stripe

### 8. ✅ Actualizar Tarjeta
API con action="update_payment_method" → Redirige al Billing Portal de Stripe → Usuario actualiza → Webhook recibe `payment_method.attached`

### 9. ✅ Detectar Problemas de Pago
Webhook recibe `invoice.payment_failed` → Registra en `stripe_payment_failures` → Frontend puede mostrar alerta al usuario

### 10. ✅ Auditoría Completa
Todos los eventos se registran en `stripe_subscription_events` → Historial completo de la suscripción

## 🔐 Variables de Entorno Requeridas

Configura estas variables en Supabase (Settings → Edge Functions → Secrets):

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ANNUAL_ID=price_...
FRONTEND_BASE_URL=https://fqsource.com
FRONTEND_ALLOWED_ORIGINS=https://fqsource.com,https://www.fqsource.com
```

## 📊 Flujo Completo de Suscripción

```
1. Usuario → crea suscripción (create-subscription)
   ↓
2. Stripe Checkout → usuario completa pago
   ↓
3. Webhook recibe checkout.session.completed
   ↓
4. Se guarda subscription_id, billing_info
   ↓
5. Webhook recibe invoice.paid
   ↓
6. Se registra pago en stripe_payment_history
   ↓
7. Estado = "active", subscription_status = "active"
   ↓
8. Usuario puede:
   - Ver info (get_info)
   - Descargar facturas (list_invoices, download_invoice)
   - Cancelar (cancel)
   - Actualizar tarjeta (update_payment_method)
   ↓
9. Cada evento → registrado en stripe_subscription_events
   ↓
10. Renovación automática → invoice.paid → nuevo pago registrado
```

## 🚨 Manejo de Errores

### Pago Fallido
1. Webhook recibe `invoice.payment_failed`
2. Se registra en `stripe_payment_failures`
3. Estado cambia a "past_due"
4. Frontend muestra alerta
5. Usuario puede:
   - Actualizar método de pago
   - Stripe reintenta automáticamente
6. Si pago exitoso → `invoice.paid` → marca fallo como resuelto

### Suscripción Cancelada
1. Usuario cancela o pago falla múltiples veces
2. Webhook recibe `customer.subscription.deleted`
3. Estado cambia a "canceled"
4. `canceled_at` registra la fecha
5. Usuario pierde acceso

## 🧪 Testing

### Tarjetas de Prueba de Stripe

```
Pago exitoso:
4242 4242 4242 4242

Requiere autenticación (3D Secure):
4000 0025 0000 3155

Pago rechazado:
4000 0000 0000 0002

Fondos insuficientes:
4000 0000 0000 9995
```

## 📱 Ejemplo de Implementación en Frontend

```typescript
// 1. Crear suscripción (nueva)
const createSubscription = async () => {
  const { data, error } = await supabase.functions.invoke('create-subscription', {
    body: {
      userId: user.id,
      companyId: company.id,
      email: user.email,
      companyName: company.name,
    }
  });
  
  if (data?.url) {
    window.location.href = data.url; // Redirigir a Stripe Checkout
  }
};

// 2. Obtener info de suscripción (para mostrar en tu web)
const getSubscriptionInfo = async () => {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: {
      action: 'get_info',
      userId: user.id,
      companyId: company.id,
    }
  });
  
  return data;
};

// 3. Abrir Billing Portal (para cancelar, actualizar tarjeta, etc.)
const openBillingPortal = async () => {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: {
      action: 'open_billing_portal',
      userId: user.id,
      companyId: company.id,
    }
  });
  
  if (data?.url) {
    window.location.href = data.url; // Redirigir al Billing Portal de Stripe
  }
};

// 4. Listar facturas (para mostrar historial)
const listInvoices = async () => {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: {
      action: 'list_invoices',
      userId: user.id,
      companyId: company.id,
    }
  });
  
  return data?.invoices || [];
};

// 5. Descargar factura específica
const downloadInvoice = async (invoiceId: string) => {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: {
      action: 'download_invoice',
      userId: user.id,
      companyId: company.id,
      invoiceId: invoiceId,
    }
  });
  
  if (data?.invoice_pdf) {
    window.open(data.invoice_pdf, '_blank'); // Abrir PDF en nueva pestaña
  }
};
```

### Componente React Completo

Ver el archivo `SUBSCRIPTION_COMPONENT_EXAMPLE.tsx` para un componente React completo listo para usar que incluye:
- ✅ Visualización del estado de la suscripción
- ✅ Botón "Manage Subscription" 
- ✅ Alertas de fallos de pago
- ✅ Información de próxima renovación
- ✅ Detalles del método de pago

## 📞 Soporte

Para más información sobre la API de Stripe:
- Documentación: https://stripe.com/docs
- Dashboard: https://dashboard.stripe.com
- Webhooks: https://dashboard.stripe.com/webhooks

---

**Fecha de creación:** 2025-11-05
**Versión:** 1.0.0

