# Cybersecurity Audit - Control EKM-04

## Control Information

- **Control ID**: EKM-04
- **Control Name**: Encryption in Transit
- **Audit Date**: 2025-11-27
- **Client Question**: Is communication between client and server encrypted?

---

## Executive Summary

✅ **COMPLIANCE**: The platform exclusively uses TLS/HTTPS for all external client-server communications. All API endpoints, WebSocket connections, and third-party service integrations are configured to use encrypted transport protocols. No unencrypted HTTP or WS connections are used in production environments.

1. **Supabase API Communications** - All database and authentication communications use HTTPS through Supabase's managed infrastructure
2. **WebSocket Connections** - All WebSocket connections use WSS (WebSocket Secure) protocol for encrypted real-time communications
3. **Railway Agent Services** - All agent services hosted on Railway use TLS encryption by default
4. **Edge Functions** - Supabase Edge Functions are accessed via HTTPS endpoints
5. **Development vs Production** - Local development configurations are clearly separated from production, with production exclusively using encrypted protocols

---

## 1. Supabase API Communications

### 1.1. Supabase Client Configuration

The platform uses **Supabase** as the primary backend service, with all communications encrypted via HTTPS:

- **Production URL**: `https://fukzxedgbszcpakqkrjf.supabase.co` (HTTPS)
- **Client Library**: `@supabase/supabase-js` handles all API requests
- **Authentication**: JWT tokens transmitted over HTTPS
- **Database Queries**: All database operations use HTTPS REST API or encrypted Postgres connections

**Evidence**:
```typescript
// src/integrations/supabase/client.ts
const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fukzxedgbszcpakqkrjf.supabase.co';
const REMOTE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '...';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

### 1.2. Environment-Based Configuration

The client supports both local development and production environments, with clear separation:

- **Production**: Always uses HTTPS URLs
- **Local Development**: Uses localhost HTTP only when explicitly enabled via `VITE_USE_LOCAL_SUPABASE=true`
- **Default Behavior**: Production HTTPS is the default configuration

**Evidence**:
```typescript
// src/integrations/supabase/client.ts
const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';

const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fukzxedgbszcpakqkrjf.supabase.co';

const SUPABASE_URL = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
```

---

## 2. WebSocket Communications

### 2.1. RFX Agent WebSocket Connections

The RFX (Request for eXchange) agent uses **WSS (WebSocket Secure)** for all real-time communications:

- **Production Endpoint**: `wss://agente-main-dev-2.up.railway.app/ws-rfx-agent`
- **Protocol**: WSS (encrypted WebSocket)
- **Hosting**: Railway platform (provides TLS by default)
- **Usage**: Real-time chat and agent interactions for RFX management

**Evidence**:
```typescript
// src/components/rfx/RFXChatSidebar.tsx
const ws = new WebSocket('wss://agente-main-dev-2.up.railway.app/ws-rfx-agent');
//const ws = new WebSocket('ws://localhost:8000/ws-rfx-agent'); // Development only, commented out
```

### 2.2. RFX Candidate Analysis WebSocket

The RFX candidate analysis service uses WSS for secure communications:

- **Production Endpoint**: `wss://agente-main-dev-2.up.railway.app/ws-rfx`
- **Protocol**: WSS
- **Usage**: Candidate matching and proposal generation

**Evidence**:
```typescript
// src/components/rfx/CandidatesSection.tsx
const ws = new WebSocket('wss://agente-main-dev-2.up.railway.app/ws-rfx');
//const ws = new WebSocket('ws://localhost:8000/ws-rfx'); // Development only, commented out
```

### 2.3. Discovery Agent WebSocket

The Discovery Agent (formerly FQ Agent) uses WSS for chat communications:

- **Production Endpoints**: 
  - `wss://web-production-8e58.up.railway.app/ws`
  - `wss://agente-main-dev.up.railway.app/ws`
- **Protocol**: WSS
- **Usage**: General discovery and product search conversations

**Evidence**:
```typescript
// src/services/chatService.ts
let websocketUrl = 'wss://web-production-8e58.up.railway.app/ws';

// src/pages/FQAgent.tsx
if (import.meta.env.MODE === 'development') {
  url = 'ws://localhost:8000/ws'; // Development only
} else {
  url = 'wss://agente-main-dev.up.railway.app/ws';
  // or
  url = 'wss://web-production-8e58.up.railway.app/ws';
}
```

### 2.4. Product Scraper WebSocket

Product auto-fill and scraping services use WSS:

- **Production Endpoint**: `wss://productscrapermembers-production.up.railway.app/ws`
- **Protocol**: WSS
- **Usage**: Product information auto-fill and company data scraping

**Evidence**:
```typescript
// src/hooks/useProductAutoFill.tsx
const wsUrl = 'wss://productscrapermembers-production.up.railway.app/ws';
// const wsUrl = 'ws://localhost:3003/ws'; // Development only, commented out

// src/hooks/useCompanyAutoFill.ts
const wsUrl = 'wss://productscrapermembers-production.up.railway.app/ws';
```

### 2.5. Embedding Generation WebSocket

Embedding generation service uses WSS:

- **Production Endpoint**: `wss://web-production-9f433.up.railway.app/ws`
- **Protocol**: WSS
- **Usage**: Vector embedding generation for search functionality

**Evidence**:
```typescript
// src/hooks/useEmbeddingGeneration.ts
const ws = new WebSocket('wss://web-production-9f433.up.railway.app/ws');
```

---

## 3. Railway Platform TLS Configuration

### 3.1. Railway TLS Provision

All agent services are hosted on **Railway**, which provides TLS encryption by default:

- **Platform**: Railway.app
- **TLS**: Automatically provisioned and managed by Railway
- **Certificate Management**: Automatic certificate provisioning and renewal
- **HTTPS/WSS**: All endpoints accessible via HTTPS/WSS protocols

**Evidence**:
All Railway-hosted services use the `.up.railway.app` domain, which Railway automatically provisions with TLS certificates. All WebSocket connections use the `wss://` protocol prefix, indicating secure WebSocket connections.

### 3.2. Agent Service Endpoints

The following agent services are hosted on Railway with TLS:

1. **RFX Agent**: `wss://agente-main-dev-2.up.railway.app`
2. **Discovery Agent**: `wss://web-production-8e58.up.railway.app`
3. **Product Scraper**: `wss://productscrapermembers-production.up.railway.app`
4. **Embedding Service**: `wss://web-production-9f433.up.railway.app`

All endpoints use the `wss://` protocol, ensuring encrypted communications.

---

## 4. Supabase Edge Functions

### 4.1. Edge Function Endpoints

Supabase Edge Functions are accessed via HTTPS:

- **Base URL**: `https://[project-ref].supabase.co/functions/v1/`
- **Protocol**: HTTPS
- **Authentication**: JWT tokens transmitted over HTTPS
- **Usage**: Serverless functions for cryptographic operations, webhooks, and business logic

**Evidence**:
Edge Functions are invoked through the Supabase client library, which uses HTTPS for all communications. The platform includes several Edge Functions:

- `crypto-service`: Handles encryption/decryption operations
- `stripe-webhook`: Processes Stripe payment webhooks
- Other business logic functions

All function invocations go through Supabase's HTTPS infrastructure.

---

## 5. Development vs Production Configuration

### 5.1. Clear Separation

The codebase maintains clear separation between development and production configurations:

- **Production**: Exclusively uses HTTPS/WSS protocols
- **Development**: Localhost HTTP/WS connections are:
  - Only used when explicitly enabled via environment variables
  - Clearly commented in code
  - Not accessible in production builds

**Evidence**:
```typescript
// Development connections are commented out or conditionally enabled
//const ws = new WebSocket('ws://localhost:8000/ws-rfx-agent'); // Development only, commented out

// Production always uses WSS
const ws = new WebSocket('wss://agente-main-dev-2.up.railway.app/ws-rfx-agent');
```

### 5.2. Environment Variable Controls

Local development requires explicit configuration:

- `VITE_USE_LOCAL_SUPABASE=true`: Required to use local HTTP endpoints
- Default behavior: Production HTTPS endpoints
- No risk of accidental HTTP usage in production

---

## 6. Vite Development Server Configuration

### 6.1. Local Development Proxy

The Vite development server includes proxy configuration for local development:

- **Purpose**: Forward requests to local Supabase instance during development
- **Scope**: Only active in development mode
- **Production**: Not used in production builds

**Evidence**:
```typescript
// vite.config.ts
export default defineConfig(({ mode }: ConfigEnv) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/functions": {
        target: "http://localhost:5173",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:5173",
        changeOrigin: true,
      }
    }
  },
  // ...
}));
```

**Note**: This proxy configuration is only active during local development (`npm run dev`). Production builds do not include the Vite dev server, ensuring all production communications use HTTPS.

---

## 7. Conclusions

### 7.1. Strengths

✅ **Comprehensive TLS Coverage**: All external communications use TLS/HTTPS or WSS protocols
- Supabase API: HTTPS
- WebSocket connections: WSS
- Railway services: TLS-enabled
- Edge Functions: HTTPS

✅ **Clear Production Configuration**: Production environments exclusively use encrypted protocols with no fallback to HTTP/WS

✅ **Platform-Managed TLS**: Railway and Supabase provide automatic TLS certificate management, reducing configuration errors

✅ **Consistent Implementation**: All WebSocket connections consistently use WSS protocol across the application

✅ **Development Isolation**: Local development configurations are clearly separated and do not affect production security

### 7.2. Recommendations

1. **TLS Version Enforcement**: Consider explicitly enforcing TLS 1.2+ in client configurations if supported by the libraries (Supabase and WebSocket APIs handle this automatically)

2. **Certificate Pinning**: For enhanced security, consider implementing certificate pinning for critical agent services (requires careful implementation to avoid breaking changes)

3. **Security Headers**: Ensure Railway and Supabase configurations include appropriate security headers (HSTS, etc.) - verify these are configured at the platform level

4. **Monitoring**: Implement monitoring to detect any accidental HTTP/WS usage in production environments

5. **Documentation**: Document the TLS configuration requirements for any new services or integrations

---

## 8. Control Compliance

| Criterion | Status | Evidence |
|-----|-----|----|
| All client-server communications use TLS/HTTPS | ✅ COMPLIANT | Supabase client uses HTTPS, all WebSocket connections use WSS |
| No unencrypted HTTP endpoints in production | ✅ COMPLIANT | All production endpoints use HTTPS/WSS, localhost HTTP only in development |
| WebSocket connections use WSS | ✅ COMPLIANT | All WebSocket connections use `wss://` protocol |
| Third-party services use encrypted transport | ✅ COMPLIANT | Railway services use TLS, Supabase uses HTTPS |
| Development configurations do not affect production | ✅ COMPLIANT | Local development uses environment variables, production defaults to HTTPS |

**FINAL VERDICT**: ✅ **COMPLIANT** with control EKM-04. The platform exclusively uses TLS/HTTPS for all external client-server communications. All API endpoints, WebSocket connections, and third-party service integrations are configured to use encrypted transport protocols. No unencrypted HTTP or WS connections are used in production environments.

---

## Appendices

### A. WebSocket Connection Summary

| Service | Endpoint | Protocol | Hosting |
|-----|-----|-----|-----|
| RFX Agent Chat | `wss://agente-main-dev-2.up.railway.app/ws-rfx-agent` | WSS | Railway |
| RFX Candidate Analysis | `wss://agente-main-dev-2.up.railway.app/ws-rfx` | WSS | Railway |
| Discovery Agent | `wss://web-production-8e58.up.railway.app/ws` | WSS | Railway |
| Product Scraper | `wss://productscrapermembers-production.up.railway.app/ws` | WSS | Railway |
| Embedding Service | `wss://web-production-9f433.up.railway.app/ws` | WSS | Railway |

### B. API Endpoint Summary

| Service | Endpoint | Protocol | Hosting |
|-----|-----|-----|-----|
| Supabase API | `https://fukzxedgbszcpakqkrjf.supabase.co` | HTTPS | Supabase |
| Supabase Edge Functions | `https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/*` | HTTPS | Supabase |

### C. Railway TLS Information

Railway automatically provisions TLS certificates for all services deployed on the platform. Services using the `.up.railway.app` domain receive automatic TLS encryption. Railway handles:

- Certificate provisioning
- Certificate renewal
- TLS termination
- HTTPS/WSS protocol support

No additional configuration is required from the application side to enable TLS on Railway-hosted services.

---

**End of Audit Report - Control EKM-04**



