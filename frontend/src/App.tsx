import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { PlatformSearchProvider } from './contexts/PlatformSearchContext';
import { AdminRoleProtectedRoute } from './components/RoleProtectedRoute';
import ClientProtectedRoute from './components/ClientProtectedRoute';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from './utils/constants';
import './styles/Card.css';

// Lazy load all route components for better performance
const Login = lazy(() => import('./components/LoginPage'));
const ClientForgotPasswordPage = lazy(() => import('./components/ClientForgotPasswordPage'));
const ClientResetPasswordPage = lazy(() => import('./components/ClientResetPasswordPage'));
const ClientOtpLoginPage = lazy(() => import('./components/ClientOtpLoginPage'));
const AdminLoginPage = lazy(() => import('./components/AdminLoginPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const NotFound = lazy(() => import('./components/NotFound'));
const UsersAndTeams = lazy(() => import('./components/UsersTeams'));
const Clients = lazy(() => import('./components/Clients'));
const AddClient = lazy(() => import('./components/AddClient'));
const ClientDetail = lazy(() => import('./components/ClientDetail').then(m => ({ default: m.ClientDetail })));
const ManageRibs = lazy(() => import('./components/ManageRibs').then(m => ({ default: m.ManageRibs })));
const ManageAssets = lazy(() => import('./components/ManageAssets').then(m => ({ default: m.ManageAssets })));
const ManageUsefulLinks = lazy(() => import('./components/ManageUsefulLinks').then(m => ({ default: m.ManageUsefulLinks })));
const ManageNews = lazy(() => import('./components/ManageNews').then(m => ({ default: m.ManageNews })));
const Transactions = lazy(() => import('./components/Transactions').then(m => ({ default: m.Transactions })));
const PlatformLogs = lazy(() => import('./components/PlatformLogs').then(m => ({ default: m.PlatformLogs })));
const Messagerie = lazy(() => import('./components/Messagerie').then(m => ({ default: m.Messagerie })));
const ProduitsInvestissements = lazy(() => import('./components/ProduitsInvestissements').then(m => ({ default: m.ProduitsInvestissements })));
const AddProduct = lazy(() => import('./components/AddProduct').then(m => ({ default: m.AddProduct })));
const EditProduct = lazy(() => import('./components/EditProduct').then(m => ({ default: m.EditProduct })));
const Positions = lazy(() => import('./components/Positions').then(m => ({ default: m.Positions })));
const PlatformDashboard = lazy(() => import('./components/PlatformDashboard').then(m => ({ default: m.PlatformDashboard })));
const PlatformPortfolio = lazy(() => import('./components/PlatformPortfolio').then(m => ({ default: m.PlatformPortfolio })));
const PlatformTrading = lazy(() => import('./components/PlatformTrading').then(m => ({ default: m.PlatformTrading })));
const PlatformDiscover = lazy(() => import('./components/PlatformDiscover').then(m => ({ default: m.PlatformDiscover })));
const PlatformUsefulLinks = lazy(() => import('./components/PlatformUsefulLinks').then(m => ({ default: m.PlatformUsefulLinks })));
const PlatformProfilePage = lazy(() => import('./components/PlatformProfilePage').then(m => ({ default: m.PlatformProfilePage })));
const PlatformTransfertProprietePage = lazy(() => import('./components/PlatformTransfertProprietePage').then(m => ({ default: m.PlatformTransfertProprietePage })));
const PlatformAccountVerification = lazy(() => import('./components/PlatformAccountVerification').then(m => ({ default: m.PlatformAccountVerification })));
const PlatformLayout = lazy(() => import('./components/PlatformLayout').then(m => ({ default: m.PlatformLayout })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(m => ({ default: m.ProductDetail })));
const MonProfil = lazy(() => import('./components/MonProfil').then(m => ({ default: m.MonProfil })));
const ClientImpersonate = lazy(() => import('./components/ClientImpersonate').then(m => ({ default: m.ClientImpersonate })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));

// Role constants for route protection (must match Sidebar menuItems)
const ROLES_ALL = ['admin', 'teamleader', 'gestionnaire'] as const;
const ROLES_ADMIN_ONLY = ['admin'] as const;
const ROLES_ADMIN_AND_TEAMLEADER = ['admin', 'teamleader'] as const;

// Loading fallback component
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
    <div>Chargement...</div>
  </div>
);

function Logout() {
    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
    const sessionUserType = sessionStorage.getItem('userType');
    const localUserType = localStorage.getItem('userType');
    const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);

    const isClientSession =
      (sessionToken && (sessionUserType === 'client' || sessionToken.startsWith('client_'))) ||
      Boolean(clientToken);

    // Never nuke all localStorage (would log out admin in other tabs).
    if (isClientSession) {
      sessionStorage.removeItem(ACCESS_TOKEN);
      sessionStorage.removeItem('userType');
      sessionStorage.removeItem('clientData');
      // Also clear persisted client login.
      localStorage.removeItem(CLIENT_ACCESS_TOKEN);
      localStorage.removeItem('clientData');
      return <Navigate to="/login" />;
    }

    // Admin logout
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem('userType');
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
                    <Route path="/login" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <Login />
                        </Suspense>
                    } />
                    <Route path="/forgot-password" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <ClientForgotPasswordPage />
                        </Suspense>
                    } />
                    <Route path="/reset-password" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <ClientResetPasswordPage />
                        </Suspense>
                    } />
                    <Route path="/login/otp" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <ClientOtpLoginPage />
                        </Suspense>
                    } />
                    <Route path="/admin/login" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <AdminLoginPage />
                        </Suspense>
                    } />
                    <Route path="/logout" element={<Logout />} />
                    
                    {/* Admin/CRM Routes - All under /admin */}
                    <Route path="/admin" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Dashboard />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/dashboard" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Dashboard />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/users" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ADMIN_AND_TEAMLEADER}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <UsersAndTeams />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/profile" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <MonProfil />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/clients" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Clients onSelectClient={() => {}} />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/clients/add" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <AddClient />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/clients/:id" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <ClientDetailWrapper />
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/manage/ribs" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <ManageRibs />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/manage/assets" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <ManageAssets />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/manage/useful-links" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <ManageUsefulLinks />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/manage/news" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ADMIN_ONLY}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <ManageNews />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/transactions" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Transactions />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/platform-logs" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLogs />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/messagerie" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Messagerie />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/positions" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Positions />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <PlacementsWrapper />
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements/add" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <AddProduct />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/produits-investissements/edit/:id" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <EditProduct />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/admin/settings" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ADMIN_ONLY}>
                            <Layout>
                                <Suspense fallback={<LoadingFallback />}>
                                    <Settings />
                                </Suspense>
                            </Layout>
                        </AdminRoleProtectedRoute>
                    } />
                    {/* Legacy route redirect */}
                    <Route path="/admin/placements" element={<Navigate to="/admin/produits-investissements" replace />} />
                    <Route path="/admin/placements/add" element={<Navigate to="/admin/produits-investissements/add" replace />} />
                    <Route path="/admin/placements/edit/:id" element={<Navigate to="/admin/produits-investissements/edit/:id" replace />} />
                    
                    {/* Trading Platform Routes - For Clients */}
                    <Route path="/platform/impersonate/:id" element={
                        <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                            <Suspense fallback={<LoadingFallback />}>
                                <ClientImpersonate />
                            </Suspense>
                        </AdminRoleProtectedRoute>
                    } />
                    <Route path="/platform" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformDashboard />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/portfolio" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformPortfolio />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/verification" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformAccountVerification />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/profile" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformProfilePage />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/transfert-propriete" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformTransfertProprietePage />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    {/* Legacy route redirect */}
                    <Route path="/platform/trading" element={<Navigate to="/platform/funds" replace />} />
                    <Route path="/platform/trading/*" element={<Navigate to="/platform/funds" replace />} />

                    <Route path="/platform/funds" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformTrading />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/discover" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformDiscover />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/useful-links" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <PlatformUsefulLinks />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    <Route path="/platform/product/:id" element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <ProductDetail />
                                        </Suspense>
                                    </PlatformLayout>
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    } />
                    
                    {/* Legacy route redirects - redirect old routes to /admin */}
                    <Route path="/clients" element={<Navigate to="/admin/clients" replace />} />
                    <Route path="/clients/add" element={<Navigate to="/admin/clients/add" replace />} />
                    <Route path="/clients/:id" element={<LegacyClientRedirect />} />
                    <Route path="/users" element={<Navigate to="/admin/users" replace />} />
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
                    <Route path="*" element={
                        <Suspense fallback={<LoadingFallback />}>
                            <NotFound />
                        </Suspense>
                    } />
                </Routes>
                </ThemeProvider>
            </UserProvider>
        </Router>
    );
}

export default App;

