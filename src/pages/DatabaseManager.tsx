import React from 'react';
import DatabaseTab from '@/components/database/DatabaseTab';

const DatabaseManager = () => {
  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Database Manager</h1>
          <DatabaseTab />
        </div>
      </div>
    </div>
  );
};

export default DatabaseManager;