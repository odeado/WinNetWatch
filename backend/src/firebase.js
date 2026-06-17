import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAptyWP56e5m8nxprmxNQpETfWwHOlvBkY",
  authDomain: "network-monitor-36186.firebaseapp.com",
  projectId: "network-monitor-36186",
  storageBucket: "network-monitor-36186.firebasestorage.app",
  messagingSenderId: "932439890545",
  appId: "1:932439890545:web:878f4ce1f5ae7f79b459d0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
