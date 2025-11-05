import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Pages/Login';
import Home from './Pages/Home';
import NotFound from './Pages/NotFound';
import UsersAndTeams from './Pages/UsersAndTeams';
import Planning from './Pages/Planning';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';

function Logout() {
    localStorage.clear();
    return <Navigate to="/login" />;
}

function App() {
    return (
        <Router>
            <UserProvider>
                <Toaster />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/logout" element={<Logout />} />
                    <Route path="/" element={
                        <ProtectedRoute>
                            <Layout>
                                <Home />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/home" element={
                        <ProtectedRoute>
                            <Layout>
                                <Home />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/users" element={
                        <ProtectedRoute>
                            <Layout>
                                <UsersAndTeams />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/planning" element={
                        <ProtectedRoute>
                            <Layout>
                                <Planning />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={
                        <ProtectedRoute>
                            <Layout>
                                <NotFound />
                            </Layout>
                        </ProtectedRoute>
                    } />
                </Routes>
            </UserProvider>
        </Router>
    );
}

export default App;


// // Lazy load page components that export named components
// const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
// const Planning = lazy(() => import('./components/Planning').then(m => ({ default: m.Planning })));
// const UsersTeams = lazy(() => import('./components/UsersTeams').then(m => ({ default: m.UsersTeams })));
// const Clients = lazy(() => import('./components/Clients').then(m => ({ default: m.Clients })));
// const ClientDetail = lazy(() => import('./components/ClientDetail').then(m => ({ default: m.ClientDetail })));
// const Transactions = lazy(() => import('./components/Transactions').then(m => ({ default: m.Transactions })));
// const Messagerie = lazy(() => import('./components/Messagerie').then(m => ({ default: m.Messagerie })));
// const Placements = lazy(() => import('./components/Placements').then(m => ({ default: m.Placements })));

// export default function App() {
//   // Don't use generic parameters inside useState: use type assertion if you must
//   const [isAuthenticated, setIsAuthenticated] = useState(false);
//   const [currentUser, setCurrentUser] = useState(null as any);
//   const [currentPage, setCurrentPage] = useState('dashboard');
//   const [selectedClientId, setSelectedClientId] = useState(null as string | null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     checkAuth();
//     // eslint-disable-next-line
//   }, []);

//   async function checkAuth() {
//     try {
//       const session = await getSession();
//       if (session) {
//         const { user } = await apiCall('/auth/me');
//         setCurrentUser(user);
//         setIsAuthenticated(true);
//       }
//     } catch (error) {
//       console.error('Auth check failed:', error);
//     } finally {
//       setLoading(false);
//     }
//   }

//   function handleLogin(user: any) {
//     setCurrentUser(user);
//     setIsAuthenticated(true);
//   }

//   function handleLogout() {
//     setIsAuthenticated(false);
//     setCurrentUser(null);
//     setCurrentPage('dashboard');
//   }

//   function navigateTo(page: string, clientId?: string) {
//     startTransition(() => {
//       setCurrentPage(page);
//       if (clientId) {
//         setSelectedClientId(clientId);
//       }
//     });
//   }

//   if (loading) {
//     return (
//       <div className="min-h-screen bg-slate-50 flex items-center justify-center">
//         <div className="text-center">
//           <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
//           <p className="text-slate-600">Chargement...</p>
//         </div>
//       </div>
//     );
//   }

//   if (!isAuthenticated) {
//     return <LoginPage onLogin={handleLogin} />;
//   }

//   return (
//     <div className="min-h-screen bg-slate-50">
//       <Header user={currentUser} onLogout={handleLogout} />
      
//       <div className="flex">
//         <Sidebar 
//           currentPage={currentPage} 
//           onNavigate={navigateTo}
//           userRole={currentUser?.role}
//         />

//         <main className="flex-1 p-8">
//           <Suspense fallback={<div className="p-8 text-slate-600">Chargement…</div>}>
//             {/* Explicitly ensure elements are valid JSX components */}
//             {currentPage === 'dashboard' && Dashboard && React.createElement(Dashboard, { user: currentUser })}
//             {currentPage === 'planning' && Planning && React.createElement(Planning, { user: currentUser })}
//             {currentPage === 'users-teams' && UsersTeams && React.createElement(UsersTeams, { user: currentUser })}
//             {currentPage === 'clients' && Clients && React.createElement(Clients, { onSelectClient: (id: string) => navigateTo('client-detail', id) })}
//             {currentPage === 'client-detail' && selectedClientId && ClientDetail && React.createElement(ClientDetail, { clientId: selectedClientId, onBack: () => navigateTo('clients') })}
//             {currentPage === 'transactions' && Transactions && React.createElement(Transactions, { user: currentUser })}
//             {currentPage === 'messagerie' && Messagerie && React.createElement(Messagerie, { user: currentUser })}
//             {currentPage === 'placements' && Placements && React.createElement(Placements, { user: currentUser })}
//           </Suspense>
//         </main>
//       </div>
//     </div>
//   );
// }

