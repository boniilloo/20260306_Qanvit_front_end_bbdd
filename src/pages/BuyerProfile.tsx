import React from 'react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Settings, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Sidebar from "@/components/Sidebar";
import { useIsMobile } from '@/hooks/use-mobile';

const BuyerProfile = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="bg-fqgrey-100 overflow-auto">
      <div className="w-full flex justify-center p-6">
        <div className="w-full max-w-6xl">
          {/* Banner */}
          <div className="relative mb-16">
            <div 
              className="w-full h-[220px] rounded-xl overflow-hidden" 
              style={{
                backgroundImage: 'url("https://images.unsplash.com/photo-1556761175-b413da4baf72?q=80&w=1974")', 
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(1px) brightness(0.7)'
              }}
            ></div>
            
            <Avatar className="absolute -bottom-12 left-8 w-24 h-24 border-4 border-white">
              <AvatarImage src="https://www.valeo.com/wp-content/themes/valeo/assets/images/logo-valeo.svg" alt="Valeo" />
              <AvatarFallback>VL</AvatarFallback>
            </Avatar>
          </div>
          
          {/* Header */}
          <div className="bg-white rounded-xl p-6 mb-6 flex justify-between items-center sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-extrabold">Valeo Group</h1>
              <Badge className="bg-[#00B3A4] hover:bg-[#00B3A4]/90">Buyer</Badge>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" size="sm">
                <Pencil size={16} className="mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm">
                <Settings size={16} className="mr-2" />
                Settings
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs defaultValue="overview" className="mb-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="company">Company</TabsTrigger>
              <TabsTrigger value="interests">Interests</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Content */}
          <div className="grid grid-cols-12 gap-6">
            {/* Overview Card */}
            <div className="col-span-8 bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Overview</h2>
              
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 bg-white rounded-md mr-3 flex items-center justify-center">
                  <img src="https://www.valeo.com/wp-content/themes/valeo/assets/images/logo-valeo.svg" alt="Valeo" className="w-8 h-8 object-contain" />
                </div>
                <span className="font-medium">Valeo Group</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">Procurement Organization</p>
                  <p className="font-medium">Global Automotive Components</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Industry Vertical</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">Automotive</Badge>
                    <Badge variant="outline">ADAS</Badge>
                    <Badge variant="outline">EV Components</Badge>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Annual Direct-Material Spend</p>
                  <p className="font-medium">€8.5B</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Preferred Incoterms</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">DDP</Badge>
                    <Badge variant="outline">FCA</Badge>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Average RFX Cycle Time</p>
                  <p className="font-medium">18 days</p>
                </div>
              </div>
            </div>
            
            {/* Contact & Context Card */}
            <div className="col-span-4 bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Contact & Context</h2>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <Avatar className="w-14 h-14 mr-3">
                    <AvatarImage src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=1000" alt="Sophie Moreau" />
                    <AvatarFallback>SM</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Sophie Moreau</p>
                    <p className="text-sm text-gray-500">Global Procurement Director</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium text-blue-600">sophie.moreau@valeo.com</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium text-blue-600">+33 1 40 55 20 20</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Time-zone</p>
                  <p className="font-medium">CET (UTC+1)</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Language Preferences</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">French</Badge>
                    <Badge variant="outline">English</Badge>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Procurement Guide Card */}
            <div className="col-span-8 bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Procurement Guide</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Target Price Variance</p>
                  <p className="font-medium">&lt; 5%</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Compliance Must-haves</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">ISO/TS 16949</Badge>
                    <Badge variant="outline">ISO 14001</Badge>
                    <Badge variant="outline">Carbon Neutral Plan</Badge>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Supplier Location Preferences</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">EU</Badge>
                    <Badge variant="outline">Asia</Badge>
                    <Badge variant="outline">North America</Badge>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Payment Terms</p>
                  <p className="font-medium">Net 60, EOM</p>
                </div>
                
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-2">Approved Onboarding Steps</p>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input type="checkbox" checked readOnly className="mr-2" />
                      <span>Technical Validation</span>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" checked readOnly className="mr-2" />
                      <span>Commercial Agreement</span>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" checked readOnly className="mr-2" />
                      <span>Quality Audit</span>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" checked readOnly className="mr-2" />
                      <span>Sustainability Assessment</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Buying Interests Panel */}
            <div className="col-span-8 bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Buying Interests</h2>
              
              <div className="flex flex-wrap gap-3">
                <Badge>Advanced Driver Assistance</Badge>
                <Badge>Vision Systems</Badge>
                <Badge>Lidar Technology</Badge>
                <Badge>EV Battery Management</Badge>
                <Badge>Smart Thermal Systems</Badge>
                <Badge>Connected Mobility</Badge>
                <Badge>Autonomous Driving</Badge>
                <Badge>Powertrain Electrification</Badge>
                <Badge>48V Systems</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyerProfile;
