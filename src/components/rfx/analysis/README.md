# RFX Analysis Components

This directory contains all UI components for displaying RFX supplier proposal analysis results.

## Components Overview

### Main Component

- **`RFXAnalysisResults.tsx`** - Main orchestrator component with view mode toggle

### Per Supplier View Components

- **`SupplierProposalCard.tsx`** - Compact supplier card for left sidebar list
- **`ProposalView.tsx`** - Detailed proposal view with tabs (center column)
- **`MatchWithRFXSpecs.tsx`** - Circular match percentage chart (right sidebar)
- **`GapsAndHighlights.tsx`** - AI-generated gaps and highlights list (right sidebar)
- **`QuestionsToSupplier.tsx`** - Suggested questions grouped by theme (right sidebar)

### Comparison View Components

- **`SupplierComparisonMatrix.tsx`** - Multi-supplier comparison table

## Usage

```typescript
import RFXAnalysisResults from '@/components/rfx/analysis/RFXAnalysisResults';

// In your page/component
<RFXAnalysisResults rfxId={rfxId} />
```

## Data Flow

1. `RFXAnalysisResults` uses `useRFXAnalysisResult` hook
2. Hook fetches latest completed job from `rfx_analysis_jobs` table
3. Results are displayed in either "per-supplier" or "comparison" view
4. Real-time subscription updates results automatically when job completes

## Layout Structure

### Per Supplier View (3 columns)
```
┌─────────────┬──────────────────────┬─────────────────┐
│  Supplier   │                      │  Match Chart    │
│  List       │   Proposal Details   │  Gaps/Highlights│
│  (Cards)    │   (Tabs: Summary,    │  Questions      │
│             │    Technical, etc.)  │                 │
└─────────────┴──────────────────────┴─────────────────┘
   col-span-3        col-span-6          col-span-3
```

### Comparison View (Full width)
```
┌─────────────────────────────────────────────────────┐
│  Multi-supplier Comparison Matrix                   │
│  ┌────────────┬──────────┬──────────┬──────────┐   │
│  │ Metric     │ Supplier │ Supplier │ Supplier │   │
│  ├────────────┼──────────┼──────────┼──────────┤   │
│  │ Match %    │   87%    │   65%    │   92%    │   │
│  │ Grade      │    A-    │   B+     │    A     │   │
│  │ Price      │ $150k    │ $145k    │ $180k    │   │
│  │ Lead time  │ 6 weeks  │ 8 weeks  │ 5 weeks  │   │
│  │ Risks      │ ISO cert │ Finance  │ None     │   │
│  └────────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────────┘
```

## Color Scheme

Match percentage colors:
- **Green** (`#7de19a`): ≥85%
- **Blue** (`#80c8f0`): ≥70%
- **Yellow** (`#f5d547`): ≥50%
- **Red** (`#ff6b6b`): <50%

Quality grade colors:
- **Green** (`#7de19a`): A, A+, A-
- **Yellow** (`#f5d547`): B, B+, B-
- **Orange** (`#ff9f43`): C, C+, C-
- **Red** (`#ff6b6b`): D and below

## See Also

- Full documentation: `/docs/RFX_ANALYSIS_UI_COMPONENTS.md`
- Hook documentation: `useRFXAnalysisResult` in `/src/hooks/useRFXAnalysisResult.ts`
- Backend agent: `/docs/RFX_ANALYSIS_AGENT_CONFIGURATION.md`

