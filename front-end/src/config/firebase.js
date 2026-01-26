import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import logger from '../utils/logger';

// Firebase configuration - fetched from backend for security
let firebaseApp = null;
let auth = null;
let googleProvider = null;
let githubProvider = null;

export const initializeFirebase = async () => {
  if (firebaseApp) return { auth, googleProvider, githubProvider };

  try {
    // Fetch Firebase config from backend
    const response = await fetch('/firebase-config');
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error('Failed to fetch Firebase config');
    }

    const firebaseConfig = data.config;
    
    // Initialize Firebase
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    
    // Configure Google provider
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });

    // Configure GitHub provider
    githubProvider = new GithubAuthProvider();
    githubProvider.addScope('read:user');
    githubProvider.addScope('user:email');

    return { auth, googleProvider, githubProvider };
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
    throw error;
  }
};

export const getFirebaseAuth = () => auth;
export const getGoogleProvider = () => googleProvider;
export const getGithubProvider = () => githubProvider;
