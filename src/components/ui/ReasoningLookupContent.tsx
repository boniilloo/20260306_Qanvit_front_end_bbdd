import React, { useEffect, useRef } from 'react';
import { EvaluationToolsPreambleData } from '@/types/chat';

interface ReasoningLookupContentProps {
  data: EvaluationToolsPreambleData;
}

interface MarqueeLineProps {
  items: string[];
  title: string;
  icon: string;
}

const MarqueeLine = ({ items, title, icon }: MarqueeLineProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);
  const [duration, setDuration] = React.useState<number>(25);

  // Inject keyframes once
  useEffect(() => {
    if (!document.getElementById('fq-marquee-style')) {
      const style = document.createElement('style');
      style.id = 'fq-marquee-style';
      style.textContent = `
        @keyframes fq-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .fq-marquee { display:inline-block; white-space:nowrap; will-change: transform; animation-name: fq-marquee; animation-timing-function: linear; animation-iteration-count: infinite; transform: translate3d(0,0,0); }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Recalculate duration based on content width for consistent speed
  useEffect(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (track && container) {
      const halfWidth = track.scrollWidth / 2; // because duplicated
      const speedPxPerSec = 80; // pixels/second
      const d = Math.max(12, halfWidth / speedPxPerSec);
      setDuration(d);
    }
  }, [items.join('|')]);

  const separator = ' • ';
  const sequence = items.join(separator);
  const line = (
    <div ref={trackRef} className="fq-marquee inline-flex items-center" style={{ animationDuration: `${duration}s`, animationPlayState: paused ? 'paused' : 'running' }}>
      <span className="text-sm leading-none text-blue-800 whitespace-nowrap pr-8">{sequence}</span>
      <span className="text-sm leading-none text-blue-800 whitespace-nowrap pr-8">{sequence}</span>
    </div>
  );

  return (
    <div>
      <h5 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-2">
        <span>{icon}</span> {title}
        <span className="text-xs text-blue-600 bg-blue-200 px-2 py-1 rounded-full ml-2">{items.length}</span>
      </h5>
      <div
        ref={containerRef}
        className="relative block w-full max-w-full min-w-0 overflow-hidden whitespace-nowrap border border-blue-100 rounded-lg bg-blue-50/40 flex items-center h-9 py-1"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          maskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          contain: 'paint',
          isolation: 'isolate'
        }}
      >
        {line}
      </div>
    </div>
  );
};

const ReasoningLookupContent = ({ data }: ReasoningLookupContentProps) => {
  return (
    <div className="space-y-3">
      {/* Text content */}
      {data.text && (
        <p className="text-sm text-blue-800 leading-relaxed">
          {data.text}
        </p>
      )}
      
      {/* Product names marquee */}
      {data.products && data.products.length > 0 && (
        <MarqueeLine 
          items={data.products}
          title="Products"
          icon="📦"
        />
      )}
      
      {/* Company names marquee */}
      {data.companies && data.companies.length > 0 && (
        <MarqueeLine 
          items={data.companies}
          title="Companies"
          icon="🏢"
        />
      )}
    </div>
  );
};

export default ReasoningLookupContent;
