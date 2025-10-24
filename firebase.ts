
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics"; // (Optional)

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA5Y5m_fC730VJL2LC-dhnRejsPru8o-vU",
  authDomain: "tour-quote-app.firebaseapp.com",
  projectId: "tour-quote-app",
  storageBucket: "tour-quote-app.firebasestorage.app",
  messagingSenderId: "644830952681",
  appId: "1:644830952681:web:0e8221c1798e60bb318478",
  measurementId: "G-PW49GCGBWN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore DB instance
// This 'db' variable will be used throughout the app to communicate with Firestore.
export const db = getFirestore(app);
// const analytics = getAnalytics(app); // (Optional)
