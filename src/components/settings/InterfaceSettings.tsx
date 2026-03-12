
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Palette, Type, Layout, Monitor, Sun, Moon, Keyboard } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InterfacePreferences {
  theme: 'light' | 'dark' | 'auto';
  textSize: 'small' | 'medium' | 'large';
  layout: 'compact' | 'comfortable' | 'spacious';
  showKeyboardShortcuts: boolean;
  industrialMode: boolean;
  compactSidebar: boolean;
}

const InterfaceSettings = () => {
  const [preferences, setPreferences] = useState<InterfacePreferences>({
    theme: 'light',
    textSize: 'medium',
    layout: 'comfortable',
    showKeyboardShortcuts: true,
    industrialMode: true,
    compactSidebar: false,
  });

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('fq-interface-preferences');
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load interface preferences:', error);
      }
    }
  }, []);

  // Apply preferences to document root
  useEffect(() => {
    const root = document.documentElement;
    
    // Apply text size
    root.setAttribute('data-text-size', preferences.textSize);
    
    // Apply layout density
    root.setAttribute('data-layout', preferences.layout);
    
    // Apply theme
    root.setAttribute('data-theme', preferences.theme);
    
    // Apply industrial mode
    if (preferences.industrialMode) {
      root.classList.add('industrial-mode');
    } else {
      root.classList.remove('industrial-mode');
    }
  }, [preferences]);

  const savePreferences = () => {
    localStorage.setItem('fq-interface-preferences', JSON.stringify(preferences));
    toast({
      title: "Preferences saved",
      description: "Your interface customization has been applied",
    });
  };

  const resetToDefaults = () => {
    const defaults: InterfacePreferences = {
      theme: 'light',
      textSize: 'medium',
      layout: 'comfortable',
      showKeyboardShortcuts: true,
      industrialMode: true,
      compactSidebar: false,
    };
    setPreferences(defaults);
    localStorage.removeItem('fq-interface-preferences');
    toast({
      title: "Reset to defaults",
      description: "Interface preferences have been reset",
    });
  };

  const keyboardShortcuts = [
    { key: 'Cmd/Ctrl + Enter', action: 'Send message' },
    { key: 'Esc', action: 'Clear input' },
    { key: 'Cmd/Ctrl + K', action: 'Focus chat input' },
    { key: 'Cmd/Ctrl + N', action: 'New conversation' },
  ];

  return (
    <div className="space-y-6">
      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#f4a9aa]" />
            Visual Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={preferences.theme}
                onValueChange={(value: 'light' | 'dark' | 'auto') => 
                  setPreferences(prev => ({ ...prev, theme: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Dark
                    </div>
                  </SelectItem>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      Auto
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="textSize">Text Size</Label>
              <Select
                value={preferences.textSize}
                onValueChange={(value: 'small' | 'medium' | 'large') => 
                  setPreferences(prev => ({ ...prev, textSize: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="layout">Layout Density</Label>
              <Select
                value={preferences.layout}
                onValueChange={(value: 'compact' | 'comfortable' | 'spacious') => 
                  setPreferences(prev => ({ ...prev, layout: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Industrial B2B Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-[#f4a9aa]" />
            Industrial Interface
            <Badge className="bg-[#f4a9aa]/10 text-[#f4a9aa] font-medium">B2B Optimized</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Industrial Mode</Label>
              <p className="text-sm text-gray-600">
                Enhanced terminology and professional layouts for industrial procurement
              </p>
            </div>
            <Switch
              checked={preferences.industrialMode}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, industrialMode: checked }))
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Compact Sidebar</Label>
              <p className="text-sm text-gray-600">
                Maximize workspace for complex procurement workflows
              </p>
            </div>
            <Switch
              checked={preferences.compactSidebar}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, compactSidebar: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#f4a9aa]" />
            Power User Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Show Keyboard Shortcuts</Label>
              <p className="text-sm text-gray-600">
                Display shortcuts for faster workflow
              </p>
            </div>
            <Switch
              checked={preferences.showKeyboardShortcuts}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, showKeyboardShortcuts: checked }))
              }
            />
          </div>
          
          {preferences.showKeyboardShortcuts && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium mb-3 text-[#22183a]">Available Shortcuts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {keyboardShortcuts.map((shortcut, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <code className="px-2 py-1 bg-white rounded border text-xs font-mono">
                      {shortcut.key}
                    </code>
                    <span className="text-gray-600">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button onClick={savePreferences} className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90">
          Save Preferences
        </Button>
        <Button variant="outline" onClick={resetToDefaults}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
};

export default InterfaceSettings;
