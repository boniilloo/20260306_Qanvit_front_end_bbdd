import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface RFXPublicPlaceholderPageProps {
  section: 'candidates' | 'sending' | 'responses';
}

const sectionConfig: Record<RFXPublicPlaceholderPageProps['section'], { title: string; description: string }> = {
  candidates: {
    title: 'Select Candidates (Public View)',
    description:
      'This public example shows how the candidate selection step fits into the overall RFX workflow. In a real project, this is where you would review and shortlist suppliers based on technical and company requirements.',
  },
  sending: {
    title: 'Validation & Sending (Public View)',
    description:
      'This step covers the internal validation of specifications, team approvals, NDA management, and sending the RFX to selected suppliers. In this public example, the content is read-only.',
  },
  responses: {
    title: 'Responses and Analysis (Public View)',
    description:
      'In a real RFX, this is where you would review supplier proposals, compare offers, and make final decisions. This public example keeps all supplier data private and only exposes the workflow.',
  },
};

const RFXPublicPlaceholderPage: React.FC<RFXPublicPlaceholderPageProps> = ({ section }) => {
  const { id: rfxId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const config = sectionConfig[section];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl flex-1">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => navigate(rfxId ? `/rfx-example/${rfxId}` : '/')}
            className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white border-[#1A1F2C]"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to RFX Overview
          </Button>
        </div>

        <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-[#1A1F2C]">
              <Sparkles className="h-5 w-5 text-[#80c8f0]" />
              {config.title}
            </CardTitle>
            <CardDescription>
              {config.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 leading-relaxed">
              For privacy and data protection reasons, this public example does not expose real supplier data,
              NDAs, or internal validation details. It is designed to let you explore the workflow and understand
              how RFXs move from specifications to supplier invitations and final analysis.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RFXPublicPlaceholderPage;


