// Commit de prueba - rama dev-david - test comment added
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { navItems } from "./nav-items";
import MyCompany from "./pages/MyCompany";
import AdminRequests from "./pages/AdminRequests";
import SupplierDetail from "./pages/SupplierDetail";
import RFXProjects from "./pages/RFXProjects";
import RFXDetail from "./pages/RFXDetail";
import RFXSpecsPage from "./pages/RFXSpecsPage";
import RFXCandidatesPage from "./pages/RFXCandidatesPage";
import RFXSendingPage from "./pages/RFXSendingPage";
import RFXResponsesPage from "./pages/RFXResponsesPage";
import FQAgent from "./pages/FQAgent";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ProductsEdit from "./pages/ProductsEdit";
import DeveloperFeedback from "@/pages/DeveloperFeedback";
import Feedback from "@/pages/Feedback";
import SavedSuppliers from "@/pages/SavedSuppliers";
import DatabaseCompanyRequests from "@/pages/DatabaseCompanyRequests";
import CreateCompanyManual from "@/pages/CreateCompanyManual";
import Traffic from "@/pages/Traffic";
import RFXManagement from "./pages/RFXManagement";
import DeveloperMailAllMembers from "@/pages/DeveloperMailAllMembers";
import RFXViewer from "@/pages/RFXViewer";
import RFXPublicExample from "@/pages/RFXPublicExample";
import RFXPublicSpecsPage from "@/pages/RFXPublicSpecsPage";
import RFXPublicPlaceholderPage from "@/pages/RFXPublicPlaceholderPage";
import NotificationsCenter from "@/pages/NotificationsCenter";
import DeveloperSubscriptions from "@/pages/DeveloperSubscriptions";
import MySubscription from "@/pages/MySubscription";
import PaymentSuccess from "@/pages/PaymentSuccess";
import NotFound from "./pages/NotFound";

import Settings from "./pages/Settings";
import DatabaseManager from "./pages/DatabaseManager";
import Conversations from "./pages/Conversations";
import ConversationViewer from "./pages/ConversationViewer";
import ChatExample from "./pages/ChatExample";
import EmbeddingAnalytics from "./pages/EmbeddingAnalytics";
import AddCompanyToDB from "./pages/AddCompanyToDB";
import Layout from "@/components/Layout";
import LayoutWrapper from "@/components/LayoutWrapper";
import FooterLayout from "@/components/FooterLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ProtectedSupplierRoute } from "@/components/ProtectedSupplierRoute";
import { ProtectedAdminRoute } from "@/components/ProtectedAdminRoute";
import ProtectedSupplierSearch from "@/components/ProtectedSupplierSearch";
import CompanyManagement from "@/pages/CompanyManagement";
import CompanyEditForm from "@/components/company/CompanyEditForm";
import { ConversationsProvider } from "@/contexts/ConversationsContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import ProfileCompletionHandler from "@/components/ProfileCompletionHandler";
import MaintenancePage from "@/components/MaintenancePage";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

const queryClient = new QueryClient();

const App = () => {
  const { t } = useTranslation();
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cargar configuración de mantenimiento desde archivo JSON
    fetch('/maintenance.json')
      .then(response => response.json())
      .then(data => {
        setIsMaintenanceMode(data.enabled);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading maintenance config:', error);
        setIsMaintenanceMode(false);
        setIsLoading(false);
      });
  }, []);

  // Mostrar loading mientras se carga la configuración
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f1e8f4] to-[#f4a9aa]/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a] mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Si está en modo mantenimiento, mostrar solo la página de mantenimiento
  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ConversationsProvider>
            <NotificationsProvider>
              <BrowserRouter>
                <NavigationProvider>
                  <ProfileCompletionHandler />
                <Routes>
                {/* Ruta sin sidebar */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {/* Public payment success page — no auth, no sidebar, for financial officers */}
                <Route path="/payment-success" element={<PaymentSuccess />} />
              
                {/* Rutas con layout persistente - evita parpadeo del Sidebar */}
                <Route element={<LayoutWrapper />}>
                  {/* Rutas con sidebar y layout */}
                  {navItems.filter(item => 
                    item.to !== '/settings' && 
                    item.to !== '/' && 
                    item.to !== '/supplier-search' &&
                    item.to !== '/saved-suppliers' &&
                    !item.developerOnly &&
                    !item.authRequired
                  ).map(({ to, page: Component, title }) => {
                    return (
                      <Route 
                        key={to} 
                        path={to} 
                        element={<Component />} 
                      />
                    );
                  })}
                  
                  {/* Ruta específica para Saved Suppliers con FooterLayout */}
                  <Route path="/saved-suppliers" element={
                    <FooterLayout>
                      <SavedSuppliers />
                    </FooterLayout>
                  } />
                  
                  {/* Ruta específica para Supplier Search con FooterLayout */}
                  <Route path="/supplier-search" element={
                    <FooterLayout>
                      <ProtectedSupplierSearch />
                    </FooterLayout>
                  } />
                  
                  {/* Ruta raíz - Landing page */}
                  <Route path="/" element={<Home />} />
                  
                  {/* Ruta protegida para Settings */}
                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  } />

                  
                  {/* Ruta protegida para Database Manager */}
                  <Route path="/database-manager" element={
                    <ProtectedRoute>
                      <DatabaseManager />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Conversations */}
                  <Route path="/conversations" element={
                    <ProtectedRoute>
                      <Conversations />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Embedding Analytics */}
                  <Route path="/embedding-analytics" element={
                    <ProtectedRoute>
                      <EmbeddingAnalytics />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para ConversationViewer */}
                  <Route path="/conversations/view/:id" element={
                    <ProtectedRoute>
                      <ConversationViewer />
                    </ProtectedRoute>
                  } />
                  
                  {/* Notifications Center - Authenticated users */}
                  <Route path="/notifications" element={
                    <ProtectedSupplierRoute>
                      <NotificationsCenter />
                    </ProtectedSupplierRoute>
                  } />

                  {/* Redirect old pricing URL to my-subscription */}
                  <Route path="/pricing" element={<Navigate to="/my-subscription" replace />} />

                  {/* Buyer subscription page */}
                  <Route path="/my-subscription" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <MySubscription />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  
                  {/* Ruta protegida para Add Company to DB */}
                  <Route path="/add-company" element={
                    <ProtectedSupplierRoute>
                      <AddCompanyToDB />
                    </ProtectedSupplierRoute>
                  } />
                  
                  {/* Ruta protegida para My Company - Usuarios autenticados */}
                  <Route path="/my-company" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <MyCompany />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />

                  {/* Ruta para visualizar RFX como supplier */}
                  <Route path="/rfx-viewer/:invitationId" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <RFXViewer />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  
                  {/* Public RFX example viewer - No authentication required */}
                  <Route path="/rfx-example/:id" element={
                    <FooterLayout>
                      <RFXPublicExample />
                    </FooterLayout>
                  } />
                  <Route path="/rfx-example/specs/:id" element={
                    <RFXPublicSpecsPage />
                  } />
                  <Route path="/rfx-example/candidates/:id" element={
                    <FooterLayout>
                      <RFXCandidatesPage readOnly isPublicExample />
                    </FooterLayout>
                  } />
                  <Route path="/rfx-example/sending/:id" element={
                    <FooterLayout>
                      <RFXSendingPage readOnly isPublicExample />
                    </FooterLayout>
                  } />
                  <Route path="/rfx-example/responses/:id" element={
                    <FooterLayout>
                      <RFXResponsesPage readOnly isPublicExample />
                    </FooterLayout>
                  } />
                  
                  {/* Ruta protegida para Admin Requests - Solo desarrolladores */}
                  <Route path="/admin-requests" element={
                    <ProtectedRoute>
                      <AdminRequests />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Database Company Requests - Solo desarrolladores */}
                  <Route path="/database-company-requests" element={
                    <ProtectedRoute>
                      <DatabaseCompanyRequests />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Create Company Manual - Solo desarrolladores */}
                  <Route path="/create-company-manual" element={
                    <ProtectedRoute>
                      <CreateCompanyManual />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Traffic - Solo desarrolladores */}
                  <Route path="/traffic" element={
                    <ProtectedRoute>
                      <Traffic />
                    </ProtectedRoute>
                  } />

                  {/* Ruta protegida para Mail all members - Solo desarrolladores */}
                  <Route path="/developer-mail-all-members" element={
                    <ProtectedRoute>
                      <DeveloperMailAllMembers />
                    </ProtectedRoute>
                  } />

                  {/* Ruta protegida para Subscriptions & Seats - Solo desarrolladores */}
                  <Route path="/developer-subscriptions" element={
                    <ProtectedRoute>
                      <DeveloperSubscriptions />
                    </ProtectedRoute>
                  } />

                  {/* Ruta protegida para RFX Management - Solo desarrolladores */}
                  <Route path="/rfx-management" element={
                    <ProtectedRoute>
                      <RFXManagement />
                    </ProtectedRoute>
                  } />
                  
                  {/* Ruta protegida para Company Management - Solo administradores */}
                  <Route path="/company-management/:slug" element={
                    <ProtectedAdminRoute>
                      <CompanyManagement />
                    </ProtectedAdminRoute>
                  } />
                
                  {/* Ruta para editar empresa como admin */}
                  <Route path="/my-company/edit" element={
                    <CompanyEditForm />
                  } />
                  
                  {/* Ruta para editar productos de empresa */}
                  <Route path="/my-company/products-edit" element={
                    <ProtectedSupplierRoute>
                      <ProductsEdit />
                    </ProtectedSupplierRoute>
                  } />
                  
                  {/* Rutas adicionales con layout */}
                  <Route path="/suppliers/:slug" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <SupplierDetail />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  <Route path="/suppliers/:slug/product/:productName" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <SupplierDetail />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  {/* RFX Projects routes - Public access */}
                  <Route path="/rfxs" element={
                    <FooterLayout>
                      <RFXProjects />
                    </FooterLayout>
                  } />
                  <Route path="/rfxs/:id" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <RFXDetail />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  <Route path="/rfxs/specs/:rfxId" element={
                    <ProtectedSupplierRoute>
                      <RFXSpecsPage />
                    </ProtectedSupplierRoute>
                  } />
                  <Route path="/rfxs/candidates/:rfxId" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <RFXCandidatesPage />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  <Route path="/rfxs/sending/:rfxId" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <RFXSendingPage />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  <Route path="/rfxs/responses/:rfxId" element={
                    <ProtectedSupplierRoute>
                      <FooterLayout>
                        <RFXResponsesPage />
                      </FooterLayout>
                    </ProtectedSupplierRoute>
                  } />
                  
                  {/* Discovery Agent - Chat route */}
                  <Route path="/chat" element={<FQAgent />} />
                  <Route path="/chat/:id" element={<FQAgent />} />
                  
                  {/* Public Example Conversations - No authentication required */}
                  <Route path="/chat-example/:id" element={<ChatExample />} />
                  
                  <Route path="/feedback" element={<FooterLayout><Feedback /></FooterLayout>} />
                  <Route path="/developer-feedback" element={<ProtectedRoute><DeveloperFeedback /></ProtectedRoute>} />

                  {/* Catch-all 404 dentro del layout persistente */}
                  <Route
                    path="*"
                    element={
                      <FooterLayout>
                        <NotFound />
                      </FooterLayout>
                    }
                  />
                </Route>
              </Routes>
                </NavigationProvider>
              </BrowserRouter>
            </NotificationsProvider>
          </ConversationsProvider>
        </TooltipProvider>
      </AuthProvider>
      {import.meta.env.PROD ? <Analytics /> : null}
    </QueryClientProvider>
  );
};

export default App;