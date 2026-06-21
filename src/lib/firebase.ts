import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// The values are loaded from our active project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDA628_b5x2lVhZDoA3SHd71NEhOLsxQ0g",
  authDomain: "gen-lang-client-0982855641.firebaseapp.com",
  projectId: "gen-lang-client-0982855641",
  storageBucket: "gen-lang-client-0982855641.firebasestorage.app",
  messagingSenderId: "225404715763",
  appId: "1:225404715763:web:01b3fb8176f63f846d2d86",
  firestoreDatabaseId: "ai-studio-aef210bc-fdda-413a-b39a-13778289c3bb"
};

// Initialize App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with Local persistence so the user stays logged in
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence:", error);
});

// Initialize Firestore targeting the specific database partition configured for AI Studio 
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { app, auth, db };
