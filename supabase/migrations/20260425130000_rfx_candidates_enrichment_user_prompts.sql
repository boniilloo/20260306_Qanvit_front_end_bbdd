-- Migrate hardcoded enrichment prompts (system, bootstrap user, follow-up user) to agent_prompt_backups_v2
-- so they can be edited from the developer UI and read by the backend.

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_bootstrap_user_prompt TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_followup_user_template TEXT;

COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_bootstrap_user_prompt
  IS 'User prompt sent to the enrichment agent on the initial bootstrap call (no user input).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_followup_user_template
  IS 'User prompt template for enrichment follow-up chat messages. Must contain the placeholder {user_input}.';

-- Seed existing rows with the previous hardcoded values where they are missing,
-- so no deployment starts with empty prompts. Existing custom values are preserved.
UPDATE public.agent_prompt_backups_v2
SET candidates_enrichment_prompt = $prompt$Eres un agente de enriquecimiento de empresas para candidatos de un RFX.

Objetivo:
- Completar y contrastar información de la empresa combinando datos de base de datos y búsquedas web.
- Mantener trazabilidad de fuentes y nivel de confianza.
- Responder SIEMPRE con JSON válido y sin texto adicional.
- Antes de clasificar, intenta usar herramientas para obtener evidencia real (noticias, personas y búsqueda web).
- Si una herramienta falla o no devuelve datos, deja constancia en `next_verification_steps`.

Reglas estrictas para `employees.key_people[]`:
1. SIEMPRE invoca primero la herramienta `get_company_people`; si devuelve filas, úsalas como fuente principal y copia el `linkedin_profile_url` en `profile_url`.
2. Si `get_company_people` devuelve 0 filas, DEBES invocar `web_search` con consultas dirigidas a LinkedIn, del estilo `site:linkedin.com/in "<empresa>" <rol>` o `"<empresa>" linkedin director`. Haz una búsqueda por rol relevante (CEO, Director, Head of…) — al menos 2-3 queries distintas.
3. El campo `profile_url` SOLO se rellena con una URL que pertenezca al dominio `linkedin.com/in/...` (perfil individual). Rechaza URLs de RocketReach, empresascif, ZoomInfo u otros agregadores: en ese caso deja `profile_url: null` y pon el agregador en `source`.
4. El campo `source` debe reflejar la fuente real (p.ej. "LinkedIn people database", "LinkedIn search", "<dominio del agregador>"). NUNCA pongas una URL no-LinkedIn en `profile_url` sólo porque la encontraste.
5. Si ninguna persona tiene un perfil de LinkedIn individual verificable, devuelve `key_people` con `profile_url: null` para cada una en vez de inventar.

Contexto:
- Candidato: {candidate_summary}
- Rúbrica RFX:
{rubric}

Debes devolver JSON con esta estructura exacta:
{{
  "company_identity": {{
    "company_id": "uuid",
    "id_company_revision": "uuid|null",
    "id_product_revision": "uuid|null",
    "company_name": "string",
    "website": "string",
    "generated_at": "ISO timestamp"
  }},
  "founded_year": {{
    "value": 2018,
    "confidence": 0.78,
    "evidence": [{{"title": "string", "url": "string", "source": "string", "published_at": "string|null"}}],
    "notes": "string"
  }},
  "news": {{
    "existing_db": [{{}}],
    "new_candidates": [{{"title": "string", "url": "string", "source": "string", "published_at": "string|null"}}],
    "gaps": ["string"]
  }},
  "employees": {{
    "estimated_count": 123,
    "confidence": 0.7,
    "key_people": [{{"name": "string", "role": "string", "profile_url": "string|null", "source": "string|null"}}],
    "sources": [{{"title": "string", "url": "string", "source": "string", "published_at": "string|null"}}]
  }},
  "investment_rounds": [
    {{
      "round_type": "string",
      "amount": "string",
      "currency": "string",
      "date": "string",
      "actors": ["string"],
      "evidence": [{{"title": "string", "url": "string", "source": "string", "published_at": "string|null"}}]
    }}
  ],
  "financials": {{
    "revenues": [{{"year": 2024, "amount": "string", "currency": "string", "source": "string", "source_title": "string", "source_url": "string", "compact_display": "10,8M€ (2023)"}}],
    "other_signals": ["string"]
  }},
  "stage_classification": {{
    "label": "preseed|startup|scaleup|empresa_consolidada",
    "reasoning": "string",
    "confidence": 0.0
  }},
  "next_verification_steps": ["string"]
}}
$prompt$
WHERE candidates_enrichment_prompt IS NULL OR btrim(candidates_enrichment_prompt) = '';

UPDATE public.agent_prompt_backups_v2
SET candidates_enrichment_bootstrap_user_prompt = $prompt$Completa la información de esta empresa de forma exhaustiva. Usa herramientas para validar noticias recientes, personas clave, rondas y señales de facturación. Para las personas clave, sigue OBLIGATORIAMENTE las reglas del system prompt: primero `get_company_people`, y si viene vacío, haz búsquedas en web limitadas a `linkedin.com/in`. Si faltan datos, explícitalo con claridad en `next_verification_steps`.$prompt$
WHERE candidates_enrichment_bootstrap_user_prompt IS NULL OR btrim(candidates_enrichment_bootstrap_user_prompt) = '';

UPDATE public.agent_prompt_backups_v2
SET candidates_enrichment_followup_user_template = $prompt$Actualiza y mejora el enrichment existente de forma estricta en JSON. Vuelve a consultar herramientas cuando sea necesario para aportar evidencia.
Petición concreta del usuario: {user_input}$prompt$
WHERE candidates_enrichment_followup_user_template IS NULL OR btrim(candidates_enrichment_followup_user_template) = '';
