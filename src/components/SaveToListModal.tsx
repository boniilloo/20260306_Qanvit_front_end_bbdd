import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, List, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SupplierList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
}

interface SaveToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  userId: string;
  onSaveSuccess: (listName?: string, listId?: string | null) => void;
  currentLists?: Array<{id: string | null, name: string, color?: string}>;
}

const SaveToListModal = ({
  isOpen,
  onClose,
  companyId,
  companyName,
  userId,
  onSaveSuccess,
  currentLists = []
}: SaveToListModalProps) => {
  const [lists, setLists] = useState<SupplierList[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListColor, setNewListColor] = useState('#80c8f0');
  const [currentSavedLists, setCurrentSavedLists] = useState<Array<{id: string | null, name: string, color?: string}>>(currentLists);

  const predefinedColors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  // Función loadLists memoizada
  const loadLists = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_lists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLists(data || []);
    } catch (error) {
      console.error('Error loading lists:', error);
    }
  }, [userId]);

  // Cargar listas del usuario solo una vez al abrir
  useEffect(() => {
    if (isOpen && userId) {
      loadLists();
    }
  }, [isOpen, loadLists]);

  // Memoizar currentLists para evitar cambios innecesarios
  const memoizedCurrentLists = useMemo(() => currentLists, [
    JSON.stringify(currentLists)
  ]);

  // Actualizar currentSavedLists solo si realmente cambió el contenido
  useEffect(() => {
    const currentListsString = JSON.stringify(currentSavedLists);
    const newListsString = JSON.stringify(memoizedCurrentLists);
    
    if (currentListsString !== newListsString) {
      setCurrentSavedLists(memoizedCurrentLists);
    }
  }, [memoizedCurrentLists]);

  // Función para verificar las listas actuales de la empresa (memoizada)
  const checkCurrentLists = useCallback(async () => {
    if (!userId || !companyId) return;
    
    try {
      const { data: savedData, error } = await supabase
        .from('saved_companies')
        .select(`
          list_id,
          supplier_lists (
            name,
            color
          )
        `)
        .eq('user_id', userId)
        .eq('company_id', companyId);

      if (!error && savedData) {
        const lists = savedData.map(item => ({
          id: item.list_id,
          name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized',
          color: item.list_id ? item.supplier_lists?.color : '#9CA3AF'
        }));
        
        // Solo actualizar si realmente cambió
        const currentString = JSON.stringify(currentSavedLists);
        const newString = JSON.stringify(lists);
        
        if (currentString !== newString) {
          setCurrentSavedLists(lists);
        }
      }
    } catch (error) {
      console.error('Error checking current lists:', error);
    }
  }, [userId, companyId]); // Removido currentSavedLists para evitar bucle infinito

  // Listener en tiempo real para este modal (optimizado)
  useEffect(() => {
    if (!isOpen || !userId || !companyId) return;

    let timeoutIds: NodeJS.Timeout[] = [];

    const channel = supabase
      .channel(`saved-companies-modal-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'saved_companies',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          if (newRecord?.company_id === companyId || 
              oldRecord?.company_id === companyId) {
            // Limpiar timeouts previos para evitar llamadas duplicadas
            timeoutIds.forEach(id => clearTimeout(id));
            timeoutIds = [];
            
            // Solo una actualización con delay
            const timeoutId = setTimeout(() => {
              checkCurrentLists();
            }, 300);
            timeoutIds.push(timeoutId);
          }
        }
      )
      .subscribe();

    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
      supabase.removeChannel(channel);
    };
  }, [isOpen, userId, companyId, checkCurrentLists]);


  // Listener para cuando la ventana gania foco (optimizado)
  useEffect(() => {
    if (!isOpen) return;
    
    const handleFocus = () => {
      checkCurrentLists();
      loadLists();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isOpen, checkCurrentLists, loadLists]);


  const createList = async () => {
    if (!newListName.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('supplier_lists')
        .insert({
          user_id: userId,
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          color: newListColor
        })
        .select()
        .single();

      if (error) throw error;

      setLists(prev => [data, ...prev]);
      setSelectedListId(data.id);
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      setNewListColor('#3B82F6');

      toast({
        title: "List created",
        description: `"${data.name}" has been created`,
      });
    } catch (err: any) {
      console.error('Error creating list:', err);
      if (err.code === '23505') {
        toast({
          title: "List already exists",
          description: "You already have a list with that name",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Could not create list",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const saveToList = async () => {
    setLoading(true);
    try {
      // Check if already saved in this specific list
      if (selectedListId) {
        const { data: existingEntry } = await supabase
          .from('saved_companies')
          .select('id')
          .eq('user_id', userId)
          .eq('company_id', companyId)
          .eq('list_id', selectedListId)
          .maybeSingle();

        if (existingEntry) {
          toast({
            title: "Already in this list",
            description: `${companyName} is already saved in this list`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      } else {
        // Check if already saved as uncategorized
        const { data: existingEntry } = await supabase
          .from('saved_companies')
          .select('id')
          .eq('user_id', userId)
          .eq('company_id', companyId)
          .is('list_id', null)
          .maybeSingle();

        if (existingEntry) {
          toast({
            title: "Already saved as uncategorized",
            description: `${companyName} is already saved as uncategorized`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase
        .from('saved_companies')
        .insert({
          user_id: userId,
          company_id: companyId,
          list_id: selectedListId
        });

      if (error) {
        throw error;
      }

      const listName = selectedListId 
        ? lists.find(l => l.id === selectedListId)?.name || 'selected list'
        : 'Uncategorized';
      
      toast({
        title: "Supplier saved",
        description: selectedListId 
          ? `${companyName} has been added to "${listName}"`
          : `${companyName} has been saved as uncategorized`,
      });
      
      onSaveSuccess(listName, selectedListId);
      onClose();
    } catch (err) {
      console.error('Error saving supplier:', err);
      toast({
        title: "Error",
        description: "Could not save supplier",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowCreateForm(false);
    setSelectedListId(null);
    setNewListName('');
    setNewListDescription('');
    setNewListColor('#3B82F6');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetForm();
        onClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-sky" />
            {currentSavedLists.length > 0 ? `Manage ${companyName}` : `Save ${companyName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Show current lists if any */}
          {currentSavedLists.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Currently saved in:</h4>
              {currentSavedLists.map((currentList, index) => (
                <div key={index} className="p-3 border-2 border-amber-200 bg-amber-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: currentList.color || '#3B82F6' }}
                      />
                      <span className="font-medium text-amber-700">{currentList.name}</span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        setLoading(true);
                        try {
                          let query = supabase
                            .from('saved_companies')
                            .delete()
                            .eq('user_id', userId)
                            .eq('company_id', companyId);

                          // Handle null list_id for uncategorized items
                          if (currentList.id === null) {
                            query = query.is('list_id', null);
                          } else {
                            query = query.eq('list_id', currentList.id);
                          }

                          const { error } = await query;

                          if (error) throw error;

                          toast({
                            title: "Removed from list",
                            description: `${companyName} has been removed from ${currentList.name}`,
                          });
                          
                          onSaveSuccess();
                          onClose();
                        } catch (error) {
                          console.error('Error removing company:', error);
                          toast({
                            title: "Error",
                            description: "Could not remove company. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              
              <div className="text-center text-sm text-gray-500 font-medium py-2">
                Add to another list:
              </div>
            </div>
          )}

          {/* No List Option */}
          <div 
            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
              selectedListId === null 
                ? 'border-sky bg-sky/5' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setSelectedListId(null)}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-gray-400"></div>
              <div>
                <p className="font-medium text-navy">Uncategorized</p>
                <p className="text-sm text-gray-500">
                  {currentSavedLists.length > 0 ? 'Add to uncategorized' : 'Save without a specific list'}
                </p>
              </div>
            </div>
          </div>

          {/* Existing Lists */}
          {lists.map((list) => (
            <div
              key={list.id}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedListId === list.id 
                  ? 'border-sky bg-sky/5' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedListId(list.id)}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: list.color }}
                ></div>
                <div className="flex-1">
                  <p className="font-medium text-navy">{list.name}</p>
                  {list.description && (
                    <p className="text-sm text-gray-500">{list.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Create New List */}
          {!showCreateForm ? (
            <Button
              variant="outline"
              onClick={() => setShowCreateForm(true)}
              className="w-full flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New List
            </Button>
          ) : (
            <div className="p-4 border border-dashed border-gray-300 rounded-lg space-y-3">
              <div>
                <Label htmlFor="listName">List Name</Label>
                <Input
                  id="listName"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Potential Partners"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="listDescription">Description (Optional)</Label>
                <Textarea
                  id="listDescription"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="Brief description of this list"
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Color</Label>
                <div className="flex gap-2 mt-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 ${
                        newListColor === color ? 'border-gray-800' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewListColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={createList}
                  disabled={!newListName.trim() || loading}
                  size="sm"
                  className="flex-1"
                >
                  Create & Select
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="flex-1"
          >
            Cancel
          </Button>
            <Button
              onClick={saveToList}
              disabled={loading || showCreateForm}
              className="flex-1"
            >
              {loading ? 'Saving...' : (currentSavedLists.length > 0 ? 'Add to List' : 'Save Supplier')}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveToListModal;
