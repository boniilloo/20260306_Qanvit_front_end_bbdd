
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  Calendar, 
  MapPin, 
  Users, 
  TrendingUp, 
  Award, 
  Target, 
  Eye,
  LinkedinIcon,
  Download,
  ExternalLink
} from "lucide-react";

const CompanyTab = () => {
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);

  const companyData = {
    overview: {
      founded: "1985",
      headquarters: "Darmstadt, Germany",
      employees: "800+",
      revenue: "€220M (2024)",
      ownershipType: "Public (ATLAS COPCO)",
      industries: ["Industrial Automation", "Machine Vision", "Quality Control"],
      globalPresence: ["Germany", "USA", "China", "Japan", "India"]
    },
    financials: {
      revenue2024: 220000000,
      revenue2023: 195000000,
      growth: "+12.8%",
      profitMargin: "18.5%",
      creditRating: "A-",
      fundingRounds: []
    },
    certifications: [
      { name: "ISO 9001:2015", status: "Valid", expiryDate: "2026-03-15" },
      { name: "ISO 14001", status: "Valid", expiryDate: "2025-11-20" },
      { name: "IATF 16949", status: "Valid", expiryDate: "2025-08-10" },
      { name: "IEC 61508", status: "Valid", expiryDate: "2026-01-30" }
    ],
    team: [
      { name: "Dr. Martin Fischer", role: "CEO", department: "Executive", tenure: "2018-Present" },
      { name: "Sarah Weber", role: "CTO", department: "Technology", tenure: "2020-Present" },
      { name: "Klaus Hoffmann", role: "VP Sales", department: "Sales", tenure: "2015-Present" },
      { name: "Lisa Chen", role: "Head of R&D", department: "Research", tenure: "2019-Present" }
    ]
  };

  const handleLinkedInImport = () => {
    // This would integrate with LinkedIn API
    setIsLinkedInConnected(true);
    
  };

  return (
    <div className="space-y-8">
      {/* LinkedIn Import Section - Only for claimed suppliers */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkedinIcon className="h-5 w-5 text-blue-600" />
            LinkedIn Integration
          </CardTitle>
          <CardDescription>
            Import and sync your company information directly from LinkedIn
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button 
              onClick={handleLinkedInImport}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isLinkedInConnected}
            >
              <LinkedinIcon className="h-4 w-4 mr-2" />
              {isLinkedInConnected ? "Connected" : "Import from LinkedIn"}
            </Button>
            {isLinkedInConnected && (
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Sync Data
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Company Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Founded</p>
                <p className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {companyData.overview.founded}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Headquarters</p>
                <p className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {companyData.overview.headquarters}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Employees</p>
                <p className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {companyData.overview.employees}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">2024 Revenue</p>
                <p className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {companyData.overview.revenue}
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <p className="text-sm text-gray-500 mb-2">Industries</p>
              <div className="flex flex-wrap gap-2">
                {companyData.overview.industries.map((industry) => (
                  <Badge key={industry} variant="outline" className="border-blue-300">
                    {industry}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-500 mb-2">Global Presence</p>
              <div className="flex flex-wrap gap-2">
                {companyData.overview.globalPresence.map((country) => (
                  <Badge key={country} variant="secondary">
                    {country}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mission & Vision */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Mission & Vision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2 text-blue-600">Mission</h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                To empower manufacturers worldwide with cutting-edge machine vision technology 
                that ensures the highest quality standards and operational efficiency across all 
                production processes.
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h4 className="font-semibold mb-2 text-blue-600">Vision</h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                To be the global leader in intelligent automation solutions, driving the future 
                of Industry 4.0 through innovative AI-powered quality control systems.
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h4 className="font-semibold mb-2 text-blue-600">Values</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Innovation through continuous R&D investment</li>
                <li>• Quality excellence in every solution</li>
                <li>• Customer-centric approach</li>
                <li>• Sustainable manufacturing practices</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Financial Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Financial Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">2024 Revenue</p>
                <p className="text-2xl font-bold text-green-600">€220M</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">YoY Growth</p>
                <p className="text-2xl font-bold text-green-600">{companyData.financials.growth}</p>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Profit Margin</span>
                <span className="text-sm font-semibold">{companyData.financials.profitMargin}</span>
              </div>
              <Progress value={18.5} className="h-2" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Credit Rating</p>
                <Badge variant="success">{companyData.financials.creditRating}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Financial Health</p>
                <Badge variant="success">Excellent</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Certifications & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {companyData.certifications.map((cert) => (
                <div key={cert.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-semibold">{cert.name}</p>
                    <p className="text-sm text-gray-500">Expires: {cert.expiryDate}</p>
                  </div>
                  <Badge variant="success">{cert.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leadership Team */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Leadership Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {companyData.team.map((member) => (
              <div key={member.name} className="text-center p-4 border rounded-lg">
                <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <Users className="h-8 w-8 text-gray-400" />
                </div>
                <h4 className="font-semibold">{member.name}</h4>
                <p className="text-sm text-blue-600">{member.role}</p>
                <p className="text-xs text-gray-500">{member.tenure}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyTab;
