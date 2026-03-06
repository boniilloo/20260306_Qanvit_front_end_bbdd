# RFX Analysis UI Components

## Overview

Este documento describe los componentes de UI desarrollados para visualizar los resultados del análisis de propuestas RFX generado por el agente de IA.

## Estructura de Componentes

### 1. Hook: `useRFXAnalysisResult`

**Ubicación:** `src/hooks/useRFXAnalysisResult.ts`

**Propósito:** Hook personalizado que gestiona la obtención y suscripción en tiempo real de los resultados de análisis RFX.

**Características:**
- Obtiene el último job completado con resultados para un RFX específico
- Suscripción en tiempo real a cambios en `rfx_analysis_jobs`
- Manejo de estados de carga y errores
- Definición completa de tipos TypeScript para la estructura de análisis

**Uso:**
```typescript
const { analysisResult, loading, error, hasResults, refresh } = useRFXAnalysisResult(rfxId);
```

**Tipos principales:**
- `SupplierAnalysis`: Análisis completo de un proveedor
- `AnalysisResult`: Objeto que contiene array de `suppliers`
- `AnalysisJob`: Job de análisis con metadata

---

### 2. Componente Principal: `RFXAnalysisResults`

**Ubicación:** `src/components/rfx/analysis/RFXAnalysisResults.tsx`

**Propósito:** Componente orquestador que gestiona la visualización de resultados en dos modos de vista.

**Características:**
- Toggle entre "Per supplier view" y "Comparison matrix"
- Gestión de selección de proveedor
- Estados de carga, error y sin resultados
- Auto-selección del primer proveedor al cargar

**Props:**
```typescript
interface RFXAnalysisResultsProps {
  rfxId: string;
}
```

---

### 3. Vista por Proveedor (Per Supplier View)

Layout de 3 columnas:

#### 3.1. **SupplierProposalCard** (Columna Izquierda)

**Ubicación:** `src/components/rfx/analysis/SupplierProposalCard.tsx`

**Propósito:** Tarjeta compacta de proveedor en la lista lateral.

**Características:**
- Avatar con inicial del proveedor
- Porcentaje de match con código de color
- Indicador de selección con anillo azul
- Interacción hover y click

**Código de colores para match:**
- ≥85%: Verde (`#7de19a`)
- ≥70%: Azul claro (`#80c8f0`)
- ≥50%: Amarillo (`#f5d547`)
- <50%: Rojo (`#ff6b6b`)

---

#### 3.2. **ProposalView** (Columna Central)

**Ubicación:** `src/components/rfx/analysis/ProposalView.tsx`

**Propósito:** Vista detallada de la propuesta del proveedor seleccionado.

**Características:**
- Header con avatar, nombre y datos básicos
- Barra de progreso de status (Invited → NDA → Docs → Analyzing)
- Tabs: Summary, Technical, Commercial, Attachments

**Tab Summary incluye:**
- **Executive Summary (AI):**
  - Scope: Descripción del alcance
  - Risks: Lista de riesgos categorizados por severidad
  - Lead time: Tiempo de entrega
  - Botones: "Open original PDF" y "Ask Agent"

- **Quality of Proposal:**
  - Nota de calidad (letra grande: A, B, C, etc.)
  - Barras de progreso para:
    - Technical fit (score/10)
    - Risk & feasibility (score/10)
    - Usability & accessibility (hardcoded demo)
  - Comentario AI del overall quality

---

#### 3.3. Columna Derecha - 3 Tarjetas

##### **MatchWithRFXSpecs**

**Ubicación:** `src/components/rfx/analysis/MatchWithRFXSpecs.tsx`

**Características:**
- Gráfico circular SVG con porcentaje de match overall
- Código de color dinámico basado en porcentaje
- Métricas desglosadas:
  - Must-haves coverage %
  - Must-haves (duplicado en demo - revisar)
  - Nice-to-haves coverage %

---

##### **GapsAndHighlights**

**Ubicación:** `src/components/rfx/analysis/GapsAndHighlights.tsx`

**Características:**
- Lista de **Gaps** (rojos) con ícono AlertCircle
- Lista de **Highlights** (verdes) con ícono CheckCircle
- Estado vacío si no hay gaps ni highlights

---

##### **QuestionsToSupplier**

**Ubicación:** `src/components/rfx/analysis/QuestionsToSupplier.tsx`

**Características:**
- Preguntas agrupadas por tema automáticamente usando heurísticas de keywords
- Temas disponibles:
  - Technical fit
  - Commercial & Pricing
  - Schedule & Lead time
  - Quality & Compliance
  - Documentation & Training
  - Warranty & Support
  - Other
- Collapsibles por tema
- Botón "Review & send" al final
- Scroll interno si hay muchas preguntas

---

### 4. Vista de Comparación: `SupplierComparisonMatrix`

**Ubicación:** `src/components/rfx/analysis/SupplierComparisonMatrix.tsx`

**Propósito:** Tabla comparativa de múltiples proveedores lado a lado.

**Características:**
- Proveedores ordenados automáticamente por % de match (mayor a menor)
- Click en nombre de columna para cambiar a vista individual de ese proveedor
- Filas comparativas:

| Métrica | Descripción |
|---------|-------------|
| **Match %** | Gráfico circular pequeño con porcentaje |
| **Quality grade** | Letra grande con color (A, B, C, etc.) |
| **Total price / TCO** | Precio con moneda formateado |
| **Lead time** | Texto de lead time |
| **Main risks** | Riesgos principales con ícono warning si existen |

**Action Bar:**
- Shortlist supplier
- Reject supplier
- Move to Negotiate
- Send to Decision stage

**Bottom Actions:**
- Toggle "Show only shortlisted"
- Botón "Generate recommendation summary"

---

## Integración en RFXResponsesPage

**Ubicación:** `src/pages/RFXResponsesPage.tsx`

En el tab "Analysis":
1. Botón "Analyze" en el header (crea job de análisis)
2. Componente `<RFXAnalysisResults rfxId={rfxId} />`

---

## Flujo de Uso

1. **Usuario hace click en "Analyze":**
   - Se genera PDF de RFX specs
   - Se cifra el PDF con clave simétrica del RFX
   - Se sube a Supabase Storage
   - Se crea job en `rfx_analysis_jobs` con status "to do"
   - Se envía al agente via WebSocket

2. **Agente procesa (backend):**
   - Recibe WebSocket con RFX ID y clave simétrica
   - Descarga y descifra el PDF
   - Descarga propuestas de proveedores
   - Analiza con OpenAI
   - Guarda resultado en `rfx_analysis_jobs.analysis_result`
   - Actualiza status a "completed"

3. **Frontend detecta cambios:**
   - `useRFXAnalysisResult` se suscribe a cambios en tiempo real
   - Al detectar job completado, muestra resultados automáticamente
   - Usuario puede alternar entre vista individual y matriz de comparación

---

## Colores de la Plataforma

Según las reglas del workspace:
- **Azul oscuro:** `#1A1F2C`
- **Azul claro:** `#80c8f0`
- **Gris:** `#f1f1f1`
- **Verde:** `#7de19a`

---

## Próximas Mejoras

### Funcionalidad pendiente:
- [ ] Botón "Open original PDF" debe abrir el PDF de la propuesta del proveedor
- [ ] Botón "Ask Agent" debe abrir chat con contexto del proveedor
- [ ] Action Bar en matriz de comparación (shortlist, reject, move to negotiate, etc.)
- [ ] Toggle "Show only shortlisted" funcional
- [ ] "Generate recommendation summary" debe generar resumen ejecutivo
- [ ] Tabs Technical, Commercial y Attachments en ProposalView
- [ ] Duplicado en métricas de MatchWithRFXSpecs (hay dos "Must-haves")

### UI/UX:
- [ ] Animaciones de transición entre proveedores
- [ ] Loading skeleton en lugar de spinner genérico
- [ ] Indicadores visuales de proveedores shortlisted
- [ ] Export a PDF/Excel de matriz de comparación
- [ ] Filtros adicionales (por match %, por quality grade, etc.)

---

## Notas Técnicas

### Tipo de Datos en Base de Datos

La columna `rfx_analysis_jobs.analysis_result` es de tipo `JSONB` y contiene:

```json
{
  "suppliers": [
    {
      "supplier_name": "string",
      "fit_to_rfx": {
        "gaps": ["string"],
        "highlights": ["string"],
        "match_comment": "string",
        "match_percentage_overall": number,
        "must_have_coverage_percentage": number,
        "nice_to_have_coverage_percentage": number
      },
      "executive_summary": {
        "scope": "string",
        "lead_time": {
          "text": "string",
          "min_weeks": number | null,
          "max_weeks": number | null
        },
        "risks": [
          {
            "category": "technical" | "schedule" | "cost" | "operational" | "commercial",
            "severity": "low" | "medium" | "high" | "critical",
            "description": "string"
          }
        ]
      },
      "commercial_summary": {
        "currency": "string" | null,
        "total_price_main": number | null,
        "total_price_with_taxes": number | null,
        "tco_comment": "string"
      },
      "quality_of_proposal": {
        "letter_grade": "string",
        "overall_comment": "string",
        "technical_explanation_score_0_to_10": {
          "score": number,
          "comment": "string"
        },
        "risk_and_mitigation_score_0_to_10": {
          "score": number,
          "comment": "string"
        }
      },
      "table_view_summary": {
        "match_percentage": number,
        "quality_grade_letter": "string",
        "total_price_for_table": number | null,
        "currency": "string" | null,
        "lead_time_text_for_table": "string",
        "main_risks_short": "string"
      },
      "questions_to_supplier": ["string"]
    }
  ]
}
```

### Suscripción en Tiempo Real

El hook `useRFXAnalysisResult` utiliza Supabase Realtime para detectar cambios:

```typescript
supabase
  .channel(`rfx_analysis_jobs:${rfxId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'rfx_analysis_jobs',
    filter: `rfx_id=eq.${rfxId}`
  }, (payload) => {
    fetchLatestAnalysis();
  })
  .subscribe();
```

Esto permite que los resultados aparezcan automáticamente cuando el agente complete el análisis, sin necesidad de refrescar la página.

---

## Testing

Para testear los componentes:

1. **Backend debe estar corriendo:**
   - Agente RFX en `localhost:8000` o Railway
   - WebSocket `/ws-rfx-analysis` disponible

2. **Crear job de análisis:**
   - Ir a página RFX Responses (`/rfxs/responses/:rfxId`)
   - Tab "Analysis"
   - Click "Analyze"
   - Verificar en consola los logs de progreso

3. **Verificar resultados:**
   - Los resultados deben aparecer automáticamente al completarse
   - Verificar ambos modos de vista (per-supplier y comparison)
   - Verificar que los porcentajes, grades y colores se muestren correctamente

---

## Troubleshooting

### Los resultados no aparecen

1. Verificar que el job se creó correctamente en la base de datos
2. Verificar logs del agente backend
3. Verificar que `analysis_result` no sea null en la tabla
4. Verificar que el status sea "completed"

### Error de tipos TypeScript

1. Verificar que la estructura JSON en la DB coincida con los tipos en `useRFXAnalysisResult.ts`
2. Los tipos son estrictos y deben coincidir exactamente con la respuesta del agente

### Real-time no funciona

1. Verificar que Supabase Realtime esté habilitado en el proyecto
2. Verificar permisos RLS en la tabla `rfx_analysis_jobs`
3. Verificar que el canal se suscriba correctamente (logs en consola)

---

**Autor:** Sistema de análisis RFX  
**Fecha:** Diciembre 2025  
**Versión:** 1.0

