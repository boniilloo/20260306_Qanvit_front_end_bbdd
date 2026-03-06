# Configuración del Agente de Análisis de RFX

Este documento describe cómo el agente del endpoint WebSocket `ws-rfx-analysis` debe leer su configuración desde la base de datos.

## Campos de Configuración

El agente de análisis de RFX utiliza los siguientes campos de configuración almacenados en la tabla `agent_prompt_backups_v2`:

- **`rfx_analysis_system_prompt`**: Prompt del sistema para el análisis de RFX
- **`rfx_analysis_user_prompt`**: Template del prompt de usuario para el análisis de RFX
- **`rfx_analysis_model`**: Modelo de IA a utilizar (ej: `gpt-5-2025-08-07`, `gpt-4o`)
- **`rfx_analysis_verbosity`**: Nivel de verbosidad (`low`, `medium`, `high`)
- **`rfx_analysis_reasoning_effort`**: Esfuerzo de razonamiento (`minimal`, `low`, `medium`, `high`)

## Consulta SQL

Para obtener la configuración activa del agente, el agente debe consultar la tabla `agent_prompt_backups_v2` filtrando por `is_active = true`:

```sql
SELECT 
  rfx_analysis_system_prompt,
  rfx_analysis_user_prompt,
  rfx_analysis_model,
  rfx_analysis_verbosity,
  rfx_analysis_reasoning_effort
FROM agent_prompt_backups_v2
WHERE is_active = true
LIMIT 1;
```

## Código Python de Ejemplo

```python
async def get_rfx_analysis_config(supabase_client):
    """
    Obtiene la configuración activa del agente de análisis de RFX.
    
    Args:
        supabase_client: Cliente de Supabase con permisos de service_role
    
    Returns:
        dict: Diccionario con la configuración del agente
    """
    response = supabase_client.table('agent_prompt_backups_v2') \
        .select('rfx_analysis_system_prompt, rfx_analysis_user_prompt, rfx_analysis_model, rfx_analysis_verbosity, rfx_analysis_reasoning_effort') \
        .eq('is_active', True) \
        .limit(1) \
        .execute()
    
    if not response.data or len(response.data) == 0:
        # Valores por defecto si no hay configuración activa
        return {
            'rfx_analysis_system_prompt': None,
            'rfx_analysis_user_prompt': None,
            'rfx_analysis_model': 'gpt-5-2025-08-07',
            'rfx_analysis_verbosity': 'medium',
            'rfx_analysis_reasoning_effort': 'medium'
        }
    
    config = response.data[0]
    
    # Aplicar valores por defecto si algún campo es None
    return {
        'rfx_analysis_system_prompt': config.get('rfx_analysis_system_prompt'),
        'rfx_analysis_user_prompt': config.get('rfx_analysis_user_prompt'),
        'rfx_analysis_model': config.get('rfx_analysis_model') or 'gpt-5-2025-08-07',
        'rfx_analysis_verbosity': config.get('rfx_analysis_verbosity') or 'medium',
        'rfx_analysis_reasoning_effort': config.get('rfx_analysis_reasoning_effort') or 'medium'
    }
```

## Uso en el Flujo del Agente

El agente debe leer esta configuración al inicio del procesamiento de cada RFX:

```python
async def process_rfx_analysis(message: dict):
    """
    Procesa el análisis de una RFX recibida por WebSocket.
    
    Args:
    message: {
            "rfx_id": "uuid",
            "symmetric_key": "<base64_aes_256_key>"
        }
    """
    rfx_id = message['rfx_id']
    symmetric_key = message['symmetric_key']
    
    try:
        # 1. Obtener configuración del agente
        agent_config = await get_rfx_analysis_config(supabase_client)
        
        print(f"📋 [RFX Analysis] Using model: {agent_config['rfx_analysis_model']}")
        print(f"📋 [RFX Analysis] Verbosity: {agent_config['rfx_analysis_verbosity']}")
        print(f"📋 [RFX Analysis] Reasoning effort: {agent_config['rfx_analysis_reasoning_effort']}")
        
        # 2. Obtener la clave simétrica de la RFX
        # La clave ya viene en el payload inicial (base64)
        symmetric_key_base64 = message['symmetric_key']
        
        # 3. Obtener todas las empresas asociadas
        companies = await get_rfx_companies(rfx_id, supabase_client)
        
        # 4. Descargar todos los documentos
        documents = await download_supplier_documents(rfx_id, supabase_client)
        
        # 5. Desencriptar todos los documentos
        decrypted_documents = await decrypt_all_documents(
            documents,
            symmetric_key_base64
        )
        
        # 6. Analizar documentos usando la configuración del agente
        analysis_result = await analyze_documents(
            decrypted_documents,
            agent_config  # Pasar la configuración al análisis
        )
        
        return {
            'status': 'success',
            'rfx_id': rfx_id,
            'companies_count': len(companies),
            'documents_count': len(decrypted_documents),
            'analysis': analysis_result
        }
        
    except Exception as e:
        print(f"❌ Error procesando RFX {rfx_id}: {str(e)}")
        return {
            'status': 'error',
            'rfx_id': rfx_id,
            'error': str(e)
        }
```

## Valores por Defecto

Si no se encuentra una configuración activa o algún campo es `NULL`, el agente debe usar los siguientes valores por defecto:

- **`rfx_analysis_model`**: `'gpt-5-2025-08-07'`
- **`rfx_analysis_verbosity`**: `'medium'`
- **`rfx_analysis_reasoning_effort`**: `'medium'`
- **`rfx_analysis_system_prompt`**: `None` (el agente debe tener un prompt del sistema por defecto integrado)
- **`rfx_analysis_user_prompt`**: `None` (el agente debe tener un template de prompt de usuario por defecto integrado)

## Notas Importantes

1. **Siempre consultar la configuración activa**: El agente debe leer la configuración de la base de datos en cada ejecución, no cachearla, para asegurar que siempre use la configuración más reciente.

2. **Manejo de errores**: Si la consulta falla, el agente debe usar los valores por defecto y continuar con el procesamiento.

3. **Permisos**: El agente debe tener permisos de `service_role` o ser un usuario con permisos de desarrollador para leer de `agent_prompt_backups_v2`.

4. **Actualización de configuración**: Los administradores pueden actualizar la configuración desde la página de Settings (`/settings`), y los cambios se reflejarán inmediatamente en la próxima ejecución del agente.

## Ubicación en la Interfaz

Los campos de configuración se pueden editar en:
- **Ruta**: `/settings`
- **Tab**: `RFX Analysis`
- **Sección**: "RFX Analysis Agent"

La configuración se guarda en la tabla `agent_prompt_backups_v2` con `is_active = true`.

