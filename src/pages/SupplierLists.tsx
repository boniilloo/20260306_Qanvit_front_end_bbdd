
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { ChevronRight, Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const SupplierLists = () => {
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  
  const supplierLists = [
    {
      id: 1,
      name: 'Vision – Brake Discs',
      supplierCount: 5,
      category: 'NDT / Machine Vision',
      lastComment: 'FQ added 5 suppliers from automated vision search',
      updated: 'just now',
      unread: true,
    },
    {
      id: 2,
      name: 'EV Battery Tab Weld',
      supplierCount: 8,
      category: 'Laser Welding',
      lastComment: 'Cost variance flagged',
      updated: 'yesterday',
      unread: false,
    },
    {
      id: 3,
      name: 'High-Precision CNC',
      supplierCount: 12,
      category: 'Machining / Milling',
      lastComment: 'New capability matrix uploaded',
      updated: '3d ago',
      unread: false,
    },
  ];
  
  return (
    <div className={`flex-1 bg-fqgrey-100 fixed inset-y-0 right-0 left-[300px] overflow-auto`}>
      {/* Mobile Header */}
      {isMobile && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-gray-600 hover:text-gray-800 touch-manipulation"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-extrabold">Supplier Lists</h1>
          <div className="w-10" />
        </div>
      )}

        <div className="h-full overflow-auto">
          <div className="w-full flex justify-center p-8">
            <div className="w-full max-w-6xl">
              <h1 className="text-3xl font-extrabold text-[#0B1B2B] mb-8">Supplier Lists</h1>
              
              <div className="bg-white rounded-xl shadow-sm p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier List</TableHead>
                      <TableHead>Suppliers</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Last Comment</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierLists.map((list) => (
                      <TableRow 
                        key={list.id}
                        className={`cursor-pointer ${activeListId === list.id ? 'bg-[#F4F6F8]' : ''}`}
                        onClick={() => setActiveListId(list.id === activeListId ? null : list.id)}
                      >
                        <TableCell className={`font-medium ${list.unread ? 'border-l-4 border-[#00B3A4] pl-4' : ''}`}>
                          {list.name}
                        </TableCell>
                        <TableCell>{list.supplierCount}</TableCell>
                        <TableCell>{list.category}</TableCell>
                        <TableCell>{list.lastComment}</TableCell>
                        <TableCell>{list.updated}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <ChevronRight size={18} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Show suppliers when a list is selected */}
                {activeListId === 1 && (
                  <div className="mt-6 border-t pt-6">
                    <h3 className="text-lg font-semibold text-[#0B1B2B] mb-4">Vision – Brake Discs Suppliers</h3>
                    <div className="flex gap-4 overflow-x-auto pb-6">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm min-w-[250px]">
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold">Supplier {i}</h4>
                            <span className="text-sm text-teal-600">{80 + i}% match</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-2">
                            Expert in high-speed vision inspection systems for brake components.
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};

export default SupplierLists;
