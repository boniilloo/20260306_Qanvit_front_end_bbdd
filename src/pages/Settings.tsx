import React from 'react';
import Layout from '@/components/Layout';
import SettingsTab from '@/components/settings/SettingsTab';
import Sidebar from '@/components/Sidebar';

const Settings = () => {
  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Agent Configuration Settings</h1>
          <SettingsTab />
        </div>
      </div>
    </div>
  );
};

export default Settings;