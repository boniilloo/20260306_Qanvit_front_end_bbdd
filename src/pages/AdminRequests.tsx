import React from 'react';
import AdminRequestsManager from '@/components/company/AdminRequestsManager';

const AdminRequests = () => {
  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-extrabold text-foreground mb-8">Company Admin Requests</h1>
          <AdminRequestsManager />
        </div>
      </div>
    </div>
  );
};

export default AdminRequests;