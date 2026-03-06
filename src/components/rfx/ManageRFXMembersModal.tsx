import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRFXMembers } from '@/hooks/useRFXMembers';
import { Loader2 } from 'lucide-react';

interface Props {
  rfxId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  onInviteEmails: (emails: string[]) => Promise<void>;
  isGeneratingKeys?: boolean;
}

const ManageRFXMembersModal: React.FC<Props> = ({ rfxId, open, onOpenChange, isOwner, onInviteEmails, isGeneratingKeys = false }) => {
  const { members, invitations, loadMembers, loadInvitations, removeMember, cancelInvitation, cancellingInvitations } = useRFXMembers(rfxId);
  const [inviteEmails, setInviteEmails] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (open) {
      console.log('🔑 [ManageRFXMembersModal] isOwner:', isOwner);
      console.log('🔑 [ManageRFXMembersModal] rfxId:', rfxId);
      loadMembers();
      loadInvitations();
    }
  }, [open, loadMembers, loadInvitations, isOwner, rfxId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage RFX Members</DialogTitle>
          <DialogDescription>
            {isOwner ? 'View, invite, or remove members from this RFX' : 'View members of this RFX'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-2">Members</h3>
            <div className="space-y-2 max-h-56 overflow-auto">
              {members.length === 0 && <div className="text-sm text-gray-500">No members yet</div>}
              {members.map(m => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{m.name || m.email || 'User'} {m.surname || ''}</div>
                    <div className="text-gray-500">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{m.role}</span>
                    {isOwner && m.role !== 'owner' && (
                      <Button size="sm" variant="outline" onClick={() => removeMember(m.user_id)}>Remove</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isOwner && (
            <>
              <div>
                <h3 className="font-medium mb-2">Pending Invitations</h3>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {invitations.length === 0 && <div className="text-sm text-gray-500">No pending invitations</div>}
                  {invitations.map(inv => {
                    const isCancelling = cancellingInvitations.has(inv.id);
                    return (
                      <div key={inv.id} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{inv.name || inv.email || 'User'} {inv.surname || ''}</div>
                          <div className="text-gray-500">{inv.email}</div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => cancelInvitation(inv.id)}
                          disabled={isCancelling}
                        >
                          {isCancelling ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            'Cancel'
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Invite New Members</h3>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="email1@acme.com, email2@acme.com"
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                  />
                  <Button 
                    onClick={async () => {
                      const emails = inviteEmails.split(',').map(e => e.trim()).filter(Boolean);
                      if (emails.length > 0) {
                        setIsInviting(true);
                        try {
                          await onInviteEmails(emails);
                          setInviteEmails('');
                          await loadInvitations();
                        } finally {
                          setIsInviting(false);
                        }
                      }
                    }}
                    disabled={isInviting || isGeneratingKeys}
                  >
                    {isGeneratingKeys ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating encryption keys...
                      </>
                    ) : isInviting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Inviting...
                      </>
                    ) : (
                      'Invite'
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageRFXMembersModal;


