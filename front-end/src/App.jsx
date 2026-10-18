import { Box } from '@mui/material';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import PageLoader from '@/components/common/PageLoader';
import AdminRoute from '@/guards/AdminRoute';
import ProtectedRoute from '@/guards/ProtectedRoute';

const Landing = lazy(() => import('@/pages/Landing'));
const Auth = lazy(() => import('@/pages/Auth'));
const ChatWorkspacePage = lazy(() => import('@/pages/ChatWorkspacePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));

/**
 * App root.
 *
 * Layout: a single 1fr grid row that fills the viewport. We use `100dvh`
 * (with `100vh` fallback) so mobile browser chrome (address bar / toolbar)
 * doesn't cause the layout to overflow and trigger a stray scroll.
 *
 * `overflow: hidden` on the root prevents body scroll — inner panels
 * (sidebar, message list, artifact panel) own their own scroll containers.
 */
function App() {
  return (
    <Box
      id="app-root"
      sx={{
        display: 'grid',
        // Single row that fills available height. We do NOT need a reserved
        // 0px header row — there is no global app header.
        gridTemplateRows: '1fr',
        height: '100dvh',
        // Fallback for browsers without dvh support
        '@supports not (height: 100dvh)': { height: '100vh' },
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/chat/:conversationId?"
            element={
              <ProtectedRoute>
                <ChatWorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:section?"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
        </Routes>
      </Suspense>
    </Box>
  );
}

export default App;
