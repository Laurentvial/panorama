import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import Login from './components/LoginPage';
import AdminLoginPage from './components/AdminLoginPage';
import Dashboard from './components/Dashboard';
import NotFound from './components/NotFound';
import UsersAndTeams from './components/UsersTeams';
import Planning from './components/PlanningCalendar';
import Clients from './components/Clients';
import AddClient from './components/AddClient';
import { ClientDetail } from './components/ClientDetail';
import { ManageRibs } from './components/ManageRibs';
import { ManageAssets } from './components/ManageAssets';
import { ManageUsefulLinks } from './components/ManageUsefulLinks';
import { ManageNews } from './components/ManageNews';
import { Transactions } from './components/Transactions';
import { Messagerie } from './components/Messagerie';
import { ProduitsInvestissements } from './components/ProduitsInvestissements';
import { AddProduct } from './components/AddProduct';
import { EditProduct } from './components/EditProduct';
import { Positions } from './components/Positions';
import { PlatformDashboard } from './components/PlatformDashboard';
import { PlatformPortfolio } from './components/PlatformPortfolio';
import { PlatformTrading } from './components/PlatformTrading';
import { PlatformDiscover } from './components/PlatformDiscover';
import { PlatformAccountVerification } from './components/PlatformAccountVerification';
import { PlatformLayout } from './components/PlatformLayout';
import { ProductDetail } from './components/ProductDetail';
import { UserProvider } from './contexts/UserContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { PlatformSearchProvider } from './contexts/PlatformSearchContext';
import ProtectedRoute from './components/ProtectedRoute';
import ClientProtectedRoute from './components/ClientProtectedRoute';
import { ClientImpersonate } from './components/ClientImpersonate';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';
import { Settings } from './components/Settings';
import './styles/Card.css';

function Logout() {
    const sessionToken = sessionStorage.getItem('access');
    const sessionUserType = sessionStorage.getItem('userType');
    const localToken = localStorage.getItem('access');
    const localUserType = localStorage.getItem('userType');

    const isClientSession =
      (sessionToken && (sessionUserType === 'client' || sessionToken.startsWith('client_'))) ||
      (localToken && (localUserType === 'client' || localToken.startsWith('client_')));

    // Never nuke all localStorage (would log out admin in other tabs).
    if (isClientSession) {
      sessionStorage.removeItem('access');
      sessionStorage.removeItem('userType');
      sessionStorage.removeItem('clientData');
      // Also clear persisted client login if that is the active context.
      if (localUserType === 'client' || (localToken && localToken.startsWith('client_'))) {
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        localStorage.removeItem('userType');
        localStorage.removeItem('clientData');
      }
      return <Navigate to="/login" />;
    }

    // Admin logout
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('userType');
    localStorage.removeItem('clientData');
    return <Navigate to="/admin/login" />;
}

function LegacyClientRedirect() {
    const { id } = useParams<{ id: string }>();
    return <Navigate to={`/admin/clients/${id}`} replace />;
}

function ClientDetailWrapper() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    if (!id) {
        return <Navigate to="/admin/clients" />;
    }
    
    return <ClientDetail clientId={id} onBack={() => navigate('/admin/clients')} />;
}

function PlacementsWrapper() {
    return <ProduitsInvestissements user={null} />;
}

function App() {
    return (
        <Router>
            <UserProvider>
                <ThemeProvider>
                    <Toaster />
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/admin/login" element={<AdminLoginPage />} />
                    <Route path="/logout" element={<Logout />} />
                    
                    {/* Admin/CRM Routes - All under /admin */}
                    <Route path="/admin" element={
                        <ProtectedRoute>
                            <Layout>
                                <Dashboard />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/dashboard" element={
                        <ProtectedRoute>
                            <Layout>
                                <Dashboard />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/users" element={
                        <ProtectedRoute>
                            <Layout>
                                <UsersAndTeams />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/planning" element={
                        <ProtectedRoute>
                            <Layout>
                                <Planning />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/clients" element={
                        <ProtectedRoute>
                            <Layout>
                                <Clients onSelectClient={() => {}} />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/clients/add" element={
                        <ProtectedRoute>
                            <Layout>
                                <AddClient />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/clients/:id" element={
                        <ProtectedRoute>
                            <Layout>
                                <ClientDetailWrapper />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/manage/ribs" element={
                        <ProtectedRoute>
                            <Layout>
                                <ManageRibs />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/manage/assets" element={
                        <ProtectedRoute>
                            <Layout>
                                <ManageAssets />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/manage/useful-links" element={
                        <ProtectedRoute>
                            <Layout>
                                <ManageUsefulLinks />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/manage/news" element={
                        <ProtectedRoute>
                            <Layout>
                                <ManageNews />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/transactions" element={
                        <ProtectedRoute>
                            <Layout>
                                <Transactions />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/messagerie" element={
                        <ProtectedRoute>
                            <Layout>
                                <Messagerie />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/positions" element={
                        <ProtectedRoute>
                            <Layout>
                                <Positions />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements" element={
                        <ProtectedRoute>
                            <Layout>
                                <PlacementsWrapper />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements/add" element={
                        <ProtectedRoute>
                            <Layout>
                                <AddProduct />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements/edit/:id" element={
                        <ProtectedRoute>
                            <Layout>
                                <EditProduct />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/settings" element={
                        <ProtectedRoute>
                            <Layout>
                                <Settings />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    {/* Legacy route redirect */}
                    <Route path="/admin/placements" element={<Navigate to="/admin/produits-investissements" replace />} />
                    <Route path="/admin/placements/add" element={<Navigate to="/admin/produits-investissements/add" replace />} />
                    <Route path="/admin/placements/edit/:id" element={<Navigate to="/admin/produits-investissements/edit/:id" replace />} />
                    
                    {/* Trading Platform Routes - For Clients */}
                    <Route path="/platform/impersonate/:id" element={
                        <ProtectedRoute>
                            <ClientImpersonate />
                        </ProtectedRoute>
                    } />
                    <Route path="/platform" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <PlatformDashboard />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/portfolio" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <PlatformPortfolio />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/verification" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <PlatformAccountVerification />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    {/* Legacy route redirect */}
                    <Route path="/platform/trading" element={<Navigate to="/platform/funds" replace />} />
                    <Route path="/platform/trading/*" element={<Navigate to="/platform/funds" replace />} />

                    <Route path="/platform/funds" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <PlatformTrading />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/discover" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <PlatformDiscover />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/product/:id" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <PlatformLayout>
                                    <ProductDetail />
                                </PlatformLayout>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    
                    {/* Legacy route redirects - redirect old routes to /admin */}
                    <Route path="/clients" element={<Navigate to="/admin/clients" replace />} />
                    <Route path="/clients/add" element={<Navigate to="/admin/clients/add" replace />} />
                    <Route path="/clients/:id" element={<LegacyClientRedirect />} />
                    <Route path="/users" element={<Navigate to="/admin/users" replace />} />
                    <Route path="/planning" element={<Navigate to="/admin/planning" replace />} />
                    <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="/manage/ribs" element={<Navigate to="/admin/manage/ribs" replace />} />
                    <Route path="/manage/assets" element={<Navigate to="/admin/manage/assets" replace />} />
                    <Route path="/manage/useful-links" element={<Navigate to="/admin/manage/useful-links" replace />} />
                    <Route path="/transactions" element={<Navigate to="/admin/transactions" replace />} />
                    <Route path="/messagerie" element={<Navigate to="/admin/messagerie" replace />} />
                    <Route path="/placements" element={<Navigate to="/admin/produits-investissements" replace />} />
                    
                    {/* Root redirect based on user type */}
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    
                    {/* 404 */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
                </ThemeProvider>
            </UserProvider>
        </Router>
    );
}

export default App;

