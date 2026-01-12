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
import { PlatformDashboard } from './components/PlatformDashboard';
import { PlatformPortfolio } from './components/PlatformPortfolio';
import { PlatformTrading } from './components/PlatformTrading';
import { PlatformDiscover } from './components/PlatformDiscover';
import { PlatformLayout } from './components/PlatformLayout';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import ClientProtectedRoute from './components/ClientProtectedRoute';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';

function Logout() {
    const userType = localStorage.getItem('userType');
    localStorage.clear();
    // Redirect based on user type
    if (userType === 'client') {
        return <Navigate to="/login" />;
    } else {
        return <Navigate to="/admin/login" />;
    }
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

function App() {
    return (
        <Router>
            <UserProvider>
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
                    
                    {/* Trading Platform Routes - For Clients */}
                    <Route path="/platform" element={
                        <ClientProtectedRoute>
                            <PlatformLayout>
                                <PlatformDashboard />
                            </PlatformLayout>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/portfolio" element={
                        <ClientProtectedRoute>
                            <PlatformLayout>
                                <PlatformPortfolio />
                            </PlatformLayout>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/trading" element={
                        <ClientProtectedRoute>
                            <PlatformLayout>
                                <PlatformTrading />
                            </PlatformLayout>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/discover" element={
                        <ClientProtectedRoute>
                            <PlatformLayout>
                                <PlatformDiscover />
                            </PlatformLayout>
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
                    <Route path="/placements" element={<Navigate to="/admin/placements" replace />} />
                    
                    {/* Root redirect based on user type */}
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    
                    {/* 404 */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </UserProvider>
        </Router>
    );
}

export default App;

