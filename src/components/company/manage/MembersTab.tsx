import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Mail, Users, ExternalLink, UserMinus } from 'lucide-react';
import type { CompanyMember, PendingAdminRequest } from './types';
import { RemoveAdminConfirmDialog } from '../RemoveAdminConfirmDialog';

interface MembersTabProps {
  pendingRequests: PendingAdminRequest[];
  loadingPending: boolean;
  processingRequestId: string | null;
  onApproveRequest: (id: string) => void;
  onRejectRequest: (id: string) => void;
  members: CompanyMember[];
  loadingMembers: boolean;
  removingMember: string | null;
  onRemoveAdmin: (userId: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  pendingRequests,
  loadingPending,
  processingRequestId,
  onApproveRequest,
  onRejectRequest,
  members,
  loadingMembers,
  removingMember,
  onRemoveAdmin,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<CompanyMember | null>(null);

  const handleRemoveClick = (member: CompanyMember) => {
    setSelectedMember(member);
    setDialogOpen(true);
  };

  const handleConfirmRemove = () => {
    if (selectedMember) {
      onRemoveAdmin(selectedMember.auth_user_id);
      setDialogOpen(false);
      setSelectedMember(null);
    }
  };
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Company Members
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-navy">Pending Admin Requests</h3>
            {pendingRequests.length > 0 && <Badge variant="outline">{pendingRequests.length}</Badge>}
          </div>
          {loadingPending ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="p-4 border rounded-lg animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no pending requests.</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div key={req.id} className="p-4 border rounded-lg">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-navy">{[req.user_name, req.user_surname].filter(Boolean).join(' ') || 'Unknown user'}</div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Requested on {new Date(req.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>{req.user_email}</span>
                        </div>
                        {req.linkedin_url && (
                          <a href={req.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600">
                            LinkedIn <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {req.comments && <p className="text-sm text-gray-600">{req.comments}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" onClick={() => onApproveRequest(req.id)} disabled={processingRequestId === req.id}>
                        {processingRequestId === req.id ? 'Processing...' : 'Approve'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onRejectRequest(req.id)} disabled={processingRequestId === req.id}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {loadingMembers ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">No Members Found</h3>
            <p className="text-muted-foreground">No approved administrators found for this company.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((member) => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center space-x-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={member.avatar_url || undefined} alt={`${member.name} ${member.surname}`} />
                    <AvatarFallback className="bg-navy text-white">{`${member.name?.charAt(0) || ''}${member.surname?.charAt(0) || ''}`}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-navy truncate">{member.name} {member.surname}</h4>
                    <p className="text-sm text-muted-foreground truncate">{member.company_position}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Mail className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-muted-foreground">Since {new Date(member.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveClick(member)}
                            disabled={removingMember === member.auth_user_id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 w-8 h-8 p-0"
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{removingMember === member.auth_user_id ? 'Removing user...' : 'Remove user'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <RemoveAdminConfirmDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      onConfirm={handleConfirmRemove}
      memberName={selectedMember ? `${selectedMember.name} ${selectedMember.surname}`.trim() : ''}
      isRemoving={removingMember === selectedMember?.auth_user_id}
    />

    {/* Spacer below the company members card */}
    <div style={{ height: '700px' }} />
    </>
  );
};

