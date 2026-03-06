# Guía para el Agente de Análisis de RFX

Este documento describe cómo el agente del endpoint WebSocket `ws-rfx-analysis` debe procesar una RFX para analizar las respuestas de todas las empresas invitadas.

## Flujo General

Cuando el agente recibe un mensaje en el WebSocket con la siguiente estructura:
```json
{
  "rfx_id": "uuid-de-la-rfx",
  "symmetric_key_hash": "hash-sha256-de-la-clave-simetrica"
}
```

El agente debe seguir estos pasos:

1. **Obtener la clave simétrica de la RFX** usando el hash recibido
2. **Consultar todas las empresas asociadas a la RFX**
3. **Descargar todos los documentos de todas las empresas**
4. **Desencriptar los documentos** usando la clave simétrica
5. **Procesar y analizar los documentos** descifrados

---

## 1. Obtener la Clave Simétrica de la RFX

### 1.1. Problema: El hash no es suficiente

El agente recibe un `symmetric_key_hash` (SHA256), pero necesita la clave simétrica real para desencriptar los documentos. **El hash no puede revertirse**, por lo que el agente debe obtener la clave simétrica de otra forma.

### 1.2. Solución: Consultar la base de datos

El agente debe consultar la tabla `rfx_key_members` para obtener la clave simétrica encriptada. Sin embargo, necesita:

1. **Un usuario con acceso a la RFX**: El agente debe usar un usuario del sistema (service role) o un usuario con permisos de desarrollador.
2. **Desencriptar la clave simétrica**: La clave está encriptada con la clave pública del usuario, por lo que necesitará la clave privada correspondiente.

### 1.3. Consulta SQL para obtener la clave simétrica

```sql
-- Obtener la clave simétrica encriptada de la RFX
-- Nota: El agente debe usar un usuario con permisos (service_role o developer)
SELECT 
  rkm.encrypted_symmetric_key,
  rkm.user_id,
  au.encrypted_private_key
FROM rfx_key_members rkm
JOIN app_user au ON au.auth_user_id = rkm.user_id
WHERE rkm.rfx_id = :rfx_id
LIMIT 1;
```

### 1.4. Desencriptar la clave simétrica

Una vez obtenida la `encrypted_symmetric_key` y la `encrypted_private_key` del usuario:

1. **Desencriptar la clave privada del usuario** usando el servicio `crypto-service` (Edge Function):
   - Endpoint: `POST /crypto-service`
   - Body: `{ "action": "decrypt", "data": "<encrypted_private_key_base64>", "iv": "<iv_base64>" }`
   - Nota: La clave privada está almacenada como `{ data, iv }` en formato JSON en la columna `encrypted_private_key`

2. **Desencriptar la clave simétrica** usando la clave privada:
   - La `encrypted_symmetric_key` está encriptada con RSA-OAEP usando la clave pública del usuario
   - Usar RSA-OAEP para desencriptar y obtener la clave simétrica en formato base64

3. **Verificar el hash** (opcional pero recomendado):
   - Calcular SHA256 de la clave simétrica obtenida
   - Comparar con el `symmetric_key_hash` recibido para validar que es la clave correcta

### 1.5. Código Python de ejemplo

```python
import hashlib
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key
import requests

async def get_rfx_symmetric_key(rfx_id: str, symmetric_key_hash: str, supabase_client):
    """
    Obtiene la clave simétrica de la RFX desde la base de datos.
    
    Args:
        rfx_id: ID de la RFX
        symmetric_key_hash: Hash SHA256 de la clave (para validación)
        supabase_client: Cliente de Supabase con permisos de service_role
    
    Returns:
        str: Clave simétrica en formato base64
    """
    # 1. Consultar la clave encriptada
    response = supabase_client.table('rfx_key_members') \
        .select('encrypted_symmetric_key, user_id, app_user!inner(encrypted_private_key)') \
        .eq('rfx_id', rfx_id) \
        .limit(1) \
        .execute()
    
    if not response.data or len(response.data) == 0:
        raise ValueError(f"No se encontró clave simétrica para la RFX {rfx_id}")
    
    encrypted_symmetric_key = response.data[0]['encrypted_symmetric_key']
    encrypted_private_key_data = response.data[0]['app_user']['encrypted_private_key']
    
    # 2. Desencriptar la clave privada del usuario usando crypto-service
    # encrypted_private_key_data es un JSON: { "data": "...", "iv": "..." }
    import json
    private_key_encrypted = json.loads(encrypted_private_key_data)
    
    # Llamar a la Edge Function crypto-service
    crypto_service_url = f"{SUPABASE_URL}/functions/v1/crypto-service"
    decrypt_response = requests.post(
        crypto_service_url,
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "action": "decrypt",
            "data": private_key_encrypted["data"],
            "iv": private_key_encrypted["iv"]
        }
    )
    decrypt_response.raise_for_status()
    private_key_pem = decrypt_response.json()["decrypted_data"]
    
    # 3. Importar la clave privada
    private_key = load_pem_private_key(
        private_key_pem.encode(),
        password=None
    )
    
    # 4. Desencriptar la clave simétrica
    # encrypted_symmetric_key está en base64
    encrypted_key_bytes = base64.b64decode(encrypted_symmetric_key)
    symmetric_key_bytes = private_key.decrypt(
        encrypted_key_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    symmetric_key_base64 = base64.b64encode(symmetric_key_bytes).decode()
    
    # 5. Validar el hash
    key_hash = hashlib.sha256(symmetric_key_bytes).hexdigest()
    if key_hash != symmetric_key_hash:
        raise ValueError("El hash de la clave simétrica no coincide")
    
    return symmetric_key_base64
```

---

## 2. Consultar Empresas Asociadas a la RFX

### 2.1. Tabla: `rfx_company_invitations`

Esta tabla contiene todas las invitaciones de empresas a una RFX.

**Estructura:**
- `id`: UUID de la invitación
- `rfx_id`: UUID de la RFX
- `company_id`: UUID de la empresa
- `status`: Estado de la invitación (ej: 'submitted', 'supplier evaluating RFX', etc.)
- `created_at`: Fecha de creación
- `updated_at`: Fecha de actualización

### 2.2. Consulta SQL

```sql
-- Obtener todas las empresas invitadas a la RFX
SELECT 
  rci.id as invitation_id,
  rci.company_id,
  rci.status,
  cr.nombre_empresa as company_name,
  cr.website as company_website
FROM rfx_company_invitations rci
JOIN company_revision cr ON cr.company_id = rci.company_id
WHERE rci.rfx_id = :rfx_id
  AND cr.is_active = true
ORDER BY rci.created_at DESC;
```

### 2.3. Código Python de ejemplo

```python
async def get_rfx_companies(rfx_id: str, supabase_client):
    """
    Obtiene todas las empresas asociadas a una RFX.
    
    Args:
        rfx_id: ID de la RFX
        supabase_client: Cliente de Supabase
    
    Returns:
        list: Lista de diccionarios con información de empresas
    """
    response = supabase_client.table('rfx_company_invitations') \
        .select('id, company_id, status, company_revision!inner(nombre_empresa, website)') \
        .eq('rfx_id', rfx_id) \
        .eq('company_revision.is_active', True) \
        .execute()
    
    companies = []
    for row in response.data:
        companies.append({
            'invitation_id': row['id'],
            'company_id': row['company_id'],
            'company_name': row['company_revision']['nombre_empresa'],
            'company_website': row['company_revision'].get('website'),
            'status': row['status']
        })
    
    return companies
```

---

## 3. Descargar Documentos de las Empresas

### 3.1. Tabla: `rfx_supplier_documents`

Esta tabla contiene todos los documentos subidos por las empresas (suppliers) para una RFX.

**Estructura:**
- `id`: UUID del documento
- `rfx_company_invitation_id`: UUID de la invitación (relaciona con `rfx_company_invitations`)
- `file_path`: Ruta del archivo en el bucket de almacenamiento
- `file_name`: Nombre del archivo
- `file_size`: Tamaño del archivo en bytes
- `category`: Categoría del documento ('proposal', 'offer', 'other')
- `uploaded_by`: UUID del usuario que subió el archivo
- `uploaded_at`: Fecha de subida

### 3.2. Bucket de almacenamiento

Los documentos se almacenan en el bucket: **`rfx-supplier-documents`**

**Importante:** Los archivos cifrados tienen extensión `.enc` y contienen:
- **Primeros 12 bytes**: IV (Initialization Vector) para AES-GCM
- **Resto del archivo**: Contenido cifrado

### 3.3. Consulta SQL para obtener documentos

```sql
-- Obtener todos los documentos de todas las empresas para una RFX
SELECT 
  rsd.id,
  rsd.rfx_company_invitation_id,
  rsd.file_path,
  rsd.file_name,
  rsd.file_size,
  rsd.category,
  rsd.uploaded_at,
  rci.company_id,
  cr.nombre_empresa as company_name
FROM rfx_supplier_documents rsd
JOIN rfx_company_invitations rci ON rci.id = rsd.rfx_company_invitation_id
JOIN company_revision cr ON cr.company_id = rci.company_id
WHERE rci.rfx_id = :rfx_id
  AND cr.is_active = true
ORDER BY rci.company_id, rsd.uploaded_at DESC;
```

### 3.4. Código Python para descargar documentos

```python
import aiohttp
from supabase import create_client

async def download_supplier_documents(rfx_id: str, supabase_client):
    """
    Descarga todos los documentos de todas las empresas para una RFX.
    
    Args:
        rfx_id: ID de la RFX
        supabase_client: Cliente de Supabase
    
    Returns:
        list: Lista de diccionarios con información de documentos y sus datos
    """
    # 1. Obtener lista de documentos
    response = supabase_client.table('rfx_supplier_documents') \
        .select('id, rfx_company_invitation_id, file_path, file_name, file_size, category, uploaded_at, rfx_company_invitations!inner(company_id, company_revision!inner(nombre_empresa))') \
        .eq('rfx_company_invitations.rfx_id', rfx_id) \
        .eq('rfx_company_invitations.company_revision.is_active', True) \
        .execute()
    
    documents = []
    for row in response.data:
        invitation = row['rfx_company_invitations']
        company = invitation['company_revision']
        
        # 2. Descargar el archivo del bucket
        file_response = supabase_client.storage \
            .from('rfx-supplier-documents') \
            .download(row['file_path'])
        
        if file_response:
            documents.append({
                'id': row['id'],
                'invitation_id': row['rfx_company_invitation_id'],
                'company_id': invitation['company_id'],
                'company_name': company['nombre_empresa'],
                'file_name': row['file_name'],
                'file_path': row['file_path'],
                'file_size': row['file_size'],
                'category': row['category'],
                'uploaded_at': row['uploaded_at'],
                'encrypted_data': file_response,  # Bytes del archivo cifrado
                'is_encrypted': row['file_path'].endswith('.enc')
            })
    
    return documents
```

---

## 4. Desencriptar Documentos

### 4.1. Algoritmo de cifrado

Los documentos están cifrados con **AES-256-GCM**:
- **Algoritmo**: AES-GCM (Galois/Counter Mode)
- **Tamaño de clave**: 256 bits (32 bytes)
- **Tamaño de IV**: 12 bytes
- **Formato del archivo cifrado**: `IV (12 bytes) + Contenido Cifrado`

### 4.2. Proceso de desencriptación

1. **Extraer el IV**: Los primeros 12 bytes del archivo son el IV
2. **Extraer el contenido cifrado**: El resto del archivo es el contenido cifrado
3. **Desencriptar usando AES-256-GCM** con la clave simétrica de la RFX

### 4.3. Código Python para desencriptar

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64

async def decrypt_document(
    encrypted_data: bytes,
    symmetric_key_base64: str,
    file_name: str
) -> bytes:
    """
    Desencripta un documento usando AES-256-GCM.
    
    Args:
        encrypted_data: Bytes del archivo cifrado (incluye IV + contenido)
        symmetric_key_base64: Clave simétrica en formato base64
        file_name: Nombre del archivo (para detectar si está cifrado)
    
    Returns:
        bytes: Contenido desencriptado del documento
    """
    # Si el archivo no tiene extensión .enc, no está cifrado
    if not file_name.endswith('.enc'):
        return encrypted_data
    
    # Extraer IV (primeros 12 bytes) y contenido cifrado
    iv = encrypted_data[:12]
    ciphertext = encrypted_data[12:]
    
    # Convertir la clave de base64 a bytes
    symmetric_key = base64.b64decode(symmetric_key_base64)
    
    # Desencriptar usando AES-256-GCM
    aesgcm = AESGCM(symmetric_key)
    decrypted_data = aesgcm.decrypt(iv, ciphertext, None)
    
    return decrypted_data

async def decrypt_all_documents(
    documents: list,
    symmetric_key_base64: str
) -> list:
    """
    Desencripta todos los documentos de una lista.
    
    Args:
        documents: Lista de documentos con 'encrypted_data' y 'file_name'
        symmetric_key_base64: Clave simétrica en formato base64
    
    Returns:
        list: Lista de documentos con 'decrypted_data' añadido
    """
    decrypted_documents = []
    
    for doc in documents:
        if doc['is_encrypted']:
            decrypted_data = await decrypt_document(
                doc['encrypted_data'],
                symmetric_key_base64,
                doc['file_name']
            )
            doc['decrypted_data'] = decrypted_data
        else:
            doc['decrypted_data'] = doc['encrypted_data']
        
        decrypted_documents.append(doc)
    
    return decrypted_documents
```

---

## 5. Flujo Completo del Agente

### 5.1. Pseudocódigo del flujo principal

```python
async def process_rfx_analysis(message: dict):
    """
    Procesa el análisis de una RFX recibida por WebSocket.
    
    Args:
        message: {
            "rfx_id": "uuid",
            "symmetric_key_hash": "sha256-hash"
        }
    """
    rfx_id = message['rfx_id']
    symmetric_key_hash = message['symmetric_key_hash']
    
    try:
        # 1. Obtener la clave simétrica de la RFX
        symmetric_key_base64 = await get_rfx_symmetric_key(
            rfx_id,
            symmetric_key_hash,
            supabase_client
        )
        
        # 2. Obtener todas las empresas asociadas
        companies = await get_rfx_companies(rfx_id, supabase_client)
        print(f"📊 Encontradas {len(companies)} empresas para la RFX {rfx_id}")
        
        # 3. Descargar todos los documentos
        documents = await download_supplier_documents(rfx_id, supabase_client)
        print(f"📄 Descargados {len(documents)} documentos")
        
        # 4. Desencriptar todos los documentos
        decrypted_documents = await decrypt_all_documents(
            documents,
            symmetric_key_base64
        )
        print(f"🔓 Desencriptados {len(decrypted_documents)} documentos")
        
        # 5. Organizar documentos por empresa
        documents_by_company = {}
        for doc in decrypted_documents:
            company_id = doc['company_id']
            if company_id not in documents_by_company:
                documents_by_company[company_id] = {
                    'company_name': doc['company_name'],
                    'documents': []
                }
            documents_by_company[company_id]['documents'].append(doc)
        
        # 6. Procesar y analizar los documentos
        # Aquí el agente puede:
        # - Extraer texto de PDFs
        # - Analizar propuestas
        # - Comparar ofertas
        # - Generar resúmenes
        # etc.
        
        analysis_result = await analyze_documents(documents_by_company)
        
        # 7. Guardar resultados en la base de datos (opcional)
        await save_analysis_results(rfx_id, analysis_result)
        
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

### 5.2. Estructura de datos resultante

Después de procesar, el agente tendrá acceso a:

```python
{
    'company_id_1': {
        'company_name': 'Empresa A',
        'documents': [
            {
                'id': 'uuid',
                'file_name': 'propuesta.pdf',
                'category': 'proposal',
                'decrypted_data': b'...',  # Bytes del PDF desencriptado
                'uploaded_at': '2024-01-01T00:00:00Z'
            },
            # ... más documentos
        ]
    },
    'company_id_2': {
        # ... documentos de otra empresa
    }
}
```

---

## 6. Consideraciones Importantes

### 6.1. Permisos del Agente

El agente debe tener acceso con **service_role** o ser un usuario con permisos de **developer** para:
- Leer de `rfx_key_members`
- Leer de `rfx_company_invitations`
- Leer de `rfx_supplier_documents`
- Leer de `app_user` (para obtener claves privadas)
- Acceder al bucket `rfx-supplier-documents`

### 6.2. Manejo de Errores

- Si no se encuentra la clave simétrica, el agente debe reportar el error
- Si un documento no se puede desencriptar, continuar con los demás y reportar el error
- Si una empresa no tiene documentos, incluirla en el resultado con lista vacía

### 6.3. Seguridad

- **Nunca** almacenar la clave simétrica en logs o archivos de texto
- **Nunca** enviar la clave simétrica por el WebSocket (solo el hash)
- Limpiar la clave simétrica de memoria después de usarla
- Validar siempre el hash antes de usar la clave

### 6.4. Performance

- Descargar documentos en paralelo cuando sea posible
- Procesar documentos grandes en chunks si es necesario
- Limitar el tamaño máximo de documentos a procesar

---

## 7. Ejemplo de Implementación Completa

Ver el archivo `src/pages/RFXResponsesPage.tsx` líneas 628-724 para ver cómo se envía el mensaje al WebSocket desde el frontend.

El agente debe implementar la lógica descrita en este documento para procesar correctamente las RFX y analizar los documentos de todas las empresas.

