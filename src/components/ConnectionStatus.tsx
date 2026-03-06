import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, RotateCw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { ConnectionStatus as ConnectionStatusType } from '@/hooks/useSmartConnection';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  onRetry?: () => void;
  getMessage: (state: string) => string;
  className?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  status, 
  onRetry, 
  getMessage, 
  className = "" 
}) => {
  const getStatusIcon = () => {
    switch (status.state) {
      case 'connected':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'connecting':
      case 'reconnecting':
      case 'retrying':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case 'offline':
        return <WifiOff className="w-3 h-3 text-orange-500" />;
      case 'failed':
        return <AlertTriangle className="w-3 h-3 text-red-500" />;
      default:
        return <Wifi className="w-3 h-3 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status.state) {
      case 'connected':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'connecting':
      case 'reconnecting':
      case 'retrying':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'offline':
        return 'bg-orange-50 border-orange-200 text-orange-700';
      case 'failed':
        return 'bg-red-50 border-red-200 text-red-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  const shouldShowRetryButton = () => {
    return status.canRetry && onRetry && (status.state === 'failed' || status.state === 'offline');
  };

  const shouldShowStatus = () => {
    // Always show if there's an issue or if actively connecting
    return status.state !== 'connected' && status.state !== 'disconnected';
  };

  if (!shouldShowStatus() && status.state === 'connected') {
    // Show a minimal connected indicator
    return (
      <div className={`fixed top-4 right-4 z-50 ${className}`}>
        <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 text-xs">
          <CheckCircle className="w-3 h-3 mr-1" />
          Conectado
        </Badge>
      </div>
    );
  }

  if (!shouldShowStatus()) {
    return null;
  }

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm
        ${getStatusColor()}
      `}>
        {getStatusIcon()}
        
        <span className="text-sm font-medium">
          {getMessage(status.state)}
        </span>

        {status.retryCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {status.retryCount}/{status.state === 'retrying' ? '6' : '∞'}
          </Badge>
        )}

        {shouldShowRetryButton() && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="h-6 px-2 text-xs ml-1"
          >
            <RotateCw className="w-3 h-3 mr-1" />
            Reintentar
          </Button>
        )}
      </div>

      {/* Extended info for failed state */}
      {status.state === 'failed' && status.lastError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {status.lastError}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;