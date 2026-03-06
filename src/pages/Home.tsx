import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePublicRFXs } from '@/hooks/usePublicRFXs';
import VerticalSelector from '@/components/ui/VerticalSelector';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import RFXFooter from '@/components/rfx/RFXFooter';
import ExampleCard from '@/components/ExampleCard';

const Home = () => {
  const navigate = useNavigate();
  const { publicRfxs, loading: rfxsLoading } = usePublicRFXs();
  const DEFAULT_PUBLIC_RFX_EXAMPLE_ID = 'eac78558-4c3e-4d05-847e-a954c469868a';

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
      <VerticalSelector showPromptLibrary={false} />
      <div className="w-full relative overflow-hidden flex flex-col items-center justify-center flex-1">
        <div className="w-full px-4 sm:px-6 py-8 sm:py-12 relative z-10 flex flex-col items-center justify-center">
          {/* Simplified Header */}
          <div className="text-center mb-4 sm:mb-6 max-w-4xl mx-auto w-full">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#80c8f0] mb-4 leading-tight">
              Your AI assistant <span className="text-[#1b2c4a]">for launching industrial sourcing projects</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-6">
              Define your needs, discover verified suppliers and launch your RFQ, RFP or RFI in just one click
            </p>
            <div className="flex items-center justify-center">
              <button
                onClick={() => navigate('/rfxs')}
                className="group relative px-6 py-3 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] text-white font-semibold text-base rounded-xl shadow-lg hover:shadow-2xl hover:shadow-[#80c8f0]/50 transition-all duration-300 hover:-translate-y-1 hover:scale-105 active:scale-100 overflow-hidden whitespace-nowrap shrink-0"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Start a new RFX
                  <svg
                    className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </span>
                {/* Hover effect overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#1b2c4a] to-[#1A1F2C] opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>

          {/* RFX Agent Section */}
          <div className="max-w-4xl mx-auto mt-4 px-4 w-full">
          <Card className="border border-gray-300 shadow-sm">
            <CardContent className="p-6">
              <div className="text-center md:text-left mb-4">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1b2c4a] mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#80c8f0]" />
                  RFX Agent
                </h2>
                <p className="text-base sm:text-lg text-gray-600">
                  Define, send and manage your RFXs
                </p>
              </div>
              
              {rfxsLoading && publicRfxs.length === 0 ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-3">
                        <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="w-full h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : publicRfxs.length > 0 ? (
                <Carousel
                  opts={{
                    align: 'start',
                    loop: true,
                  }}
                  className="w-full relative"
                >
                  <CarouselContent className="-ml-2">
                    {publicRfxs.map((pr) => (
                      <CarouselItem
                        key={pr.id}
                        className="pl-2 basis-full sm:basis-1/2 md:basis-1/3"
                      >
                        <ExampleCard
                          title={pr.title || pr.rfx?.name || 'RFX Example'}
                          description={pr.description || pr.rfx?.description}
                          imageUrl={pr.image_url}
                          fallbackIcon={<FileText className="w-5 h-5 text-white" />}
                          fallbackGradient="bg-gradient-to-br from-[#80c8f0] to-[#7de19a]"
                          createdAt={new Date(pr.rfx?.created_at || pr.created_at)}
                          badge={{
                            label: 'Example',
                            variant: 'outline',
                            className: 'text-xs bg-blue-50 border-blue-200 text-blue-700'
                          }}
                          onClick={() => {
                            // If the referenced RFX was deleted (join is null), fall back to the current canonical example.
                            const targetId = pr.rfx ? pr.rfx_id : DEFAULT_PUBLIC_RFX_EXAMPLE_ID;
                            navigate(`/rfx-example/${targetId}`);
                          }}
                        />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-0" />
                  <CarouselNext className="right-0" />
                </Carousel>
              ) : null}
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
      <RFXFooter />
    </div>
  );
};

export default Home;
