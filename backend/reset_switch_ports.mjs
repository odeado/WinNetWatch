// Script para resetear todas las asignaciones de bocas de switch en Firestore
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAptyWP56e5m8nxprmxNQpETfWwHOlvBkY",
  authDomain: "network-monitor-36186.firebaseapp.com",
  projectId: "network-monitor-36186",
  storageBucket: "network-monitor-36186.firebasestorage.app",
  messagingSenderId: "932439890545",
  appId: "1:932439890545:web:878f4ce1f5ae7f79b459d0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function resetSwitchPorts() {
  console.log('Descargando todos los dispositivos de Firestore...');
  const devicesSnap = await getDocs(collection(db, 'devices'));
  
  let total = 0;
  let cleared = 0;
  
  for (const docSnap of devicesSnap.docs) {
    total++;
    const data = docSnap.data();
    
    if (data.switch_id || data.switch_port) {
      console.log(`  Limpiando: ${data.hostname || data.ip || docSnap.id} (switch_id=${data.switch_id}, switch_port=${data.switch_port})`);
      await updateDoc(doc(db, 'devices', docSnap.id), {
        switch_id: null,
        switch_port: null
      });
      cleared++;
    }
  }
  
  console.log(`\nResultado: ${cleared} dispositivos limpiados de ${total} totales.`);
  console.log('Todas las asignaciones de bocas de switch han sido reseteadas.');
  process.exit(0);
}

resetSwitchPorts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
