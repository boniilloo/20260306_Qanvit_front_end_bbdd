
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, 
  Settings, 
  Upload, 
  Play, 
  ExternalLink,
  FileText,
  Image,
  Video
} from "lucide-react";

const CapabilitiesTab = () => {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const products = [
    {
      id: "proficient-360",
      name: "ProfiCienT 360°",
      category: "Industrial Vision Systems",
      description: "Complete 360-degree inspection system for cylindrical objects with advanced defect detection capabilities.",
      features: ["360° rotation inspection", "Sub-pixel accuracy", "Real-time processing", "AI-powered defect classification"],
      applications: ["Automotive parts", "Medical devices", "Electronics", "Packaging"],
      specifications: {
        resolution: "12MP",
        speed: "Up to 200 parts/min",
        accuracy: "±0.1mm",
        integration: "Plug & Play"
      },
      media: {
        images: [
          "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1974",
          "https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?q=80&w=1974"
        ],
        videos: [],
        brochures: ["proficient-360-datasheet.pdf", "installation-guide.pdf"]
      },
      price: "Contact for pricing"
    },
    {
      id: "surface-control-3d",
      name: "SurfaceControl 3D",
      category: "3D Sensors",
      description: "High-precision 3D surface inspection sensors for detecting microscopic defects and measuring surface quality.",
      features: ["Laser triangulation", "Nanometer precision", "Multi-wavelength scanning", "Temperature compensation"],
      applications: ["Surface roughness", "Coating thickness", "Defect detection", "Dimensional measurement"],
      specifications: {
        resolution: "0.1μm",
        scanRate: "50kHz",
        range: "±10mm",
        accuracy: "±0.5μm"
      },
      media: {
        images: [
          "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1974"
        ],
        videos: ["surface-control-demo.mp4"],
        brochures: ["surface-control-3d-specs.pdf"]
      },
      price: "€15,000 - €45,000"
    },
    {
      id: "print-pro",
      name: "PrintPro 100%",
      category: "Print Inspection",
      description: "Complete print quality inspection system for packaging and labeling with 100% coverage verification.",
      features: ["OCR/OCV verification", "Barcode validation", "Color consistency", "Print defect detection"],
      applications: ["Pharmaceutical packaging", "Food labeling", "Automotive parts", "Consumer goods"],
      specifications: {
        speed: "Up to 500m/min",
        resolution: "0.1mm",
        coverage: "100%",
        formats: "All standard sizes"
      },
      media: {
        images: [
          "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?q=80&w=1974"
        ],
        videos: ["printpro-showcase.mp4"],
        brochures: ["printpro-100-overview.pdf"]
      },
      price: "€25,000 - €75,000"
    }
  ];

  const services = [
    {
      name: "Custom Vision Solutions",
      description: "Tailored machine vision systems designed specifically for your production requirements.",
      deliverables: ["System design", "Software development", "Integration support", "Training"],
      duration: "8-16 weeks",
      price: "Starting from €50,000"
    },
    {
      name: "System Integration",
      description: "Complete integration of vision systems into existing production lines with minimal downtime.",
      deliverables: ["Installation", "Calibration", "Testing", "Documentation"],
      duration: "2-4 weeks",
      price: "€5,000 - €15,000"
    },
    {
      name: "Maintenance & Support",
      description: "Comprehensive maintenance packages to ensure optimal system performance and longevity.",
      deliverables: ["Preventive maintenance", "Remote support", "Software updates", "Spare parts"],
      duration: "Ongoing",
      price: "€2,000 - €8,000/year"
    }
  ];

  return (
    <div className="space-y-8">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>
        
        <TabsContent value="products" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Product Portfolio</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Add Product
              </Button>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative h-48 bg-gray-100">
                  <img 
                    src={product.media.images[0]} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    {product.media.images.length > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        <Image className="h-3 w-3 mr-1" />
                        {product.media.images.length}
                      </Badge>
                    )}
                    {product.media.videos.length > 0 && (
                      <Badge variant="info" className="text-xs">
                        <Video className="h-3 w-3 mr-1" />
                        {product.media.videos.length}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <CardDescription>{product.category}</CardDescription>
                    </div>
                    <Badge variant="outline">{product.price}</Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {product.description}
                  </p>
                  
                  <div>
                    <p className="text-sm font-semibold mb-2">Key Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {product.features.slice(0, 3).map((feature) => (
                        <Badge key={feature} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {product.features.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{product.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Resolution</p>
                      <p className="font-semibold">{product.specifications.resolution}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Speed</p>
                      <p className="font-semibold">{product.specifications.speed}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1">
                      View Details
                    </Button>
                    <Button size="sm" variant="outline">
                      <FileText className="h-4 w-4" />
                    </Button>
                    {product.media.videos.length > 0 && (
                      <Button size="sm" variant="outline">
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="services" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Service Offerings</h2>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {services.map((service) => (
              <Card key={service.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {service.name}
                  </CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">Deliverables:</p>
                    <ul className="text-sm space-y-1">
                      {service.deliverables.map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Duration</p>
                      <p className="font-semibold">{service.duration}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Pricing</p>
                      <p className="font-semibold text-blue-600">{service.price}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1">
                      Request Quote
                    </Button>
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CapabilitiesTab;
