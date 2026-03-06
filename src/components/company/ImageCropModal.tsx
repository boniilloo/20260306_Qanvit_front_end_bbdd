import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface ImageCropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

// Fixed output size
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 270; // ~4.74:1 aspect ratio

// Minimum and maximum zoom multipliers
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  open,
  onOpenChange,
  file,
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extra transforms
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [flipX, setFlipX] = useState<boolean>(false);
  const [flipY, setFlipY] = useState<boolean>(false);

  // Transform state
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);

  // Drag state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      imageRef.current = null;
      return;
    }

    setIsLoading(true);
    setError(null);
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Reset transforms based on image aspect
      const scaleToFit = Math.max(OUTPUT_WIDTH / img.width, OUTPUT_HEIGHT / img.height);
      setZoom(scaleToFit);
      setOffsetX(0);
      setOffsetY(0);
      setRotationDeg(0);
      setFlipX(false);
      setFlipY(false);
      setIsLoading(false);
      draw();
    };
    img.onerror = () => {
      setIsLoading(false);
      setError('Failed to load image');
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx) return;

    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;

    // Fill background white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!img) return;

    const drawWidth = img.width * zoom;
    const drawHeight = img.height * zoom;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    // Move to center of canvas
    ctx.translate(canvas.width / 2, canvas.height / 2);
    // Apply screen-space offset before rotation so dragging feels natural
    ctx.translate(offsetX, offsetY);
    // Apply rotation
    const angleRad = (rotationDeg % 360) * Math.PI / 180;
    ctx.rotate(angleRad);
    // Apply flips
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    // Draw image centered
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  };

  // Redraw on transform changes
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, offsetX, offsetY]);

  // Pointer handlers for drag
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startOffsetRef.current = { x: offsetX, y: offsetY };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffsetX(startOffsetRef.current.x + dx);
    setOffsetY(startOffsetRef.current.y + dy);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  // Wheel to zoom (Ctrl/Cmd + wheel for precision)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const step = (e.ctrlKey || e.metaKey) ? 0.0015 : 0.01;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta * step)));
  };

  const isRotated = (rotationDeg % 180) !== 0;

  const handleFitWidth = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    const effectiveWidth = isRotated ? img.height : img.width;
    const z = OUTPUT_WIDTH / effectiveWidth;
    setZoom(z);
    setOffsetX(0);
    setOffsetY(0);
  }, [isRotated]);

  const handleFitHeight = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    const effectiveHeight = isRotated ? img.width : img.height;
    const z = OUTPUT_HEIGHT / effectiveHeight;
    setZoom(z);
    setOffsetX(0);
    setOffsetY(0);
  }, [isRotated]);

  const handleRotate90 = () => {
    setRotationDeg((d) => (d + 90) % 360);
  };

  const handleFlipHorizontal = () => {
    setFlipX((f) => !f);
  };

  const handleFlipVertical = () => {
    setFlipY((f) => !f);
  };

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => {
      draw();
      resolve();
    }));
    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to generate image'));
        onConfirm(blob);
        resolve();
      }, 'image/jpeg', 0.92);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Crop cover image (1280x270)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleFitWidth}>Fit Width</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleFitHeight}>Fit Height</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRotate90}>Rotate 90°</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleFlipHorizontal}>Flip Horizontal</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleFlipVertical}>Flip Vertical</Button>
          </div>
          <div
            ref={containerRef}
            className="relative w-full border rounded-lg bg-white overflow-hidden"
            style={{ height: 360 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <canvas ref={canvasRef} className="max-w-full h-auto" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            {/* Overlay with target aspect outline */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 border-2 border-black/10" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Zoom</span>
            <Slider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.001}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0])}
              className="flex-1"
            />
            <span className="text-sm tabular-nums w-16 text-right">{zoom.toFixed(2)}×</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading || !!error}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropModal;


