
import React, { useRef } from 'react';
import { Navigate } from 'react-router-dom';

// Redirect to the Home page as we're consolidating functionality
const Index = () => {
  return <Navigate to="/" replace />;
};

export default Index;  