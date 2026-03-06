import React from 'react';
import { Outlet } from 'react-router-dom';
import Layout from './Layout';

/**
 * LayoutWrapper mantiene el Layout montado entre navegaciones,
 * evitando el parpadeo del Sidebar y su footer al cambiar de ruta.
 * 
 * Usa Outlet para renderizar las rutas hijas sin desmontar el Layout.
 */
const LayoutWrapper: React.FC = () => {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export default LayoutWrapper;

