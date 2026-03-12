import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Code, Link as LinkIcon, Underline, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Shrink } from 'lucide-react';
import { useEditor, EditorContent, BubbleMenu, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import TurndownService from 'turndown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';
import { toast } from '@/hooks/use-toast';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  onTodoCountChange?: (count: number) => void;
  onFocus?: () => void;
  activeTodoIndex?: number; // Índice del TODO activo para resaltar (relativo al campo)
  todoOffset?: number; // Offset base para los índices globales de TODOs
  disabled?: boolean; // Si es true, el editor es de solo lectura
  imageUploadConfig?: {
    enabled?: boolean;
    rfxId?: string;
    isEncrypted?: boolean;
    encryptFile?: (fileBuffer: ArrayBuffer) => Promise<{ iv: string; data: ArrayBuffer } | null>;
    decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;
  };
  onInlineImageUploaded?: (url: string) => void;
}

const extractWidthPercentFromTitle = (title?: string): number | null => {
  if (!title) return null;
  const match = title.match(/w=(\d{1,3})/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(10, Math.round(parsed)));
};

const buildWidthTitle = (percent: number) => `w=${Math.min(100, Math.max(10, Math.round(percent)))}`;

const ResizableImageNodeView = ({
  node,
  selected,
  updateAttributes,
  extension,
}: NodeViewProps) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [displaySrc, setDisplaySrc] = useState<string>(node.attrs.src || '');

  useEffect(() => {
    const src = (node.attrs.src as string) || '';
    const isEncryptedImage = src.split('?')[0].toLowerCase().endsWith('.enc');
    const decryptFile = extension.options.decryptFile as
      | ((encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>)
      | undefined;
    const isEncrypted = Boolean(extension.options.isEncrypted);

    let mounted = true;
    let objectUrl: string | null = null;

    const resolveSrc = async () => {
      if (!src) {
        if (mounted) setDisplaySrc('');
        return;
      }
      if (!isEncrypted || !isEncryptedImage || !decryptFile) {
        if (mounted) setDisplaySrc(src);
        return;
      }
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch encrypted image (${response.status})`);
        const encryptedBuffer = await response.arrayBuffer();
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        const decrypted = await decryptFile(dataBytes, ivBase64);
        if (!decrypted) throw new Error('Failed to decrypt inline image');

        const lower = src.split('?')[0].toLowerCase().replace(/\.enc$/, '');
        let mimeType = 'image/jpeg';
        if (lower.endsWith('.png')) mimeType = 'image/png';
        else if (lower.endsWith('.webp')) mimeType = 'image/webp';
        else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) mimeType = 'image/tiff';

        objectUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
        if (mounted) setDisplaySrc(objectUrl);
      } catch (error) {
        console.error('❌ [MarkdownEditor] NodeView decrypt failed:', error);
        if (mounted) setDisplaySrc(src);
      }
    };

    resolveSrc();
    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [node.attrs.src, extension.options.decryptFile, extension.options.isEncrypted]);

  const resizeFromCorner = (event: React.MouseEvent<HTMLButtonElement>, direction: 1 | -1) => {
    event.preventDefault();
    event.stopPropagation();
    if (!imgRef.current) return;

    const startX = event.clientX;
    const startWidthPx = imgRef.current.getBoundingClientRect().width;
    const container = imgRef.current.closest('.ProseMirror') as HTMLElement | null;
    const containerWidth = container?.getBoundingClientRect().width || startWidthPx;
    if (containerWidth <= 0) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) * direction;
      const nextWidthPx = Math.min(containerWidth, Math.max(60, startWidthPx + deltaX));
      const nextPercent = Math.round((nextWidthPx / containerWidth) * 100);
      updateAttributes({
        width: `${Math.min(100, Math.max(10, nextPercent))}%`,
        title: buildWidthTitle(nextPercent),
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <NodeViewWrapper
      as="div"
      className="relative my-2 w-fit max-w-full"
      style={{ width: node.attrs.width || undefined }}
    >
      <img
        ref={imgRef}
        src={displaySrc}
        alt={node.attrs.alt || 'Inline image'}
        title={node.attrs.title || undefined}
        className="block max-w-full h-auto rounded-lg border border-gray-200"
        style={{ width: '100%' }}
        draggable={false}
      />
      {selected && (
        <>
          <button
            type="button"
            className="absolute -left-1 -bottom-1 h-3 w-3 rounded-sm bg-primary border border-white shadow cursor-ew-resize"
            onMouseDown={(e) => resizeFromCorner(e, -1)}
            aria-label="Resize image from left corner"
          />
          <button
            type="button"
            className="absolute -right-1 -bottom-1 h-3 w-3 rounded-sm bg-primary border border-white shadow cursor-ew-resize"
            onMouseDown={(e) => resizeFromCorner(e, 1)}
            aria-label="Resize image from right corner"
          />
        </>
      )}
    </NodeViewWrapper>
  );
};

const ResizableImageExtension = Image.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      decryptFile: undefined,
      isEncrypted: false,
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const widthFromData = element.getAttribute('data-width');
          if (widthFromData) return widthFromData;
          if (element.style.width) return element.style.width;
          const widthFromTitle = extractWidthPercentFromTitle(element.getAttribute('title') || '');
          return widthFromTitle ? `${widthFromTitle}%` : null;
        },
        renderHTML: (attributes: Record<string, string>) => {
          if (!attributes.width) return {};
          return {
            'data-width': attributes.width,
            style: `width: ${attributes.width}; max-width: 100%; height: auto;`,
          };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

// Extensión para detectar y resaltar TODOs automáticamente
const TodoHighlight = Extension.create({
  name: 'todoHighlight',
  
  addOptions() {
    return {
      activeTodoIndex: -1,
      todoOffset: 0,
    };
  },
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('todoHighlight'),
        state: {
          init(_, { doc }) {
            const activeIndex = this.spec?.options?.activeTodoIndex ?? -1;
            const offset = this.spec?.options?.todoOffset ?? 0;
            return findTodos(doc, activeIndex, offset);
          },
          apply(transaction, oldState) {
            const activeTodoIndex = transaction.getMeta('activeTodoIndex');
            const todoOffset = transaction.getMeta('todoOffset');
            if (activeTodoIndex !== undefined || todoOffset !== undefined) {
              const activeIndex = activeTodoIndex !== undefined ? activeTodoIndex : (this.spec?.options?.activeTodoIndex ?? -1);
              const offset = todoOffset !== undefined ? todoOffset : (this.spec?.options?.todoOffset ?? 0);
              return findTodos(transaction.doc, activeIndex, offset);
            }
            const activeIndex = this.spec?.options?.activeTodoIndex ?? -1;
            const offset = this.spec?.options?.todoOffset ?? 0;
            return transaction.docChanged 
              ? findTodos(transaction.doc, activeIndex, offset) 
              : oldState;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function findTodos(doc: any, activeTodoIndex: number = -1, todoOffset: number = 0) {
  const decorations: Decoration[] = [];
  const todoRegex = /TODO/g;
  let localTodoIndex = 0; // Índice local dentro de este campo
  
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      let match;
      todoRegex.lastIndex = 0;
      while ((match = todoRegex.exec(node.text)) !== null) {
        const from = pos + match.index;
        const to = from + match[0].length;
        const isActive = localTodoIndex === activeTodoIndex && activeTodoIndex !== -1;
        
        // Índice global = offset + índice local
        const globalTodoIndex = todoOffset + localTodoIndex;
        
        // Estilos diferentes para TODO activo vs normal
        const style = isActive
          ? 'background-color: #ff9966; color: #7d2d0a; border: 2px solid #f4a9aa; box-shadow: 0 0 0 3px rgba(128, 200, 240, 0.4); padding: 2px 4px; border-radius: 4px; font-weight: 700;'
          : 'background-color: #fed7aa; color: #c2410c; padding: 1px 2px; border-radius: 2px; font-weight: 500;';
        
        decorations.push(
          Decoration.inline(from, to, {
            class: `todo-highlight ${isActive ? 'todo-active' : ''}`,
            style: style,
            'data-todo-index': String(globalTodoIndex), // Índice global para navegación
          })
        );
        
        localTodoIndex++;
      }
    }
  });
  
  return DecorationSet.create(doc, decorations);
}

// Converts Markdown -> HTML for TipTap to load
async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown || '');
  return String(file);
}

// Converts HTML -> Markdown when emitting changes
function htmlToMarkdown(
  html: string,
  resolveImageSrc?: (src: string, img: HTMLImageElement) => string
): string {
  const turndown = new TurndownService({ headingStyle: 'atx' });
  turndown.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const rawSrc = img.getAttribute('src') || '';
      const src = resolveImageSrc ? resolveImageSrc(rawSrc, img) : rawSrc;
      const alt = img.getAttribute('alt') || '';
      const title = img.getAttribute('title') || '';
      const widthFromTitle = extractWidthPercentFromTitle(title);
      const widthFromStyle = img.style.width?.endsWith('%') ? Number(img.style.width.replace('%', '')) : null;
      const widthFromData = img.getAttribute('data-width')?.endsWith('%')
        ? Number(img.getAttribute('data-width')!.replace('%', ''))
        : null;
      const effectiveWidth = widthFromTitle ?? widthFromData ?? widthFromStyle;
      const normalizedTitle = effectiveWidth ? buildWidthTitle(effectiveWidth) : title;
      if (!src) return '';
      return normalizedTitle ? `![${alt}](${src} "${normalizedTitle}")` : `![${alt}](${src})`;
    },
  });
  return turndown.turndown(html || '');
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  minRows = 4,
  className = '',
  onTodoCountChange,
  onFocus,
  activeTodoIndex = -1,
  todoOffset = 0,
  disabled = false,
  imageUploadConfig,
  onInlineImageUploaded
}) => {
  // Track the last markdown emitted to parent to avoid resetting content during local edits
  const lastEmittedMarkdownRef = useRef<string>(value || '');
  // Debounce timer for emitting onChange
  const updateTimerRef = useRef<number | null>(null);
  // Flag to prevent onUpdate from firing when we're setting content from external value prop
  const isSettingContentRef = useRef<boolean>(false);

  const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobUrlsRef = useRef<string[]>([]);
  const blobToOriginalUrlRef = useRef<Map<string, string>>(new Map());

  const buildInlineImageFileName = (originalName: string) => {
    const safeOriginalName = sanitizeFileName(originalName);
    const encodedOriginalName = encodeURIComponent(safeOriginalName);
    return `${Date.now()}__${encodedOriginalName}`;
  };

  const detectMimeTypeByExtension = (src: string) => {
    const lower = src.split('?')[0].toLowerCase().replace(/\.enc$/, '');
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
    return 'image/jpeg';
  };

  const resolveEncryptedImagesInHtml = async (
    html: string
  ): Promise<{ html: string; blobUrls: string[] }> => {
    if (!imageUploadConfig?.isEncrypted || !imageUploadConfig.decryptFile || !html.includes('<img')) {
      return { html, blobUrls: [] };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = Array.from(doc.querySelectorAll('img[src]'));
    if (images.length === 0) return { html, blobUrls: [] };
    const createdBlobUrls: string[] = [];

    await Promise.all(images.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || !src.split('?')[0].toLowerCase().endsWith('.enc')) return;
      try {
        const response = await fetch(src);
        if (!response.ok) return;
        const encryptedBuffer = await response.arrayBuffer();
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        const decrypted = await imageUploadConfig.decryptFile!(dataBytes, ivBase64);
        if (!decrypted) return;

        const mimeType = detectMimeTypeByExtension(src);
        const blobUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
        createdBlobUrls.push(blobUrl);
        blobToOriginalUrlRef.current.set(blobUrl, src);
        img.setAttribute('src', blobUrl);
      } catch (error) {
        console.error('❌ [MarkdownEditor] Failed to decrypt inline image for editor view:', error);
      }
    }));

    return { html: doc.body.innerHTML, blobUrls: createdBlobUrls };
  };

  const handleInsertImage = async () => {
    if (!editor || disabled) return;
    if (!imageUploadConfig?.enabled) {
      toast({
        title: 'Image upload unavailable',
        description: 'Image upload is disabled for this field.',
        variant: 'destructive',
      });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/tiff,.tif,.tiff';
    input.multiple = false;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const maxSizeBytes = 15 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast({
          title: 'Image too large',
          description: 'Images must be 15MB or smaller.',
          variant: 'destructive',
        });
        return;
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
      const fileNameLower = file.name.toLowerCase();
      const isTiffByExtension = fileNameLower.endsWith('.tif') || fileNameLower.endsWith('.tiff');
      const isAllowedType = allowedTypes.includes(file.type) || (isTiffByExtension && (file.type === '' || file.type === 'application/octet-stream'));
      if (!isAllowedType) {
        toast({
          title: 'Invalid format',
          description: 'Allowed formats: JPEG, PNG, WebP, TIFF.',
          variant: 'destructive',
        });
        return;
      }

      if (!imageUploadConfig.rfxId || !imageUploadConfig.isEncrypted || !imageUploadConfig.encryptFile) {
        toast({
          title: 'Encryption not ready',
          description: 'Cannot upload image securely right now. Try again in a moment.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const fileBuffer = await file.arrayBuffer();
        const encrypted = await imageUploadConfig.encryptFile(fileBuffer);
        if (!encrypted) {
          throw new Error('Failed to encrypt image');
        }

        const ivBuffer = userCrypto.base64ToArrayBuffer(encrypted.iv);
        const combinedBuffer = new Uint8Array(ivBuffer.byteLength + encrypted.data.byteLength);
        combinedBuffer.set(new Uint8Array(ivBuffer), 0);
        combinedBuffer.set(new Uint8Array(encrypted.data), ivBuffer.byteLength);

        const fileExt = file.name.split('.').pop() || 'img';
        const baseName = buildInlineImageFileName(file.name);
        const storagePath = `${imageUploadConfig.rfxId}/specs-inline-images/${baseName}.${fileExt}.enc`;

        const { error } = await supabase.storage
          .from('rfx-images')
          .upload(storagePath, combinedBuffer.buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/octet-stream',
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('rfx-images')
          .getPublicUrl(storagePath);

        editor.chain().focus().setImage({
          src: publicUrl,
          alt: file.name,
          title: buildWidthTitle(100),
          width: '100%',
        }).run();
        onInlineImageUploaded?.(publicUrl);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Could not upload image.';
        console.error('❌ [MarkdownEditor] Error uploading inline image:', error);
        toast({
          title: 'Upload failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    };
    input.click();
  };

  const handleResizeSelectedImage = () => {
    if (!editor || disabled) return;
    if (!editor.isActive('image')) {
      toast({
        title: 'Select an image first',
        description: 'Click on an inline image before resizing it.',
      });
      return;
    }

    const currentTitle = (editor.getAttributes('image').title as string | undefined) || '';
    const currentWidthMatch = currentTitle.match(/w=(\d{1,3})/);
    const currentWidth = currentWidthMatch ? currentWidthMatch[1] : '100';
    const widthInput = window.prompt('Image width (%) from 10 to 100', currentWidth);
    if (widthInput === null) return;

    const parsed = Number(widthInput);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 100) {
      toast({
        title: 'Invalid size',
        description: 'Use a number between 10 and 100.',
        variant: 'destructive',
      });
      return;
    }

    const rounded = Math.round(parsed);
    editor
      .chain()
      .focus()
      .updateAttributes('image', { title: `w=${rounded}`, width: `${rounded}%` })
      .run();
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineExtension,
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      ResizableImageExtension.configure({
        inline: false,
        allowBase64: false,
        decryptFile: imageUploadConfig?.decryptFile,
        isEncrypted: imageUploadConfig?.isEncrypted,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-3',
        },
      }),
      TodoHighlight.configure({ activeTodoIndex, todoOffset }),
    ],
    content: '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      if (disabled) return;
      // Don't emit changes when we're setting content from external value prop
      if (isSettingContentRef.current) {
        return;
      }
      const html = editor.getHTML();
      const md = htmlToMarkdown(html, (src) => {
        if (src.startsWith('blob:')) {
          return blobToOriginalUrlRef.current.get(src) || src;
        }
        return src;
      });
      // Only emit when markdown actually changed vs last emitted
      if (md !== lastEmittedMarkdownRef.current) {
        lastEmittedMarkdownRef.current = md;
        // Debounce parent updates to reduce rerenders while typing
        if (updateTimerRef.current) {
          window.clearTimeout(updateTimerRef.current);
        }
        updateTimerRef.current = window.setTimeout(() => {
          onChange(md);
        }, 120);
      }
      highlightTodos();
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none leading-relaxed prose-h1:text-xl prose-h1:font-bold prose-h2:text-lg prose-h2:font-semibold prose-h3:text-base prose-h3:font-semibold prose-strong:font-semibold prose-ul:list-disc prose-ol:list-decimal prose-li:my-0 prose-li:leading-tight',
        style: `min-height: ${Math.max(100, minRows * 24)}px;`,
      },
    },
  });

  // Función para resaltar TODOs en el editor
  const highlightTodos = () => {
    if (!editor) return;

    const text = editor.getText();
    const todoMatches = [...text.matchAll(/TODO/g)];
    
    // Notificar el conteo de TODOs
    if (onTodoCountChange) {
      onTodoCountChange(todoMatches.length);
    }
  };

  // Load external markdown into editor as HTML
  useEffect(() => {
    if (!editor) return;
    // If the editor is focused, assume user is typing; don't reset content
    if (editor.isFocused) {
      return;
    }
    
    // Set flag IMMEDIATELY (synchronously) to prevent any onUpdate from firing
    // This must happen BEFORE any async operations
    isSettingContentRef.current = true;
    // Update the lastEmittedMarkdownRef to the new value to prevent re-emitting
    lastEmittedMarkdownRef.current = value || '';
    
    let isMounted = true;
    (async () => {
      const html = await markdownToHtml(value || '');
      const { html: htmlWithResolvedImages, blobUrls: createdBlobUrls } = await resolveEncryptedImagesInHtml(html);
      if (!isMounted) {
        createdBlobUrls.forEach((url) => {
          URL.revokeObjectURL(url);
          blobToOriginalUrlRef.current.delete(url);
        });
        isSettingContentRef.current = false;
        return;
      }
      const currentHTML = editor.getHTML();
      // Only set when different to avoid cursor jumps
      if (currentHTML !== htmlWithResolvedImages) {
        blobUrlsRef.current.forEach((url) => {
          URL.revokeObjectURL(url);
          blobToOriginalUrlRef.current.delete(url);
        });
        blobUrlsRef.current = createdBlobUrls;
        editor.commands.setContent(htmlWithResolvedImages, false);
        // Clear flag after a short delay to allow the update to complete
        setTimeout(() => {
          isSettingContentRef.current = false;
        }, 50);
        // Contar TODOs después de cargar el contenido
        setTimeout(() => {
          if (isMounted) {
            highlightTodos();
          }
        }, 100);
      } else {
        createdBlobUrls.forEach((url) => {
          URL.revokeObjectURL(url);
          blobToOriginalUrlRef.current.delete(url);
        });
        // Clear flag immediately if no content change needed
        isSettingContentRef.current = false;
      }
    })();
    return () => {
      isMounted = false;
      // Ensure flag is cleared on cleanup
      isSettingContentRef.current = false;
    };
  }, [value, editor]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
        blobToOriginalUrlRef.current.delete(url);
      });
      blobUrlsRef.current = [];
    };
  }, []);

  // Update TODO decorations when activeTodoIndex or todoOffset changes
  useEffect(() => {
    if (!editor) return;
    const { state, view } = editor;
    const tr = state.tr
      .setMeta('activeTodoIndex', activeTodoIndex)
      .setMeta('todoOffset', todoOffset);
    view.dispatch(tr);
  }, [activeTodoIndex, todoOffset, editor]);

  // Update editor editable state when disabled prop changes
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  const toolbar = useMemo(() => ([
    { icon: Heading1, label: 'H1', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor?.isActive('heading', { level: 1 }) },
    { icon: Heading2, label: 'H2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor?.isActive('heading', { level: 2 }) },
    { icon: Heading3, label: 'H3', action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), isActive: () => editor?.isActive('heading', { level: 3 }) },
    { icon: Bold, label: 'Bold', action: () => editor?.chain().focus().toggleBold().run(), isActive: () => editor?.isActive('bold') },
    { icon: Italic, label: 'Italic', action: () => editor?.chain().focus().toggleItalic().run(), isActive: () => editor?.isActive('italic') },
    { icon: Underline, label: 'Underline', action: () => editor?.chain().focus().toggleUnderline().run(), isActive: () => editor?.isActive('underline') },
    { icon: List, label: 'Bullet List', action: () => editor?.chain().focus().toggleBulletList().run(), isActive: () => editor?.isActive('bulletList') },
    { icon: ListOrdered, label: 'Ordered List', action: () => editor?.chain().focus().toggleOrderedList().run(), isActive: () => editor?.isActive('orderedList') },
    { icon: Quote, label: 'Blockquote', action: () => editor?.chain().focus().toggleBlockquote().run(), isActive: () => editor?.isActive('blockquote') },
    { icon: Code, label: 'Code', action: () => editor?.chain().focus().toggleCode().run(), isActive: () => editor?.isActive('code') },
    { icon: AlignLeft, label: 'Left', action: () => editor?.chain().focus().setTextAlign('left').run(), isActive: () => editor?.isActive({ textAlign: 'left' }) },
    { icon: AlignCenter, label: 'Center', action: () => editor?.chain().focus().setTextAlign('center').run(), isActive: () => editor?.isActive({ textAlign: 'center' }) },
    { icon: AlignRight, label: 'Right', action: () => editor?.chain().focus().setTextAlign('right').run(), isActive: () => editor?.isActive({ textAlign: 'right' }) },
    { icon: ImageIcon, label: 'Insert image', action: handleInsertImage, isActive: () => false },
    { icon: Shrink, label: 'Resize selected image', action: handleResizeSelectedImage, isActive: () => editor?.isActive('image') || false },
    { icon: LinkIcon, label: 'Link', action: () => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('URL', previousUrl || 'https://');
        if (url === null) return;
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }, isActive: () => editor?.isActive('link') },
  ]), [editor, handleInsertImage]);

  // Global floating toolbar: shows at top of page while this editor has focus
  const [hasFocus, setHasFocus] = useState(false);
  const [globalTopOffset, setGlobalTopOffset] = useState(0);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [globalToolbarBox, setGlobalToolbarBox] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    if (!editor) return;
    const handleFocus = () => {
      setHasFocus(true);
      if (onFocus) {
        onFocus();
      }
    };
    const onBlur = () => {
      // Defer hiding while interacting with toolbar to preserve selection
      setTimeout(() => {
        if (!editor.isFocused && !isInteractingWithToolbarRef.current) {
          setHasFocus(false);
        }
      }, 0);
    };
    editor.on('focus', handleFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('focus', handleFocus);
      editor.off('blur', onBlur);
    };
  }, [editor, onFocus]);

  useEffect(() => {
    const computeOffset = () => {
      const candidates: Element[] = [
        ...Array.from(document.querySelectorAll('header')),
        ...Array.from(document.querySelectorAll('.mobile-header')),
        ...Array.from(document.querySelectorAll('[data-fixed-header="true"]')),
      ];
      let offset = 0;
      candidates.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed') {
          const rect = el.getBoundingClientRect();
          if (Math.round(rect.top) <= 0) {
            offset = Math.max(offset, rect.height);
          }
        }
      });
      setGlobalTopOffset(offset > 0 ? offset + 6 : 6);
    };
    computeOffset();
    window.addEventListener('scroll', computeOffset, { passive: true });
    window.addEventListener('resize', computeOffset);
    return () => {
      window.removeEventListener('scroll', computeOffset);
      window.removeEventListener('resize', computeOffset);
    };
  }, []);

  // Track the editor container position and width to align the global toolbar
  useEffect(() => {
    const recompute = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setGlobalToolbarBox({ left: rect.left, width: rect.width });
    };
    recompute();
    window.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, []);

  const isInteractingWithToolbarRef = useRef(false);

  return (
    <div ref={anchorRef} className={`space-y-2 ${className}`}>
      {/* Global top floating toolbar via portal, only while focused */}
      {hasFocus && createPortal(
        <div className="z-[90]"
             style={{ position: 'fixed', top: globalTopOffset, left: globalToolbarBox.left, width: globalToolbarBox.width }}
        >
              <div className="flex flex-wrap gap-1 p-2 bg-white/95 backdrop-blur border border-gray-200 rounded-md shadow-md"
                   onMouseDown={(e) => {
                     // Avoid losing editor selection when clicking toolbar
                     e.preventDefault();
                     isInteractingWithToolbarRef.current = true;
                   }}
                   onMouseUp={() => {
                     // Allow blur after interaction
                     setTimeout(() => { isInteractingWithToolbarRef.current = false; }, 0);
                   }}
              >
                {toolbar.map((btn, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    variant={btn.isActive && btn.isActive() ? 'secondary' : 'ghost'}
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      editor?.chain().focus();
                      btn.action();
                    }}
                    title={btn.label}
                    className="h-8 w-8 p-0"
                  >
                    <btn.icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
        </div>,
        document.body
      )}
      {/* Local toolbar (kept simple, non-floating) */}
      {!disabled && (
        <div className="flex flex-wrap gap-1 p-2 bg-white rounded-t-md border border-b-0 border-gray-200"
             onMouseDown={(e) => e.preventDefault()}
        >
          {toolbar.map((btn, idx) => (
            <Button
              key={idx}
              type="button"
              variant={btn.isActive && btn.isActive() ? 'secondary' : 'ghost'}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                editor?.chain().focus();
                btn.action();
              }}
              title={btn.label}
              className="h-8 w-8 p-0"
            >
              <btn.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      )}
      <div className={`rounded-b-md border border-gray-200 bg-white px-3 py-2 relative ${disabled ? 'rounded-t-md' : ''}`}>
        {editor && !disabled && (
          <BubbleMenu editor={editor} tippyOptions={{ duration: 150, maxWidth: 'none' }}>
            <div className="flex items-center gap-1 p-1 rounded-md border border-gray-200 bg-white shadow-md">
              <Button type="button" variant={editor.isActive('bold') ? 'secondary' : 'ghost'} size="sm" onClick={() => editor.chain().focus().toggleBold().run()} className="h-7 w-7 p-0" title="Bold">
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant={editor.isActive('italic') ? 'secondary' : 'ghost'} size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} className="h-7 w-7 p-0" title="Italic">
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant={editor.isActive('underline') ? 'secondary' : 'ghost'} size="sm" onClick={() => editor.chain().focus().toggleUnderline().run()} className="h-7 w-7 p-0" title="Underline">
                <Underline className="h-3.5 w-3.5" />
              </Button>
              <div className="mx-1 h-5 w-px bg-gray-200" />
              <Button type="button" variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'} size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className="h-7 px-1 text-xs" title="H1">H1</Button>
              <Button type="button" variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'} size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className="h-7 px-1 text-xs" title="H2">H2</Button>
              <div className="mx-1 h-5 w-px bg-gray-200" />
              <Button type="button" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="sm" onClick={() => {
                const previousUrl = editor.getAttributes('link').href as string | undefined;
                const url = window.prompt('URL', previousUrl || 'https://');
                if (url === null) return;
                if (url === '') {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  return;
                }
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              }} className="h-7 w-7 p-0" title="Link">
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default MarkdownEditor;

