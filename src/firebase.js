import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth"; 
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyD-4etlbzE3zfCcJwWRAL_Q4OYT1SZDz3s",
  authDomain: "onskelistan-2026.firebaseapp.com",
  projectId: "onskelistan-2026",
  storageBucket: "onskelistan-2026.firebasestorage.app",
  messagingSenderId: "928231779837",
  appId: "1:928231779837:web:0ee6669b74838ea24c7d94",
  measurementId: "G-YXW1BM11R2"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const analytics = getAnalytics(app);