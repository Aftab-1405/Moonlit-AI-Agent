import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { initializeFirebase, getFirebaseAuth, getGoogleProvider, getGithubProvider } from '../config/firebase';
import { setSession as setBackendSession, logout as logoutBackend } from '../api';
import logger from '../utils/logger';
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768);
};
const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Email already registered.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/operation-not-allowed': 'Sign-in method not enabled.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-disabled': 'Account disabled.',
  'auth/user-not-found': 'No account found.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/popup-closed-by-user': 'Sign-in cancelled.',
  'auth/account-exists-with-different-credential': 'Email exists with different sign-in method.',
};

const getErrorMessage = (error) => ERROR_MESSAGES[error.code] || error.message;

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- Hook export alongside Provider is valid React pattern
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const init = async () => {
      try {
        await initializeFirebase();
        setInitialized(true);

        const auth = getFirebaseAuth();
        if (auth) {
          try {
            await getRedirectResult(auth);
          } catch (redirectError) {
            logger.error('Redirect result error:', redirectError);
            if (redirectError.code && redirectError.code !== 'auth/popup-closed-by-user') {
              setError(getErrorMessage(redirectError));
            }
          }
          const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
                photoURL: firebaseUser.photoURL,
              });
              try {
                const idToken = await firebaseUser.getIdToken();
                await setBackendSession({
                  user: {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL
                  },
                  idToken
                });
              } catch (err) {
                logger.error('Failed to set session:', err);
              }
            } else {
              setUser(null);
            }
            setLoading(false);
          });

          return () => unsubscribe();
        }
      } catch (err) {
        logger.error('Firebase init error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    init();
  }, []);
  const signUpWithEmail = useCallback(async (email, password, displayName = '') => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase not initialized');

      const result = await createUserWithEmailAndPassword(auth, email, password);

      if (displayName) {
        await updateProfile(result.user, { displayName });
      }

      return result.user;
    } catch (err) {
      logger.error('Sign up error:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, []);
  const signInWithEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase not initialized');

      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (err) {
      logger.error('Sign in error:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, []);
  const resetPassword = useCallback(async (email) => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase not initialized');

      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      logger.error('Password reset error:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, []);
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const provider = getGoogleProvider();

      if (!auth || !provider) {
        throw new Error('Firebase not initialized');
      }

      if (isMobileDevice()) {
        await signInWithRedirect(auth, provider);
        return null;
      } else {
        const result = await signInWithPopup(auth, provider);
        return result.user;
      }
    } catch (err) {
      logger.error('Google sign in error:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, []);
  const signInWithGitHub = useCallback(async () => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const provider = getGithubProvider();

      if (!auth || !provider) {
        throw new Error('Firebase not initialized');
      }

      if (isMobileDevice()) {
        await signInWithRedirect(auth, provider);
        return null;
      } else {
        const result = await signInWithPopup(auth, provider);
        return result.user;
      }
    } catch (err) {
      logger.error('GitHub sign in error:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, []);
  const logout = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      if (auth) {
        await signOut(auth);
      }
      await logoutBackend();
      setUser(null);
    } catch (err) {
      logger.error('Logout error:', err);
      setError(getErrorMessage(err));
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);
  const value = useMemo(() => ({
    user,
    loading,
    error,
    initialized,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithGitHub,
    resetPassword,
    logout,
    clearError,
    isAuthenticated: !!user,
  }), [
    user, loading, error, initialized,
    signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGitHub,
    resetPassword, logout, clearError
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
