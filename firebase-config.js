import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import {
  getFirestore, enableIndexedDbPersistence, doc, setDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCJl5s3bNsq41U_9_ezkeVop1dtVHGmHmo",
  authDomain: "easynote-cb18f.firebaseapp.com",
  projectId: "easynote-cb18f",
  storageBucket: "easynote-cb18f.firebasestorage.app",
  messagingSenderId: "953585370046",
  appId: "1:953585370046:web:276aba3f9decaeb986afef"
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
const auth = getAuth(app);

// ► Connexion anonyme (pas de mot de passe à gérer)
signInAnonymously(auth).catch(console.error);

// ► Persistance hors‑ligne Firestore
enableIndexedDbPersistence(db).catch(err => {
  console.warn('IndexedDB persistence not available', err);
});
