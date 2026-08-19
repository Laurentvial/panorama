import React, { Suspense, useEffect } from 'react';
import { lazy } from './utils/lazyImport';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { PlatformSearchProvider } from './contexts/PlatformSearchContext';
import { AdminRoleProtectedRoute } from './components/RoleProtectedRoute';
import ClientProtectedRoute from './components/ClientProtectedRoute';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';
import LoadingIndicator from './components/LoadingIndicator';
import LoginPage from './components/LoginPage';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from './utils/constants';
import { FaviconBadgeGate } from './components/FaviconBadgeGate';
import './styles/Card.css';

// Lazy load all route components for better performance
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
const ManageWallets = lazy(() => import('./components/ManageWallets').then(m => ({ default: m.ManageWallets })));
const ManageAssets = lazy(() => import('./components/ManageAssets').then(m => ({ default: m.ManageAssets })));
const ExternalAssetDuplicatesPage = lazy(() => import('./components/ExternalAssetDuplicatesPage').then(m => ({ default: m.ExternalAssetDuplicatesPage })));
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
const PlatformTransactionsPage = lazy(() =>
  import('./components/PlatformTransactionsPage').then((m) => ({ default: m.PlatformTransactionsPage }))
);
const PlatformPositionsPage = lazy(() =>
  import('./components/PlatformPositionsPage').then((m) => ({ default: m.PlatformPositionsPage }))
);
const PlatformMessagingPage = lazy(() =>
  import('./components/PlatformMessagingPage').then((m) => ({ default: m.PlatformMessagingPage }))
);
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
const ReferralLandingPage = lazy(() => import('./components/ReferralLandingPage').then(m => ({ default: m.ReferralLandingPage })));
const LegalDocumentPage = lazy(() => import('./components/legal/LegalDocumentPage'));
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

/** Shown in the main area only while a lazy /platform/* page chunk loads (layout stays mounted). */
const PlatformPageLoading = () => (
  <div
    style={{
      display: 'flex',
      flex: 1,
      minHeight: '36vh',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 12,
    }}
  >
    <LoadingIndicator />
    <span style={{ fontSize: 14, color: '#6b7280' }}>Chargement de la page…</span>
  </div>
);

/** Blocks initial app paint until theme settings are loaded and applied. */
const ThemeBootstrapLoading = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 12,
      backgroundColor: '#f8fafc',
      color: '#334155',
    }}
  >
    <LoadingIndicator />
    <span style={{ fontSize: 14 }}>Chargement de l’interface…</span>
  </div>
);

function AppRoutes() {
    const { loading: themeLoading } = useTheme();

    if (themeLoading) {
        return <ThemeBootstrapLoading />;
    }

    return (
        <>
            <Toaster />
            <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
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
                <Route path="/invite/:code" element={
                    <Suspense fallback={<LoadingFallback />}>
                        <ReferralLandingPage />
                    </Suspense>
                } />
                <Route path="/legal/:docId" element={
                    <ClientProtectedRoute>
                        <Suspense fallback={<LoadingFallback />}>
                            <LegalDocumentPage />
                        </Suspense>
                    </ClientProtectedRoute>
                } />
                
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
                <Route path="/admin/manage/wallets" element={
                    <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                        <Layout>
                            <Suspense fallback={<LoadingFallback />}>
                                <ManageWallets />
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
                <Route path="/admin/manage/assets/duplicates" element={
                    <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
                        <Layout>
                            <Suspense fallback={<LoadingFallback />}>
                                <ExternalAssetDuplicatesPage />
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
                    <AdminRoleProtectedRoute allowedRoles={ROLES_ALL}>
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
                <Route
                    path="/platform"
                    element={
                        <ClientProtectedRoute>
                            <PlatformSearchProvider>
                                <Suspense fallback={<LoadingFallback />}>
                                    <PlatformLayout />
                                </Suspense>
                            </PlatformSearchProvider>
                        </ClientProtectedRoute>
                    }
                >
                    <Route
                        index
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformDashboard />
                            </Suspense>
                        }
                    />
                    <Route
                        path="portfolio"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformPortfolio />
                            </Suspense>
                        }
                    />
                    <Route
                        path="transactions"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformTransactionsPage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="positions"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformPositionsPage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="messaging"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformMessagingPage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="verification"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformAccountVerification />
                            </Suspense>
                        }
                    />
                    <Route
                        path="profile"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformProfilePage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="transfert-propriete"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformTransfertProprietePage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="funds"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformTrading />
                            </Suspense>
                        }
                    />
                    <Route
                        path="discover"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformDiscover />
                            </Suspense>
                        }
                    />
                    <Route
                        path="useful-links"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <PlatformUsefulLinks />
                            </Suspense>
                        }
                    />
                    <Route
                        path="product/:id"
                        element={
                            <Suspense fallback={<PlatformPageLoading />}>
                                <ProductDetail />
                            </Suspense>
                        }
                    />
                </Route>
                <Route path="/platform/trading" element={<Navigate to="/platform/funds" replace />} />
                <Route path="/platform/trading/*" element={<Navigate to="/platform/funds" replace />} />
                
                {/* Legacy route redirects - redirect old routes to /admin */}
                <Route path="/clients" element={<Navigate to="/admin/clients" replace />} />
                <Route path="/clients/add" element={<Navigate to="/admin/clients/add" replace />} />
                <Route path="/clients/:id" element={<LegacyClientRedirect />} />
                <Route path="/users" element={<Navigate to="/admin/users" replace />} />
                <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/manage/ribs" element={<Navigate to="/admin/manage/ribs" replace />} />
                <Route path="/manage/wallets" element={<Navigate to="/admin/manage/wallets" replace />} />
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
        </>
    );
}

function ScrollToTopOnRouteChange() {
    const { pathname } = useLocation();

    useEffect(() => {
        // Ensure each page navigation starts at the top.
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [pathname]);

    return null;
}

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
            <ScrollToTopOnRouteChange />
            <UserProvider>
                <ThemeProvider>
                    <FaviconBadgeGate />
                    <AppRoutes />
                </ThemeProvider>
            </UserProvider>
        </Router>
    );
}

export default App;

