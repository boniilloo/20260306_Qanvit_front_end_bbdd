# RFX Agent - Guía de Cifrado con Clave Simétrica

## Recepción de la Clave Simétrica

Cuando se establece la conexión WebSocket, recibirás un mensaje de tipo `conversation_id` con la siguiente estructura:

```json
{
  "type": "conversation_id",
  "conversation_id": "<rfx_id>",
  "symmetric_key": "<clave_simétrica_en_base64>" // o null si no está disponible
}
```

**Importante:**
- La clave simétrica viene en formato **Base64** (string)
- Es una clave **AES-256-GCM** en formato raw (32 bytes cuando se decodifica)
- Si `symmetric_key` es `null`, significa que la RFX no está cifrada o la clave no está disponible aún
- **Debes almacenar esta clave en memoria durante toda la sesión** para cifrar los datos antes de guardarlos

## Proceso de Cifrado

### 1. Importar la Clave

Primero, debes decodificar la clave desde Base64 y prepararla para usar con AES-GCM:

```python
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Decodificar la clave desde Base64
key_bytes = base64.b64decode(symmetric_key)  # Resultado: 32 bytes para AES-256

# Crear el objeto AESGCM con la clave
aesgcm = AESGCM(key_bytes)
```

### 2. Cifrar Datos Antes de Guardar

**CRÍTICO:** Todos los datos sensibles que guardes en la base de datos DEBEN estar cifrados con esta clave antes de almacenarlos.

**Algoritmo:** AES-256-GCM
**IV (Initialization Vector):** 12 bytes aleatorios (generar uno nuevo para cada cifrado)
**Formato de salida:** JSON string con estructura `{"iv": "<base64>", "data": "<base64>"}`

```python
import os
import json
import base64

def encrypt_rfx_data(plaintext: str, symmetric_key_base64: str) -> str:
    """
    Cifra datos usando la clave simétrica de la RFX.
    
    Args:
        plaintext: Texto plano a cifrar
        symmetric_key_base64: Clave simétrica en Base64 (32 bytes decodificados)
    
    Returns:
        JSON string con formato: {"iv": "<base64>", "data": "<base64>"}
    """
    # Decodificar la clave
    key_bytes = base64.b64decode(symmetric_key_base64)
    
    # Crear objeto AESGCM
    aesgcm = AESGCM(key_bytes)
    
    # Generar IV aleatorio (12 bytes para AES-GCM)
    iv = os.urandom(12)
    
    # Cifrar el texto plano
    plaintext_bytes = plaintext.encode('utf-8')
    ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)  # None = no associated data
    
    # Codificar IV y datos cifrados a Base64
    iv_base64 = base64.b64encode(iv).decode('utf-8')
    data_base64 = base64.b64encode(ciphertext).decode('utf-8')
    
    # Retornar como JSON string
    result = {
        "iv": iv_base64,
        "data": data_base64
    }
    return json.dumps(result)
```

### 3. Ejemplo de Uso

```python
# Cuando recibes el conversation_id
conversation_msg = {
    "type": "conversation_id",
    "conversation_id": "rfx-123",
    "symmetric_key": "dGVzdGtleTEyMzQ1Njc4OTBhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eg=="
}

# Almacenar la clave en memoria para la sesión
rfx_symmetric_key = conversation_msg["symmetric_key"]

# Cuando necesites guardar datos sensibles (ej: description, technical_requirements, etc.)
plain_description = "This is a sensitive RFX description"
encrypted_description = encrypt_rfx_data(plain_description, rfx_symmetric_key)

# Guardar encrypted_description en la base de datos (no el texto plano)
# encrypted_description será: '{"iv": "...", "data": "..."}'
```

## Especificaciones Técnicas

- **Algoritmo:** AES-256-GCM (Advanced Encryption Standard, 256 bits, modo Galois/Counter Mode)
- **Tamaño de clave:** 32 bytes (256 bits)
- **Tamaño de IV:** 12 bytes (96 bits) - requerido por AES-GCM
- **Formato de entrada de clave:** Base64 string
- **Formato de salida:** JSON string `{"iv": "<base64>", "data": "<base64>"}`
- **Encoding de texto:** UTF-8

## Notas Importantes

1. **Nunca guardes datos en texto plano** si la RFX tiene una clave simétrica (`symmetric_key` no es `null`)
2. **Genera un IV nuevo para cada cifrado** - nunca reutilices IVs
3. **El formato de salida debe ser exactamente** `{"iv": "...", "data": "..."}` como JSON string
4. **La clave debe mantenerse en memoria** durante toda la sesión de WebSocket
5. **Si `symmetric_key` es `null`**, puedes guardar datos sin cifrar (RFX legacy o sin cifrado)

## Campos que Requieren Cifrado

Cuando guardes información de la RFX, estos campos deben estar cifrados si `symmetric_key` está presente:
- `description`
- `technical_requirements` (o `technical_specifications`)
- `company_requirements`
- Cualquier otro campo de texto que contenga información sensible del RFX

## Validación

Antes de guardar, verifica:
- ✅ La clave simétrica está disponible (`symmetric_key` no es `null`)
- ✅ El IV generado tiene exactamente 12 bytes
- ✅ El formato de salida es JSON válido con `iv` y `data` en Base64
- ✅ El texto plano se codifica correctamente a UTF-8 antes de cifrar

