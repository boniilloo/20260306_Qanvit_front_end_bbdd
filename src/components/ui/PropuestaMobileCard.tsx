import React, { useMemo, useState } from 'react';
import SmartLogo from './SmartLogo';
import type { Propuesta } from '@/types/chat';
import { ArrowRight } from 'lucide-react';
import PropuestaDetailsModal from './PropuestaDetailsModal';

type SortType = 'overall' | 'technical' | 'company';

interface PropuestaMobileCardProps {
  propuesta: Propuesta;
  sortType: SortType;
}

const PropuestaMobileCard: React.FC<PropuestaMobileCardProps> = ({ propuesta, sortType }) => {
  const [open, setOpen] = useState(false);

  const scores = useMemo(() => {
    const technical = propuesta.match;
    const company = propuesta.company_match ?? propuesta.match;
    const overall = (propuesta.company_match !== undefined && propuesta.company_match !== null)
      ? Math.round((propuesta.match + propuesta.company_match) / 2)
      : propuesta.match;
    return { technical, company, overall };
  }, [propuesta.match, propuesta.company_match]);

  const mainPercent = sortType === 'technical' ? scores.technical : sortType === 'company' ? scores.company : scores.overall;

  return (
    <>
      <div
        className="w-full max-w-full bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer overflow-hidden"
        onClick={() => setOpen(true)}
      >
        <SmartLogo
          logoUrl={undefined}
          websiteUrl={propuesta.website}
          companyName={propuesta.empresa}
          size="md"
          className="rounded-xl"
          isSupplierRoute={true}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#1b2c4a] truncate">{propuesta.empresa}</div>
              {propuesta.producto && (
                <div className="text-xs text-gray-600 truncate">{propuesta.producto}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold text-[#1b2c4a]">{mainPercent}%</div>
              <div className="text-[10px] uppercase text-gray-500">
                {sortType === 'technical' ? 'Tech' : sortType === 'company' ? 'Company' : 'Overall'}
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-1 text-xs text-sky-700">
            <span>FQ Match reasoning</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      <PropuestaDetailsModal open={open} onOpenChange={setOpen} propuesta={propuesta} />
    </>
  );
};

export default PropuestaMobileCard;


