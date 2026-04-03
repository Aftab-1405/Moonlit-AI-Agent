import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import PageLoader from './components/PageLoader';
import ProtectedRoute from './guards/ProtectedRoute';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
const Chat = lazy(() => 
  Promise.all([
    import('./pages/Chat'),
    new Promise(resolve => setTimeout(resolve, 800)),
  ]).then(([module]) => module)
);

function App() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:conversationId"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Box>
  );
}

export default App;
