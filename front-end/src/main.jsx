import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';

/**
 * Application Entry Point
 * 
 * Provider Hierarchy (outermost to innermost):
 * 1. StrictMode - Development checks
 * 2. BrowserRouter - Routing
 * 3. ThemeProvider - MUI theme + app settings (localStorage)
 * 4. ErrorBoundary - Catches unhandled errors
 * 5. AuthProvider - Firebase authentication
 * 6. DatabaseProvider - Database connection state
 * 
 * This order ensures:
 * - Theme is available everywhere (including error fallback UI)
 * - Errors are caught before they crash the entire app
 * - Auth is available to Database (for user-specific connections in future)
 * - Database state is available to all authenticated components
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CssBaseline />
        <ErrorBoundary>
          <AuthProvider>
            <DatabaseProvider>
              <App />
            </DatabaseProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);

