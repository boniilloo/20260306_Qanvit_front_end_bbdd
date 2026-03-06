# Guía de Desencriptación de Archivos en RFX Agent Backend

Este documento describe los pasos necesarios para desencriptar archivos (imágenes y documentos) que se envían al RFX Agent a través del WebSocket.

## Resumen del Flujo

1. **Al conectar el WebSocket**: El cliente envía la clave simétrica del RFX en base64
2. **Imágenes**: Se envían ya desencriptadas como base64 (el cliente las desencripta antes de enviar)
3. **Documentos**: Se envían como URLs cifradas (el backend debe descargarlas y desencriptarlas)

## Paso 1: Recibir y Almacenar la Clave Simétrica

Al establecer la conexión WebSocket, el cliente envía un mensaje inicial con la clave:

```json
{
  "type": "conversation_id",
  "conversation_id": "<rfx_id>",
  "symmetric_key": "<clave_simétrica_en_base64>"
}
```

**Acción requerida en el backend:**
- Almacenar la `symmetric_key` asociada al `conversation_id` (puede ser `null` si el RFX no tiene cifrado)
- La clave está en formato base64 y representa una clave AES-256 (32 bytes cuando se decodifica)

## Paso 2: Procesar Mensajes con Archivos

Cuando el cliente envía un mensaje con archivos, el formato es:

```json
{
  "type": "user_message",
  "message_id": "<uuid>",
  "data": {
    "content": "<texto del mensaje>",
    "current_state": {
      "description": "...",
      "technical_specifications": "...",
      "company_requirements": "..."
    },
    "images": [
      {
        "data": "data:image/jpeg;base64,/9j/4AAQ...",  // Ya desencriptado
        "filename": "imagen.jpg",
        "metadata": {
          "encrypted": true,
          "encryptedUrl": "https://.../<rfx_id>/<archivo>.jpg.enc"
        }
      }
    ],
    "documents": [
      {
        "url": "https://.../<rfx_id>/<archivo>.pdf.enc",  // URL cifrada
        "filename": "documento.pdf",
        "metadata": {
          "encrypted": true,
          "encryptedUrl": "https://.../<rfx_id>/<archivo>.pdf.enc",
          "size": 12345,
          "format": "application/pdf"
        }
      }
    ]
  }
}
```

### Imágenes (Ya Desencriptadas)

**Las imágenes NO requieren desencriptación en el backend** porque:
- El cliente las desencripta antes de enviarlas
- Se envían como base64 en el campo `data` (formato: `data:image/<tipo>;base64,<datos>`)
- El backend puede usar directamente el campo `data` sin procesamiento adicional

### Documentos (Requieren Desencriptación)

**Los documentos SÍ requieren desencriptación en el backend** porque:
- Se envían como URLs cifradas en el campo `url`
- El backend debe descargar el archivo cifrado y desencriptarlo

## Paso 3: Desencriptar Documentos

### 3.1. Descargar el Archivo Cifrado

Hacer una petición HTTP GET a la URL proporcionada en `documents[].url`:

```python
import requests

encrypted_url = document["url"]
response = requests.get(encrypted_url)
encrypted_data = response.content  # bytes
```

### 3.2. Extraer el IV y los Datos Cifrados

El formato del archivo cifrado es: **IV (12 bytes) + Datos cifrados**

```python
# Los primeros 12 bytes son el IV
iv_bytes = encrypted_data[:12]

# El resto son los datos cifrados
encrypted_bytes = encrypted_data[12:]
```

### 3.3. Convertir la Clave Simétrica

La clave simétrica recibida está en base64. Convertirla a bytes:

```python
import base64

# La clave simétrica recibida en el mensaje conversation_id
symmetric_key_base64 = stored_keys[conversation_id]

# Decodificar de base64 a bytes (resultado: 32 bytes para AES-256)
symmetric_key_bytes = base64.b64decode(symmetric_key_base64)
```

### 3.4. Importar la Clave en el Backend

**Para Python (usando cryptography):**

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend

# Importar la clave raw (32 bytes) para AES-256-GCM
aesgcm = AESGCM(symmetric_key_bytes)
```

**Para Node.js/TypeScript:**

```typescript
import * as crypto from 'crypto';

// La clave ya está en el formato correcto (32 bytes)
const keyBuffer = Buffer.from(symmetricKeyBase64, 'base64');
```

### 3.5. Desencriptar con AES-256-GCM

**Python (cryptography):**

```python
try:
    # Desencriptar usando AES-256-GCM
    decrypted_data = aesgcm.decrypt(
        nonce=iv_bytes,  # El IV es el nonce en GCM
        data=encrypted_bytes,
        associated_data=None  # No hay AAD en este caso
    )
    
    # decrypted_data ahora contiene los bytes del documento original
    # Guardar o procesar según sea necesario
    with open(f"decrypted_{document['filename']}", 'wb') as f:
        f.write(decrypted_data)
        
except Exception as e:
    print(f"Error desencriptando: {e}")
```

**Node.js/TypeScript:**

```typescript
import * as crypto from 'crypto';

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBytes);
  
  let decrypted = decipher.update(encryptedBytes, null, null);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  // decrypted ahora contiene los bytes del documento original
  // Guardar o procesar según sea necesario
  fs.writeFileSync(`decrypted_${document.filename}`, decrypted);
  
} catch (error) {
  console.error('Error desencriptando:', error);
}
```

## Paso 4: Detectar el Tipo MIME del Archivo

El tipo MIME se puede inferir de la extensión del archivo original (eliminando `.enc`):

```python
def get_mime_type_from_filename(filename: str) -> str:
    """Extrae el tipo MIME de la extensión del archivo (sin .enc)"""
    # Remover .enc si existe
    original_filename = filename.replace('.enc', '')
    ext = original_filename.split('.')[-1].lower()
    
    mime_types = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'rtf': 'application/rtf',
    }
    
    return mime_types.get(ext, 'application/octet-stream')
```

## Ejemplo Completo (Python)

```python
import requests
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_rfx_document(
    encrypted_url: str,
    symmetric_key_base64: str,
    output_filename: str
) -> bytes:
    """
    Descarga y desencripta un documento del RFX.
    
    Args:
        encrypted_url: URL del archivo cifrado en Supabase Storage
        symmetric_key_base64: Clave simétrica del RFX en base64
        output_filename: Nombre del archivo de salida (sin .enc)
    
    Returns:
        bytes: Contenido desencriptado del documento
    """
    # 1. Descargar archivo cifrado
    response = requests.get(encrypted_url)
    response.raise_for_status()
    encrypted_data = response.content
    
    # 2. Extraer IV (primeros 12 bytes) y datos cifrados
    iv_bytes = encrypted_data[:12]
    encrypted_bytes = encrypted_data[12:]
    
    # 3. Decodificar clave simétrica de base64
    symmetric_key_bytes = base64.b64decode(symmetric_key_base64)
    
    # 4. Crear instancia AESGCM
    aesgcm = AESGCM(symmetric_key_bytes)
    
    # 5. Desencriptar
    try:
        decrypted_data = aesgcm.decrypt(
            nonce=iv_bytes,
            data=encrypted_bytes,
            associated_data=None
        )
        return decrypted_data
    except Exception as e:
        raise Exception(f"Error desencriptando documento: {e}")

# Uso:
# Cuando recibes un mensaje con documentos:
for document in message["data"]["documents"]:
    encrypted_url = document["url"]
    symmetric_key = stored_keys[conversation_id]  # Obtenida al inicio
    
    decrypted_bytes = decrypt_rfx_document(
        encrypted_url=encrypted_url,
        symmetric_key_base64=symmetric_key,
        output_filename=document["filename"]
    )
    
    # Procesar el documento desencriptado según sea necesario
    # (por ejemplo, extraer texto con PyPDF2, python-docx, etc.)
```

## Ejemplo Completo (Node.js/TypeScript)

```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';
import axios from 'axios';

async function decryptRFXDocument(
  encryptedUrl: string,
  symmetricKeyBase64: string,
  outputFilename: string
): Promise<Buffer> {
  /**
   * Descarga y desencripta un documento del RFX.
   * 
   * @param encryptedUrl URL del archivo cifrado en Supabase Storage
   * @param symmetricKeyBase64 Clave simétrica del RFX en base64
   * @param outputFilename Nombre del archivo de salida (sin .enc)
   * @returns Buffer con el contenido desencriptado
   */
  
  // 1. Descargar archivo cifrado
  const response = await axios.get(encryptedUrl, {
    responseType: 'arraybuffer'
  });
  const encryptedData = Buffer.from(response.data);
  
  // 2. Extraer IV (primeros 12 bytes) y datos cifrados
  const ivBytes = encryptedData.slice(0, 12);
  const encryptedBytes = encryptedData.slice(12);
  
  // 3. Decodificar clave simétrica de base64
  const keyBuffer = Buffer.from(symmetricKeyBase64, 'base64');
  
  // 4. Desencriptar con AES-256-GCM
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBytes);
    
    let decrypted = decipher.update(encryptedBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  } catch (error) {
    throw new Error(`Error desencriptando documento: ${error}`);
  }
}

// Uso:
// Cuando recibes un mensaje con documentos:
for (const document of message.data.documents) {
  const encryptedUrl = document.url;
  const symmetricKey = storedKeys[conversationId]; // Obtenida al inicio
  
  const decryptedBuffer = await decryptRFXDocument(
    encryptedUrl,
    symmetricKey,
    document.filename
  );
  
  // Procesar el documento desencriptado según sea necesario
  // (por ejemplo, extraer texto con pdf-parse, mammoth, etc.)
}
```

## Puntos Importantes

1. **Algoritmo**: AES-256-GCM (Advanced Encryption Standard, 256 bits, modo Galois/Counter)
2. **IV/Nonce**: 12 bytes (estándar para GCM)
3. **Formato del archivo cifrado**: `IV (12 bytes) + Datos cifrados`
4. **Clave simétrica**: 32 bytes (256 bits) cuando se decodifica de base64
5. **Imágenes**: Ya vienen desencriptadas en base64, no requieren procesamiento
6. **Documentos**: Requieren descarga y desencriptación en el backend
7. **Manejo de errores**: Si la desencriptación falla, puede ser por:
   - Clave incorrecta
   - Archivo corrupto
   - IV incorrecto
   - Formato de archivo incorrecto

## Verificación

Para verificar que la desencriptación funciona correctamente:

1. **Documentos PDF**: Deberían abrirse correctamente en un visor PDF
2. **Documentos Word**: Deberían abrirse en Word/LibreOffice
3. **Tamaño**: El archivo desencriptado debería tener un tamaño razonable (no 0 bytes ni excesivamente grande)
4. **Headers**: Los archivos desencriptados deberían tener los headers correctos (ej: PDF debería empezar con `%PDF`)

## Notas de Seguridad

- **Nunca loguear la clave simétrica** en producción
- **Almacenar la clave de forma segura** asociada al conversation_id
- **Limpiar la clave de memoria** cuando ya no se necesite
- **Validar que la URL del documento** pertenece a Supabase Storage antes de descargarla
- **Manejar errores de desencriptación** de forma segura sin exponer información sensible


