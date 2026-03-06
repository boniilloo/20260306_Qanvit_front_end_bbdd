import React from 'react';
import RFXFooter from '@/components/rfx/RFXFooter';

interface FooterLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout compartido para páginas que necesitan footer.
 * Este componente persiste entre navegaciones, evitando
 * el parpadeo del footer al cambiar de ruta.
 */
const FooterLayout: React.FC<FooterLayoutProps> = ({ children }) => {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-screen">
      {/* Contenido de la página */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
      {/* Footer persistente */}
      <RFXFooter />
    </div>
  );
};

export default FooterLayout;

