import React, { useState, useEffect } from 'react';

import { Search, Filter, Grid, List, ChevronDown, ChevronUp, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import SupplierCard from '@/components/ui/SupplierCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const SavedSuppliers = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listDropdownOpen, setListDropdownOpen] = useState(false);
  const [savedSuppliers, setSavedSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();





  // Load saved companies and lists from database
  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Load user's lists first
        const { data: listsData, error: listsError } = await supabase
          .from('supplier_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (listsError) {
          console.error('Error loading lists:', listsError);
        } else {
          setLists(listsData || []);
        }

        // Load saved companies with their list associations
        const { data: savedCompaniesData, error: savedError } = await supabase
          .from('saved_companies')
          .select(`
            company_id,
            list_id,
            created_at,
            supplier_lists!left(
              id,
              name,
              color
            )
          `)
          .eq('user_id', user.id);

        if (savedError) {
          console.error('Error loading saved companies:', savedError);
          return;
        }

        if (savedCompaniesData && savedCompaniesData.length > 0) {
          const companyIds = savedCompaniesData.map(sc => sc.company_id);
          
          // Get active company revisions
          const { data: activeRevisions, error: revisionsError } = await supabase
            .from('company_revision')
            .select('*')
            .in('company_id', companyIds)
            .eq('is_active', true);

          if (revisionsError) {
            console.error('Error loading revisions:', revisionsError);
            return;
          }

          // Helper function to parse location data
          const parseLocationData = (data: any): string[] => {
            if (!data) return [];
            
            if (typeof data === 'string') {
              if (data.startsWith('[') && data.endsWith(']')) {
                try {
                  return JSON.parse(data);
                } catch (e) {
                  return [];
                }
              } else if (data.includes(',')) {
                return data.split(',').map(item => item.trim());
              } else {
                return [data];
              }
            }
            
            if (Array.isArray(data)) {
              return data;
            }
            
            return [];
          };

          // Transform and merge data - handle companies in multiple lists
          const transformedSuppliers: any[] = [];
          
          activeRevisions?.forEach((revision: any) => {
            const companySavedEntries = savedCompaniesData.filter(sc => sc.company_id === revision.company_id);
            const cities = parseLocationData(revision.cities);
            const countries = parseLocationData(revision.countries);
            
            const firstCity = cities.length > 0 ? cities[0] : '';
            const firstCountry = countries.length > 0 ? countries[0] : '';
            const location = firstCity && firstCountry ? `${firstCity}, ${firstCountry}` : 'Location not specified';
            
            // Create one entry for each list the company is saved in
            companySavedEntries.forEach((savedCompany) => {
              transformedSuppliers.push({
                id: `${revision.company_id}-${savedCompany.list_id || 'uncategorized'}`,
                companyId: revision.company_id,
                name: revision.nombre_empresa || 'Unknown Company',
                location: location,
                flag: '',
                capability: revision.description || 'No description available',
                score: revision.score || 0,
                slug: revision.slug || revision.company_id,
                rfxs: [],
                listId: savedCompany?.list_id || null,
                listName: savedCompany?.supplier_lists?.name || null,
                listColor: savedCompany?.supplier_lists?.color || null,
                savedAt: savedCompany?.created_at
              });
            });
          });

          setSavedSuppliers(transformedSuppliers);
        }
      } catch (error) {
        console.error('SavedSuppliers: Error loading data:', error);
        toast({
          title: "Error",
          description: "Could not load saved companies",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Filter suppliers based on search and selected list
  const filteredSuppliers = (() => {
    let suppliers = savedSuppliers.filter(supplier => {
      const matchesSearch = supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.capability.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesList = selectedListId === null 
        ? true // Show all if no list is selected
        : selectedListId === 'uncategorized' 
          ? supplier.listId === null // Show uncategorized
          : supplier.listId === selectedListId; // Show specific list
      
      return matchesSearch && matchesList;
    });

    // If showing "All", deduplicate by companyId to show each company only once
    if (selectedListId === null) {
      const uniqueCompanies = new Map();
      suppliers.forEach(supplier => {
        if (!uniqueCompanies.has(supplier.companyId)) {
          uniqueCompanies.set(supplier.companyId, supplier);
        }
      });
      suppliers = Array.from(uniqueCompanies.values());
    }

    return suppliers;
  })();

  const toggleExpanded = (supplierSlug: string) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplierSlug)) {
      newExpanded.delete(supplierSlug);
    } else {
      newExpanded.add(supplierSlug);
    }
    setExpandedSuppliers(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-fqblue-100 text-fqblue-700';
      case 'Awarded': return 'bg-fqgreen-100 text-fqgreen-700';
      case 'Closed': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleViewDetails = (supplierSlug: string) => {
    navigate(`/suppliers/${supplierSlug}`);
  };

  const handleRemoveSupplier = async (companyId: string, supplierName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('saved_companies')
        .delete()
        .eq('user_id', user.id)
        .eq('company_id', companyId);

      if (error) {
        throw error;
      }

      // Update local state to remove the supplier
      setSavedSuppliers(prev => prev.filter(s => s.companyId !== companyId));
      
      toast({
        title: "Supplier removed",
        description: `${supplierName} has been removed from your saved suppliers`,
      });
    } catch (err) {
      console.error('Error removing supplier:', err);
      toast({
        title: "Error",
        description: "Failed to remove supplier. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
            {/* Desktop Header */}
            {!isMobile && (
              <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-extrabold text-navy font-intro">Saved Suppliers</h1>
              </div>
            )}
            {/* Search and Filters */}
            <div className="bg-white rounded-fq shadow-fq p-4 md:p-6 mb-4 md:mb-6">
              <div className="flex gap-4 items-center mb-4">
                <div className="flex-1 relative">
                  <Search size={20} className="absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search suppliers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 font-inter"
                  />
                </div>
              </div>

              {/* List Filter Tabs */}
              {/* Desktop: Horizontal tabs */}
              <div className="hidden md:flex gap-2 overflow-x-auto pb-2">
                 <button
                   onClick={() => setSelectedListId(null)}
                   className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                     selectedListId === null
                       ? 'bg-sky text-white'
                       : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                   }`}
                 >
                   All ({new Set(savedSuppliers.map(s => s.companyId)).size})
                 </button>
                 <button
                   onClick={() => setSelectedListId('uncategorized')}
                   className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                     selectedListId === 'uncategorized'
                       ? 'bg-sky text-white'
                       : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                   }`}
                 >
                   Uncategorized ({savedSuppliers.filter(s => s.listId === null).length})
                 </button>
                 {lists.map((list) => (
                   <button
                     key={list.id}
                     onClick={() => setSelectedListId(list.id)}
                     className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                       selectedListId === list.id
                         ? 'text-white'
                         : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                     }`}
                     style={{
                       backgroundColor: selectedListId === list.id ? list.color : undefined
                     }}
                   >
                     <div 
                       className="w-2 h-2 rounded-full"
                       style={{ backgroundColor: selectedListId === list.id ? 'white' : list.color }}
                     />
                     {list.name} ({savedSuppliers.filter(s => s.listId === list.id).length})
                   </button>
                 ))}
              </div>

              {/* Mobile: Dropdown */}
              <div className="md:hidden">
                <div className="relative" onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setListDropdownOpen(false);
                  }
                }}>
                  <button
                    onClick={() => setListDropdownOpen(!listDropdownOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-left"
                  >
                    <div className="flex items-center gap-2">
                      {selectedListId === null ? (
                        <>
                          <div className="w-3 h-3 bg-sky rounded-full"></div>
                          <span className="font-medium">All ({new Set(savedSuppliers.map(s => s.companyId)).size})</span>
                        </>
                      ) : selectedListId === 'uncategorized' ? (
                        <>
                          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                          <span className="font-medium">Uncategorized ({savedSuppliers.filter(s => s.listId === null).length})</span>
                        </>
                      ) : (
                        <>
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: lists.find(l => l.id === selectedListId)?.color || '#3B82F6' }}
                          ></div>
                          <span className="font-medium">
                            {lists.find(l => l.id === selectedListId)?.name} ({savedSuppliers.filter(s => s.listId === selectedListId).length})
                          </span>
                        </>
                      )}
                    </div>
                    {listDropdownOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  
                  {listDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                              <button
                          onClick={() => {
                            setSelectedListId(null);
                            setListDropdownOpen(false);
                          }}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                          selectedListId === null ? 'bg-sky/10 text-sky' : 'text-gray-700'
                        }`}
                      >
                        <div className="w-3 h-3 bg-sky rounded-full"></div>
                        <span>All ({new Set(savedSuppliers.map(s => s.companyId)).size})</span>
                      </button>
                      
                                              <button
                          onClick={() => {
                            setSelectedListId('uncategorized');
                            setListDropdownOpen(false);
                          }}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                          selectedListId === 'uncategorized' ? 'bg-gray-100 text-gray-800' : 'text-gray-700'
                        }`}
                      >
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <span>Uncategorized ({savedSuppliers.filter(s => s.listId === null).length})</span>
                      </button>
                      
                      {lists.map((list) => (
                        <button
                          key={list.id}
                          onClick={() => {
                            setSelectedListId(list.id);
                            setListDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                            selectedListId === list.id ? 'bg-gray-100' : 'text-gray-700'
                          }`}
                          style={{
                            backgroundColor: selectedListId === list.id ? `${list.color}20` : undefined
                          }}
                        >
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: list.color }}
                          ></div>
                          <span>{list.name} ({savedSuppliers.filter(s => s.listId === list.id).length})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Mobile View Mode Toggle - Hidden on mobile */}
            <div className="hidden md:flex items-center justify-between mb-4">
              <p className="text-gray-600 font-inter text-sm">
                {filteredSuppliers.length} saved suppliers
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="font-inter"
                >
                  <Grid size={16} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="font-inter"
                >
                  <List size={16} />
                </Button>
              </div>
            </div>
            {/* Suppliers Grid/List */}
            <div className="bg-white rounded-fq shadow-fq p-4 md:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f4a9aa] mx-auto mb-4"></div>
                    <p className="text-gray-600 font-inter">Loading saved companies...</p>
                  </div>
                </div>
              ) : !user ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 font-inter mb-4">Please log in to view your saved companies</p>
                  <Button onClick={() => navigate('/auth')} className="font-inter">
                    Log In
                  </Button>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 font-inter mb-2">No saved companies yet</p>
                  <p className="text-sm text-gray-500 font-inter">Start conversations to discover and save companies</p>
                </div>
              ) : (
                <>
                  {(viewMode === 'grid' || isMobile) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                       {filteredSuppliers.map((supplier) => (
                         <SupplierCard
                           key={supplier.id}
                           logo={null}
                           name={supplier.name}
                           country={supplier.location}
                           flag={supplier.flag || ''}
                           tagline={supplier.capability}
                           score={supplier.score}
                           companyId={supplier.companyId}
                           onView={() => handleViewDetails(supplier.slug)}
                         />
                       ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredSuppliers.map((supplier) => (
                        <div
                          key={supplier.id}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4">
                                <div>
                                  <h3 className="font-semibold text-navy font-intro">{supplier.name}</h3>
                                  <p className="text-sm text-gray-600 font-inter">{supplier.location}</p>
                                  <p className="text-sm text-gray-500 font-inter mt-1">{supplier.capability}</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Button
                                onClick={() => handleViewDetails(supplier.slug)}
                                className="font-inter"
                              >
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
      </div>
    </>
  );
};

export default SavedSuppliers;
