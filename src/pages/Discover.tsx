import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, BookmarkPlus, Building, History, Users, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
const Discover = () => {
  const navigate = useNavigate();
  const features = [{
    icon: <History className="w-8 h-8 text-navy" />,
    title: "Save Conversation History",
    description: "Never lose track of your important conversations. Save and resume your chats anytime, anywhere."
  }, {
    icon: <BookmarkPlus className="w-8 h-8 text-navy" />,
    title: "Save Your Favorite Suppliers",
    description: "Build your personal list of trusted suppliers and access them instantly whenever you need them."
  }, {
    icon: <Building className="w-8 h-8 text-navy" />,
    title: "Connect Your Company",
    description: "Link your company profile to unlock advanced features and collaborate with your team members."
  }, {
    icon: <Users className="w-8 h-8 text-navy" />,
    title: "Manage RFX Projects",
    description: "Create, organize and track your Request for Quotation projects all in one place."
  }, {
    icon: <Star className="w-8 h-8 text-navy" />,
    title: "Personalized Experience",
    description: "Get tailored recommendations and a customized dashboard based on your business needs."
  }, {
    icon: <MessageCircle className="w-8 h-8 text-navy" />,
    title: "Advanced Agent Features",
    description: "Unlock premium AI capabilities with detailed supplier insights and smart recommendations."
  }];
  const handleLoginClick = () => {
    navigate('/auth');
  };
  return <>
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 p-4">
        <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-12 pt-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-navy/10 rounded-full mb-6">
            <Star className="w-8 h-8 text-navy" />
          </div>
          <h1 className="text-4xl font-extrabold text-foreground mb-4">
            Unlock Premium Features
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">Join industial professionals who trust our platform to streamline their supplier discovery and management process. 
Sign up free today to access powerful tools that will transform how you work.</p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature, index) => <Card key={index} className="border-border/50 hover:border-primary/20 transition-all duration-300 hover:shadow-lg bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  {feature.icon}
                  <CardTitle className="text-lg font-semibold">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>)}
        </div>

        {/* Call to Action Section */}
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center shadow-lg">
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to get started?</h2>
          
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button onClick={handleLoginClick} size="lg" className="px-8 py-3 text-lg font-semibold min-w-[200px] text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 bg-[#f4a9aa]">
              Sign Up Now
            </Button>
            <Button onClick={handleLoginClick} variant="outline" size="lg" className="px-8 py-3 text-lg min-w-[200px] border-primary/20 hover:border-primary/40 hover:bg-primary/5">
              Already have an account? Log In
            </Button>
          </div>

          <div className="mt-8 flex justify-center items-center gap-8 text-sm text-muted-foreground">
            
            
            
          </div>
        </div>
        </div>
      </div>
    </>;
};
export default Discover;