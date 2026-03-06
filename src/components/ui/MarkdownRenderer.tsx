import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { userCrypto } from '@/lib/userCrypto';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;
  isEncrypted?: boolean;
}

const parseMimeTypeFromSource = (src: string) => {
  const lower = src.split('?')[0].toLowerCase().replace(/\.enc$/, '');
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
};

const parseWidthPercent = (title?: string) => {
  if (!title) return 100;
  const match = title.match(/w=(\d{1,3})/i);
  if (!match) return 100;
  const width = Number(match[1]);
  if (!Number.isFinite(width)) return 100;
  return Math.min(100, Math.max(10, width));
};

const isSafeImageUrl = (src: string) => {
  try {
    if (!src) return false;
    if (src.startsWith('blob:') || src.startsWith('data:image/')) return true;
    const url = new URL(src);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const MarkdownInlineImage = ({
  src = '',
  alt = '',
  title,
  decryptFile,
  isEncrypted = false,
}: {
  src?: string;
  alt?: string;
  title?: string;
  decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;
  isEncrypted?: boolean;
}) => {
  const widthPercent = parseWidthPercent(title);

  const [resolvedSrc, setResolvedSrc] = useState<string>(src || '');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canDecrypt = useMemo(() => {
    const normalized = (src || '').split('?')[0].toLowerCase();
    return !!decryptFile && isEncrypted && normalized.endsWith('.enc');
  }, [decryptFile, isEncrypted, src]);

  useEffect(() => {
    let mounted = true;
    let objectUrl: string | null = null;

    const loadEncryptedImage = async () => {
      setLoadError(null);
      if (!src || !isSafeImageUrl(src)) {
        setLoadError('Invalid image URL');
        setResolvedSrc('');
        return;
      }

      if (!canDecrypt || !decryptFile) {
        setResolvedSrc(src);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
        const encryptedBuffer = await response.arrayBuffer();

        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        const decrypted = await decryptFile(dataBytes, ivBase64);
        if (!decrypted) throw new Error('Failed to decrypt image');

        const mimeType = parseMimeTypeFromSource(src);
        const blob = new Blob([decrypted], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        if (!mounted) return;
        setResolvedSrc(objectUrl);
      } catch (error) {
        console.error('❌ [MarkdownRenderer] Inline image error:', error);
        if (mounted) {
          setLoadError('Image unavailable');
          setResolvedSrc('');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadEncryptedImage();

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, canDecrypt, decryptFile]);

  if (isLoading) {
    return <span className="inline-block text-xs text-gray-500">Loading image...</span>;
  }

  if (loadError || !resolvedSrc) {
    return <span className="inline-block text-xs text-red-500">{loadError || 'Image unavailable'}</span>;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt || 'Inline image'}
      title={title}
      loading="lazy"
      className="h-auto rounded-lg border border-gray-200 my-2"
      style={{ width: `${widthPercent}%`, maxWidth: '100%' }}
      onError={() => setLoadError('Image unavailable')}
    />
  );
};

const MarkdownRenderer = ({ content, className = '', decryptFile, isEncrypted = false }: MarkdownRendererProps) => {
  // Pre-process content to handle numbered lists with parentheses
  const processContent = (text: string) => {
    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      const trimmedLine = line.trim();
      // Convert numbered lists with parentheses to proper markdown format
      if (/^\d+\)\s/.test(trimmedLine)) {
        // Convert "1) " to "1. " for proper markdown rendering
        return line.replace(/^(\d+)\)\s/, '$1. ');
      }
      return line;
    });
    return processedLines.join('\n');
  };

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      components={{
        // Custom link styling
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline"
            {...props}
          >
            {children}
          </a>
        ),
        // Custom heading styles
        h1: ({ children, ...props }) => (
          <h1 className="text-xl font-extrabold text-foreground mb-4" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-lg font-semibold text-foreground mb-3" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-base font-semibold text-foreground mb-2" {...props}>
            {children}
          </h3>
        ),
        // Custom paragraph styling
        p: ({ children, ...props }) => (
          <p className="text-sm text-gray-700 leading-relaxed mb-3" {...props}>
            {children}
          </p>
        ),
        // List styling similar to TipTap editor output
        ul: ({ children, ...props }) => (
          <ul className="mb-3 space-y-1 list-disc pl-6" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="mb-3 space-y-1 list-decimal pl-6" {...props}>
            {children}
          </ol>
        ),
        // Custom strong/bold styling
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-foreground" {...props}>
            {children}
          </strong>
        ),
        // Custom emphasis styling
        em: ({ children, ...props }) => (
          <em className="italic text-gray-600" {...props}>
            {children}
          </em>
        ),
        // Custom code styling
        code: ({ children, ...props }) => (
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>
            {children}
          </code>
        ),
        // Custom blockquote styling
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic text-gray-600 my-3" {...props}>
            {children}
          </blockquote>
        ),
        img: ({ src, alt, title }) => (
          <MarkdownInlineImage
            src={src}
            alt={alt}
            title={title}
            decryptFile={decryptFile}
            isEncrypted={isEncrypted}
          />
        ),
      }}
    >
        {processContent(content)}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;