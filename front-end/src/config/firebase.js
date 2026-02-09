import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirebaseConfig } from '../api';
import logger from '../utils/logger';
let firebaseApp = null;
let auth = null;
let googleProvider = null;
let githubProvider = null;

export const initializeFirebase = async () => {
  if (firebaseApp) return { auth, googleProvider, githubProvider };

  try {
    const data = await getFirebaseConfig();
    
    if (data.status !== 'success') {
      throw new Error('Failed to fetch Firebase config');
    }

    const firebaseConfig = data.config;
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });
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
