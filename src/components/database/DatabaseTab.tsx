import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import URLsTab from './URLsTab';
import AddCompaniesTab from './AddCompaniesTab';
import ScrapperSettingsTab from './ScrapperSettingsTab';
import ConnectionInfoTab from './ConnectionInfoTab';

const DatabaseTab = () => {
  return (
    <div className="space-y-8">
      <Tabs defaultValue="urls" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="urls">Database overview</TabsTrigger>
          <TabsTrigger value="add-companies">Add companies</TabsTrigger>
          <TabsTrigger value="scrapper-settings">Scrapper settings</TabsTrigger>
          <TabsTrigger value="connection-info">Connection info</TabsTrigger>
        </TabsList>

        <TabsContent value="urls" className="space-y-6">
          <URLsTab />
        </TabsContent>

        <TabsContent value="add-companies" className="space-y-6">
          <AddCompaniesTab />
        </TabsContent>

        <TabsContent value="scrapper-settings" className="space-y-6">
          <ScrapperSettingsTab />
        </TabsContent>

        <TabsContent value="connection-info" className="space-y-6">
          <ConnectionInfoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DatabaseTab;