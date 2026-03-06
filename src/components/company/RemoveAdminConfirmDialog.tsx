import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RemoveAdminConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  memberName: string;
  isRemoving: boolean;
}

export const RemoveAdminConfirmDialog: React.FC<RemoveAdminConfirmDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  memberName,
  isRemoving,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Administrator Access</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove administrator privileges from{' '}
            <span className="font-medium text-foreground">{memberName}</span>?
          </AlertDialogDescription>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>This action will:</p>
            <div className="ml-4 space-y-1">
              <div>• Revoke all admin permissions for this company</div>
              <div>• Remove their ability to manage company information</div>
              <div>• Remove their ability to manage products and team members</div>
            </div>
            <p className="mt-4 font-medium">This action cannot be undone. They will need to request admin access again.</p>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isRemoving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? 'Removing...' : 'Remove Admin Access'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};