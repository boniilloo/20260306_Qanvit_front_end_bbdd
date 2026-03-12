import React, { useState } from 'react';
import { Copy, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from '@/hooks/use-toast';

interface PromptCategory {
  name: string;
  prompts: string[];
}

const promptCategories: PromptCategory[] = [
  {
    name: "Automotive & Manufacturing",
    prompts: [
      "I'm searching for suppliers offering turnkey 3D vision systems for defect detection in automotive cast parts, minimum detectable defect size of 0.2 mm.",
      "Looking for vision-guided robotic welding solutions in metal fabrication with real-time seam tracking.",
      "Need suppliers providing automated vision solutions for weld inspection in automotive body assembly lines, including depth and bead uniformity.",
      "Find providers of vision systems for color consistency verification in automotive interior parts production.",
      "Find companies offering vision inspection systems for verifying dimensional tolerances and surface defects in machined metal components.",
      "Requesting suppliers specialized in 3D vision inspection systems for automotive interior panel alignment and gap measurement.",
      "Need suppliers experienced in the integration of high-speed vision inspection for automotive injection-molded parts post-production."
    ]
  },
  {
    name: "Electronics & PCB",
    prompts: [
      "Can you find suppliers specialized in AOI (Automated Optical Inspection) systems for PCB assembly with high-speed inline inspection capabilities?",
      "Need providers of thermal imaging inspection systems for detecting hotspots in electronic components during assembly.",
      "Looking for turnkey providers of vision-guided assembly stations for microelectronics, capable of 10-micron positioning accuracy.",
      "Looking for providers of automated vision inspection systems for verifying solder joint quality on SMT lines.",
      "Which companies provide vision-based automation systems for the assembly and inspection of LED lighting components?",
      "Can you find suppliers who specialize in robotic vision systems for precision placement and assembly of electronic connectors?",
      "Looking for suppliers of vision-guided automation for precise adhesive application in electronic device assembly.",
      "Looking for integrators experienced in installing vision-based track-and-trace systems for electronic components on assembly lines.",
      "Can you identify companies offering vision-guided robotic automation for quality inspection in consumer electronics manufacturing?"
    ]
  },
  {
    name: "Food & Pharmaceutical",
    prompts: [
      "Looking for European companies providing deep-learning vision systems specifically designed for food packaging contamination detection.",
      "Which suppliers offer solutions for high-speed barcode verification and print inspection in the pharmaceutical sector?",
      "Need inspection systems that use multispectral imaging to detect foreign materials in raw bulk food products.",
      "Searching for European integrators capable of installing turnkey vision systems for pharmaceutical vial fill-level inspection and contamination checks.",
      "Seeking suppliers who specialize in vision solutions for inline seal integrity inspection in food packaging applications.",
      "Which companies offer automated blister-packaging inspection systems combining vision and weight control?",
      "Need turnkey vision providers for automatic inspection of printed labels and packaging integrity in high-speed bottling lines.",
      "Searching for suppliers providing hyperspectral imaging solutions for quality inspection in pharmaceutical tablet manufacturing.",
      "Identify turnkey integrators offering machine vision solutions for inspection of medical syringes and needles for dimensional accuracy and defects.",
      "Seeking turnkey vision solutions for automated inspection of caps and closures in beverage bottling lines.",
      "Identify companies providing vision-based inspection and sorting systems for seafood processing plants."
    ]
  },
  {
    name: "3D Vision & Robotics",
    prompts: [
      "Seeking machine vision integrators experienced in integrating robotic bin picking applications with 3D vision sensors.",
      "Identify suppliers experienced in developing inline laser profilometry systems for dimensional inspection of plastic extrusions.",
      "Looking for vision-guided robotic sorting solutions providers for recycling plants, focusing on plastics identification by type.",
      "Searching for suppliers experienced in vision-based navigation and guidance systems for AGVs in warehouse logistics.",
      "Need turnkey providers of vision-guided systems for automated inspection and assembly of microfluidic devices."
    ]
  },
  {
    name: "Specialized Industries",
    prompts: [
      "Find companies specialized in hyperspectral imaging systems tailored for agricultural produce sorting by ripeness and quality.",
      "Requesting contacts of suppliers who provide vision-based systems for optical character recognition (OCR) in high-speed postal sorting facilities.",
      "Can you find integrators who specialize in custom vision inspection solutions for aerospace composite materials?",
      "Need companies experienced in high-precision metrology solutions integrating vision and CMM systems for medical device manufacturing.",
      "Which suppliers offer automated surface defect inspection of glass bottles with defect detection limits under 0.5 mm?",
      "Requesting suppliers of AI-driven defect classification systems for textile manufacturing, focusing on fabric weave and color inspection.",
      "Need suppliers with expertise in machine vision inspection solutions for photovoltaic cell defect detection at high throughput rates.",
      "Find providers of automated vision inspection systems for flat panel display assembly lines, ensuring alignment precision under 0.1 mm.",
      "Can you identify companies specializing in high-speed defect detection systems for thin-film coatings using polarized imaging techniques?",
      "Request contacts of providers who offer automated vision inspection solutions for tire manufacturing, detecting tread and sidewall defects.",
      "Requesting suppliers of automated inline vision inspection solutions for lithium-ion battery cell assembly.",
      "Can you find integrators specializing in machine vision solutions for surface defect detection in metal stamping operations?",
      "Searching for suppliers with expertise in machine vision systems for defect detection in semiconductor wafer manufacturing.",
      "Need integrators providing automated inspection and defect detection solutions for injection-molded plastic medical components.",
      "Which suppliers specialize in vision-based crack detection and dimensional inspection of concrete products during manufacturing?",
      "Requesting information on suppliers offering inspection systems for optical lenses and prisms, detecting micro-defects down to 5 microns.",
      "Need integrators experienced in vision-based automatic sorting solutions for wood panel production, focusing on defect identification and grading."
    ]
  }
];

interface PromptLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptSelect?: (prompt: string) => void;
}

export default function PromptLibraryModal({ open, onOpenChange, onPromptSelect }: PromptLibraryModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredCategories = promptCategories.map(category => ({
    ...category,
    prompts: category.prompts.filter(prompt =>
      prompt.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => 
    category.prompts.length > 0 && 
    (selectedCategory === null || category.name === selectedCategory)
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Prompt has been copied to your clipboard",
    });
  };

  const handlePromptClick = (prompt: string) => {
    if (onPromptSelect) {
      onPromptSelect(prompt);
      onOpenChange(false);
    } else {
      copyToClipboard(prompt);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-[#22183a]">
            Machine Vision Prompt Library
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Category filters */}
          <div className="flex flex-wrap gap-2 justify-center">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className="text-xs"
              >
                All Categories
              </Button>
              {promptCategories.map((category) => (
                <Button
                  key={category.name}
                  variant={selectedCategory === category.name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.name)}
                  className="text-xs"
                >
                  {category.name}
                </Button>
              ))}
          </div>

          {/* Prompts list */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {filteredCategories.map((category) => (
                <div key={category.name} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[#22183a]">{category.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {category.prompts.length} prompts
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {category.prompts.map((prompt, index) => (
                      <div
                        key={index}
                        className="group p-3 border border-gray-200 rounded-lg hover:border-[#f4a9aa] hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                        onClick={() => handlePromptClick(prompt)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-gray-700 group-hover:text-[#22183a] leading-relaxed flex-1">
                            {prompt}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(prompt);
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="text-xs text-gray-500 text-center pt-2 border-t">
            Click on any prompt to {onPromptSelect ? 'use it' : 'copy to clipboard'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}