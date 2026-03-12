import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRFXMembers, RFXMember } from '@/hooks/useRFXMembers';

interface RFXMembersAvatarsProps {
  rfxId: string;
  maxVisible?: number;
}

const RFXMembersAvatars: React.FC<RFXMembersAvatarsProps> = ({ 
  rfxId, 
  maxVisible = 3 
}) => {
  const { members, loadMembers } = useRFXMembers(rfxId);
  const [cachedMembers, setCachedMembers] = useState<RFXMember[]>(() => {
    const cached = localStorage.getItem(`rfx_members_${rfxId}`);
    return cached ? JSON.parse(cached) : [];
  });

  // Always load members when component mounts or rfxId changes to get fresh data
  useEffect(() => {
    if (loadMembers) {
      loadMembers();
    }
  }, [rfxId, loadMembers]);

  // Update cache when members change, but only if changed to avoid blinking
  const lastMembersSignatureRef = React.useRef<string>('');
  useEffect(() => {
    const signature = JSON.stringify(members || []);
    if (!members || members.length === 0) return;
    if (signature === lastMembersSignatureRef.current) return;
    lastMembersSignatureRef.current = signature;
    setCachedMembers(members);
    localStorage.setItem(`rfx_members_${rfxId}`, JSON.stringify(members));
  }, [members, rfxId]);

  if (cachedMembers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {cachedMembers.slice(0, maxVisible).map((member, index) => (
        <TooltipProvider key={member.user_id} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="w-8 h-8 border border-[#22183a]">
                <AvatarImage src={member.avatar_url || ''} />
                <AvatarFallback className="bg-[#f4a9aa] text-white text-xs font-medium">
                  {(member.name?.[0] || member.email?.[0] || 'U').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{member.email}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      {cachedMembers.length > maxVisible && (
        <div
          className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium border border-[#22183a]"
          title={`${cachedMembers.length - maxVisible} more users`}
        >
          +{cachedMembers.length - maxVisible}
        </div>
      )}
    </div>
  );
};

export default RFXMembersAvatars;
