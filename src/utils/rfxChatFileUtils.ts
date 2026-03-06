/**
 * Utilidades para manejo de archivos cifrados en RFX Chat
 * Cifrado E2E con clave simétrica del RFX (AES-256-GCM)
 */

import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';
import type { MessageImage, MessageDocument } from '@/types/chat';
import { 
  validateImage, 
  compressImage, 
  getImageMetadata,
  convertImageToBase64,
  IMAGE_CONFIG 
} from './imageUtils';
import { 
  DOCUMENT_CONFIG 
} from './documentUtils';

// Configuración del bucket de RFX chat
export const RFX_CHAT_STORAGE = {
  BUCKET_NAME: 'rfx-chat-attachments',
  MAX_IMAGES_PER_MESSAGE: IMAGE_CONFIG.MAX_IMAGES_PER_MESSAGE,
  MAX_DOCUMENTS_PER_MESSAGE: DOCUMENT_CONFIG.MAX_DOCUMENTS_PER_MESSAGE,
  // Per requirement: any file type, max 5 MB per file (RFX supplier chat)
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
  // Safety limit for UI/DB payload size (not requested, but prevents abuse)
  MAX_ATTACHMENTS_PER_MESSAGE: 5,
};

/**
 * Validates a generic attachment for RFX supplier chat.
 * Requirement: allow any MIME type, enforce 5MB size limit.
 */
export async function validateRfxChatAttachment(file: File): Promise<boolean> {
  if (file.size > RFX_CHAT_STORAGE.MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large. Maximum 5MB allowed.`);
  }
  return true;
}

/**
 * Cifra y sube una imagen al bucket de RFX chat
 * Retorna MessageImage con URL cifrada
 */
export async function encryptAndUploadImage(
  file: File,
  rfxId: string,
  encryptFile: (buffer: ArrayBuffer) => Promise<{ data: ArrayBuffer; iv: string } | null>
): Promise<MessageImage> {
  try {
    // 1. Validar imagen
    await validateImage(file);
    
    // 2. Comprimir si es necesario
    const compressedFile = await compressImage(file);

    // Enforce size limit after compression (5MB max)
    await validateRfxChatAttachment(compressedFile);
    
    // 3. Obtener metadata
    const metadata = await getImageMetadata(compressedFile);
    
    // 4. Leer archivo como ArrayBuffer
    const arrayBuffer = await compressedFile.arrayBuffer();
    
    // 5. Cifrar con clave RFX
    const encrypted = await encryptFile(arrayBuffer);
    
    if (!encrypted) {
      throw new Error('Failed to encrypt image');
    }
    
    // 6. Preparar datos para subir: IV (12 bytes) + Datos cifrados
    const ivBytes = userCrypto.base64ToArrayBuffer(encrypted.iv);
    const dataBytes = new Uint8Array(encrypted.data);
    
    const combined = new Uint8Array(ivBytes.byteLength + dataBytes.byteLength);
    combined.set(new Uint8Array(ivBytes), 0);
    combined.set(dataBytes, ivBytes.byteLength);
    
    // 7. Generar nombre de archivo único
    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : null;
    const safeExt = (fileExt && fileExt.trim().length > 0) ? fileExt : 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${safeExt}.enc`;
    const filePath = `${rfxId}/${fileName}`;
    
    // 8. Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(RFX_CHAT_STORAGE.BUCKET_NAME)
      .upload(filePath, combined.buffer, {
        contentType: 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Error uploading encrypted image:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    // 9. Obtener URL pública del archivo cifrado
    const { data: { publicUrl } } = supabase.storage
      .from(RFX_CHAT_STORAGE.BUCKET_NAME)
      .getPublicUrl(filePath);
    
    // 10. Convertir a base64 para preview (antes de cifrar, usando el archivo comprimido)
    const base64Preview = await convertImageToBase64(compressedFile);
    
    // 11. Retornar MessageImage con URL cifrada y preview
    return {
      data: base64Preview, // Base64 para preview en UI
      filename: file.name,
      metadata: {
        ...metadata,
        encrypted: true, // Flag para indicar que está cifrado
        encryptedUrl: publicUrl, // URL del archivo cifrado
        preview: base64Preview // Preview para mostrar antes de enviar
      }
    };
  } catch (error) {
    console.error('Error in encryptAndUploadImage:', error);
    throw error;
  }
}

/**
 * Cifra y sube un adjunto genérico (cualquier tipo de archivo) al bucket de RFX chat.
 * Retorna MessageDocument con URL cifrada.
 */
export async function encryptAndUploadAttachment(
  file: File,
  rfxId: string,
  encryptFile: (buffer: ArrayBuffer) => Promise<{ data: ArrayBuffer; iv: string } | null>
): Promise<MessageDocument> {
  try {
    // 1. Validar adjunto (any type, 5MB max)
    await validateRfxChatAttachment(file);
    
    // 2. Leer archivo como ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // 3. Cifrar con clave RFX
    const encrypted = await encryptFile(arrayBuffer);
    
    if (!encrypted) {
      throw new Error('Failed to encrypt document');
    }
    
    // 4. Preparar datos para subir: IV (12 bytes) + Datos cifrados
    const ivBytes = userCrypto.base64ToArrayBuffer(encrypted.iv);
    const dataBytes = new Uint8Array(encrypted.data);
    
    const combined = new Uint8Array(ivBytes.byteLength + dataBytes.byteLength);
    combined.set(new Uint8Array(ivBytes), 0);
    combined.set(dataBytes, ivBytes.byteLength);
    
    // 5. Generar nombre de archivo único
    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : null;
    const safeExt = (fileExt && fileExt.trim().length > 0) ? fileExt : 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${safeExt}.enc`;
    const filePath = `${rfxId}/${fileName}`;
    
    // 6. Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(RFX_CHAT_STORAGE.BUCKET_NAME)
      .upload(filePath, combined.buffer, {
        contentType: 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Error uploading encrypted document:', uploadError);
      throw new Error(`Failed to upload document: ${uploadError.message}`);
    }
    
    // 7. Obtener URL pública del archivo cifrado
    const { data: { publicUrl } } = supabase.storage
      .from(RFX_CHAT_STORAGE.BUCKET_NAME)
      .getPublicUrl(filePath);
    
    // 8. Retornar MessageDocument con URL cifrada
    return {
      url: publicUrl,
      filename: file.name,
      metadata: {
        size: file.size,
        format: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        encrypted: true, // Flag para indicar que está cifrado
        encryptedUrl: publicUrl // URL del archivo cifrado
      }
    };
  } catch (error) {
    console.error('Error in encryptAndUploadAttachment:', error);
    throw error;
  }
}

/**
 * Backward compatible alias.
 * Older code imports `encryptAndUploadDocument`; it now supports any file type (<= 5MB).
 */
export const encryptAndUploadDocument = encryptAndUploadAttachment;

/**
 * Descifra una imagen y retorna blob URL temporal para visualización
 */
export async function decryptImage(
  encryptedUrl: string,
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>
): Promise<string> {
  try {
    // 1. Descargar archivo cifrado
    const response = await fetch(encryptedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted image: ${response.status}`);
    }
    const encryptedBuffer = await response.arrayBuffer();
    
    // 2. Separar IV (primeros 12 bytes) y datos cifrados
    const ivBytes = encryptedBuffer.slice(0, 12);
    const dataBytes = encryptedBuffer.slice(12);
    
    // 3. Convertir IV a base64
    const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
    
    // 4. Descifrar
    const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
    
    if (!decryptedBuffer) {
      throw new Error('Failed to decrypt image');
    }
    
    // 5. Detectar tipo MIME basado en extensión original (sin .enc)
    const originalExt = encryptedUrl
      .split('/').pop()
      ?.split('?')[0]
      .replace('.enc', '')
      .split('.').pop()
      ?.toLowerCase() || 'jpg';
    
    let mimeType = 'image/jpeg';
    if (originalExt === 'png') mimeType = 'image/png';
    else if (originalExt === 'webp') mimeType = 'image/webp';
    else if (originalExt === 'gif') mimeType = 'image/gif';
    else if (originalExt === 'svg') mimeType = 'image/svg+xml';
    
    // 6. Crear blob y URL temporal
    const blob = new Blob([decryptedBuffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    
    return blobUrl;
  } catch (error) {
    console.error('Error in decryptImage:', error);
    throw error;
  }
}

/**
 * Descifra un documento y retorna Blob para descarga
 */
export async function decryptDocument(
  encryptedUrl: string,
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>
): Promise<Blob> {
  try {
    // 1. Descargar archivo cifrado
    const response = await fetch(encryptedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted document: ${response.status}`);
    }
    const encryptedBuffer = await response.arrayBuffer();
    
    // 2. Separar IV (primeros 12 bytes) y datos cifrados
    const ivBytes = encryptedBuffer.slice(0, 12);
    const dataBytes = encryptedBuffer.slice(12);
    
    // 3. Convertir IV a base64
    const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
    
    // 4. Descifrar
    const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
    
    if (!decryptedBuffer) {
      throw new Error('Failed to decrypt document');
    }
    
    // 5. Detectar tipo MIME basado en extensión
    const originalExt = encryptedUrl
      .split('/').pop()
      ?.split('?')[0]
      .replace('.enc', '')
      .split('.').pop()
      ?.toLowerCase();
    
    let mimeType = 'application/octet-stream';
    if (originalExt === 'pdf') mimeType = 'application/pdf';
    else if (originalExt === 'doc') mimeType = 'application/msword';
    else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (originalExt === 'pptx') mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    else if (originalExt === 'txt') mimeType = 'text/plain';
    else if (originalExt === 'rtf') mimeType = 'application/rtf';
    
    // 6. Crear blob
    const blob = new Blob([decryptedBuffer], { type: mimeType });
    
    return blob;
  } catch (error) {
    console.error('Error in decryptDocument:', error);
    throw error;
  }
}

/**
 * Descifra imagen y convierte a base64 para enviar al agente
 * (Igual que en chat regular)
 */
export async function decryptImageToBase64(
  encryptedUrl: string,
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>
): Promise<string> {
  try {
    // 1. Descargar y descifrar
    const response = await fetch(encryptedUrl);
    const encryptedBuffer = await response.arrayBuffer();
    
    const ivBytes = encryptedBuffer.slice(0, 12);
    const dataBytes = encryptedBuffer.slice(12);
    const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
    
    const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
    if (!decryptedBuffer) {
      throw new Error('Failed to decrypt image');
    }
    
    // 2. Detectar MIME type
    const originalExt = encryptedUrl
      .split('/').pop()
      ?.split('?')[0]
      .replace('.enc', '')
      .split('.').pop()
      ?.toLowerCase() || 'jpg';
    
    let mimeType = 'image/jpeg';
    if (originalExt === 'png') mimeType = 'image/png';
    else if (originalExt === 'webp') mimeType = 'image/webp';
    else if (originalExt === 'gif') mimeType = 'image/gif';
    
    // 3. Convertir a base64
    const blob = new Blob([decryptedBuffer], { type: mimeType });
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return base64;
  } catch (error) {
    console.error('Error in decryptImageToBase64:', error);
    throw error;
  }
}

/**
 * Trigger descarga de un documento descifrado
 */
export async function downloadDecryptedDocument(
  encryptedUrl: string,
  filename: string,
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>
): Promise<void> {
  try {
    const blob = await decryptDocument(encryptedUrl, decryptFile);
    
    // Crear link temporal y trigger descarga
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename.replace('.enc', ''); // Remover .enc del nombre
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('Error in downloadDecryptedDocument:', error);
    throw error;
  }
}

