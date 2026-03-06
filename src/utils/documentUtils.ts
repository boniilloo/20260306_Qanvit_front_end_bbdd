/**
 * Utilidades para manejo de documentos en mensajes multimodales
 * Subida a Supabase Storage, validación y obtención de URLs
 */

import { supabase } from '@/integrations/supabase/client';

export interface DocumentMetadata {
  size: number;
  format: string;
  filename: string;
  url: string;
  uploadedAt: string;
}

export interface ProcessedDocument {
  url: string;
  filename: string;
  metadata: DocumentMetadata;
}

// Constantes de configuración
export const DOCUMENT_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FORMATS: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf'
  ],
  MAX_DOCUMENTS_PER_MESSAGE: 3,
  BUCKET_NAME: 'chat-documents'
};

/**
 * Valida si un documento cumple con los requisitos
 */
export function validateDocument(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Verificar tamaño
    if (file.size > DOCUMENT_CONFIG.MAX_FILE_SIZE) {
      reject(new Error(`File is too large. Maximum ${DOCUMENT_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB allowed.`));
      return;
    }
    
    // Verificar formato
    if (!DOCUMENT_CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
      reject(new Error(`Unsupported format. Allowed formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, RTF`));
      return;
    }
    
    resolve(true);
  });
}

/**
 * Sube un documento a Supabase Storage y retorna la URL pública
 */
export async function uploadDocumentToStorage(file: File): Promise<string> {
  try {
    // Generar nombre único para el archivo
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `chat/${fileName}`;

    // Subir archivo a Supabase Storage
    const { data, error } = await supabase.storage
      .from(DOCUMENT_CONFIG.BUCKET_NAME)
      .upload(filePath, file);

    if (error) {
      console.error('Error uploading document:', error);
      throw new Error(`Failed to upload document: ${error.message}`);
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from(DOCUMENT_CONFIG.BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadDocumentToStorage:', error);
    throw error;
  }
}

/**
 * Procesa un documento completo: validación y subida
 */
export async function processDocument(file: File): Promise<ProcessedDocument> {
  try {
    // 1. Validar documento
    await validateDocument(file);
    
    // 2. Subir a Supabase Storage
    const url = await uploadDocumentToStorage(file);
    
    // 3. Crear metadatos
    const metadata: DocumentMetadata = {
      size: file.size,
      format: file.type,
      filename: file.name,
      url,
      uploadedAt: new Date().toISOString()
    };
    
    return {
      url,
      filename: file.name,
      metadata
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Procesa múltiples documentos
 */
export async function processDocuments(files: File[]): Promise<ProcessedDocument[]> {
  if (files.length > DOCUMENT_CONFIG.MAX_DOCUMENTS_PER_MESSAGE) {
    throw new Error(`Máximo ${DOCUMENT_CONFIG.MAX_DOCUMENTS_PER_MESSAGE} documentos por mensaje`);
  }
  
  const promises = files.map(file => processDocument(file));
  return Promise.all(promises);
}

/**
 * Valida si un tipo de archivo es un documento soportado
 */
export function isDocumentFile(file: File): boolean {
  return DOCUMENT_CONFIG.SUPPORTED_FORMATS.includes(file.type);
}

/**
 * Filtra solo archivos de documento de una lista de archivos
 */
export function filterDocumentFiles(files: FileList | File[]): File[] {
  const fileArray = Array.from(files);
  return fileArray.filter(isDocumentFile);
}

/**
 * Obtiene el icono apropiado para un tipo de documento
 */
export function getDocumentIcon(mimeType: string): string {
  const iconMap: Record<string, string> = {
    'application/pdf': '📄',
    'application/msword': '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📽️',
    'text/plain': '📄',
    'application/rtf': '📝'
  };
  
  return iconMap[mimeType] || '📄';
}

/**
 * Obtiene el nombre del tipo de documento
 */
export function getDocumentTypeName(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'text/plain': 'TXT',
    'application/rtf': 'RTF'
  };
  
  return typeMap[mimeType] || 'Document';
}

/**
 * Formatea el tamaño de archivo para mostrar
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
