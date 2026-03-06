
import React, { memo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BadgeCheck } from "lucide-react";

interface SupplierCardProps {
  item: {
    name: string;
    country: string;
    core_capability: string;
    fit_score: number;
  };
}

const SupplierCard = memo(({ item }: SupplierCardProps) => {
  const { name, country, core_capability, fit_score } = item;

  return (
    <Card className="w-full rounded-2xl shadow-sm hover:shadow-xl
                     transition-shadow duration-300 bg-gradient-to-br
                     from-white to-sky/5 border-0">
      <CardContent className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-navy">{name}</h3>
          <BadgeCheck className="w-5 h-5 text-mint" />
        </div>

        <p className="text-sm text-charcoal/70 mt-2 mb-4">
          <span className="font-medium">Capability:</span> {core_capability}
        </p>

        <div className="text-sm">
          <p className="text-charcoal/60">Country</p>
          <p className="font-medium text-navy">{country}</p>
        </div>

        <div className="mt-2">
          <div className="text-xs text-charcoal/60 mb-1">Supplier Score</div>
          <Progress value={fit_score} className="h-2 mb-4" />
        </div>

        <button
          className="mt-4 py-2 w-full bg-mint text-navy rounded-xl
                     font-semibold hover:bg-mint/90 transition-colors"
          tabIndex={0}
          aria-label="Invite supplier to RFX"
        >
          Invite to RFX
        </button>
      </CardContent>
    </Card>
  );
});

SupplierCard.displayName = 'SupplierCard';

export default SupplierCard;
