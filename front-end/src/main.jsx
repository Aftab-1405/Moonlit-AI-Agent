import CssBaseline from '@mui/material/CssBaseline';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { queryClient } from '@/api/queryClient';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { DatabaseProvider } from '@/contexts/DatabaseContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UserSettingsSync } from '@/contexts/UserSettingsSync';

/**
 * Application Entry Point
 *
 * Provider Hierarchy (outermost to innermost):
 * 1. StrictMode - Development checks
 * 2. BrowserRouter - Routing
 * 3. AuthProvider - Firebase authentication and account storage identity
 * 4. ThemeProvider - MUI theme + account-scoped app settings
 * 5. ErrorBoundary - Catches unhandled application errors
 * 6. DatabaseProvider - Database connection state
 *
 * This order ensures:
 * - Auth identifies the local settings namespace before Theme initializes
 * - Theme is available to the application and error fallback UI
 * - Auth is available to Database for user-specific connections
 * - Database state is available to all authenticated components
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <CssBaseline />
            <ErrorBoundary>
              <UserSettingsSync />
              <DatabaseProvider>
                <App />
              </DatabaseProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
