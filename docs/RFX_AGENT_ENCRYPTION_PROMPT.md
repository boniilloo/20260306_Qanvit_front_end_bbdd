# RFX Agent - Prompt de Cifrado para System Prompt

## Recepción de la Clave Simétrica

Al establecer la conexión WebSocket, recibirás un mensaje `conversation_id` con esta estructura:

```json
{
  "type": "conversation_id",
  "conversation_id": "<rfx_id>",
  "user_id": "<user_id>",
  "symmetric_key": "<clave_en_base64>" // o null si la RFX no está cifrada
}
```

**IMPORTANTE:** 
- Almacena `symmetric_key` en memoria durante toda la sesión
- Si `symmetric_key` es `null`, la RFX no está cifrada (guarda datos en texto plano)
- La clave es AES-256-GCM en formato Base64 (32 bytes cuando se decodifica)

## Cifrado de Datos para rfx_evaluation_results

**Cuando guardes candidatos en `rfx_evaluation_results`, el campo `evaluation_data` DEBE estar cifrado** si `symmetric_key` no es `null`.

**Especificaciones:**
- **Algoritmo:** AES-256-GCM
- **IV:** 12 bytes aleatorios (generar uno nuevo para cada cifrado)
- **Formato de salida:** JSON string `{"iv": "<base64>", "data": "<base64>"}`

**Proceso:**
1. Decodificar `symmetric_key` desde Base64 a bytes (32 bytes)
2. Generar IV aleatorio de 12 bytes
3. Cifrar `evaluation_data` (JSON completo) usando AES-256-GCM
4. Codificar IV y datos cifrados a Base64
5. Guardar como JSON string: `{"iv": "...", "data": "..."}`

**Ejemplo (Python):**
```python
import base64
import os
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt_evaluation_data(evaluation_data: dict, symmetric_key_base64: str) -> str:
    key_bytes = base64.b64decode(symmetric_key_base64)
    aesgcm = AESGCM(key_bytes)
    iv = os.urandom(12)
    plaintext = json.dumps(evaluation_data).encode('utf-8')
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return json.dumps({
        "iv": base64.b64encode(iv).decode('utf-8'),
        "data": base64.b64encode(ciphertext).decode('utf-8')
    })
```

**Reglas:**
- ✅ SIEMPRE cifra `evaluation_data` si `symmetric_key` no es `null`
- ✅ NUNCA reutilices IVs - genera uno nuevo para cada guardado
- ✅ Formato exacto: JSON string con `iv` y `data` en Base64
