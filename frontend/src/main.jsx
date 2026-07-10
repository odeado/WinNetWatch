import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Bell, Boxes, Building2, Cable, CheckCircle2, Clock3, Download,
  FileDown, Laptop, Moon, Network, Play, RefreshCw, Search, Shield, Sun,
  TerminalSquare, Users, WifiOff, User, Plus, Trash2, Cpu, Eye, LogOut, Upload, Info,
  Briefcase, MapPin, Lock, UserPlus, Edit3, ToggleLeft, ToggleRight, AlertTriangle, ChevronRight,
  Router, Printer, Server
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import './styles.css';
import { db, auth } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { signInWithEmailAndPassword, onIdTokenChanged } from 'firebase/auth';

let API_URL = localStorage.getItem('custom_api_url') || (
  import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost')
    ? import.meta.env.VITE_API_URL
    : `${window.location.protocol}//${window.location.hostname}:8080`
);

function getWsUrl(apiUrl) {
  try {
    const url = new URL(apiUrl);
    const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${url.host}/ws`;
  } catch (e) {
    return 'ws://localhost:8080/ws';
  }
}

let WS_URL = getWsUrl(API_URL);

const getInfraGroup = (item) => {
  const city = item.city || 'Antofagasta';
  const loc = (item.location || '').trim().toLowerCase();
  const ip = item.ip || '';
  
  if (city.toLowerCase() === 'antofagasta') {
    // Si la ubicación tiene un guion, separamos en sub-redes locales (ej: "Matta - RRHH")
    if (item.location && item.location.includes('-')) {
      return `Antofagasta ${item.location.trim()}`;
    }
    if (ip.startsWith('172.30.102.')) {
      return 'Antofagasta Matta';
    }
    if (ip.startsWith('172.30.100.') || ip.startsWith('172.30.101.')) {
      return 'Antofagasta Rendic';
    }
    if (loc.includes('matta')) {
      return 'Antofagasta Matta';
    }
    if (loc.includes('rendic') || loc.includes('preprensa')) {
      return 'Antofagasta Rendic';
    }
    return 'Antofagasta Rendic';
  }

  if (city.toLowerCase() === 'arica') {
    if (loc.includes('nueva') || loc.includes('nuevo')) {
      return 'Arica Edificio Nuevo';
    }
    if (loc.includes('antigua') || loc.includes('viejo') || loc.includes('vieja')) {
      return 'Arica Edificio Viejo';
    }
    return 'Arica';
  }

  return city;
};

const getPortName = (type, model, portNum) => {
  if (!portNum) return '—';
  const isFortinet = type === 'Fortinet';
  const isCisco2901 = type === 'Router';
  const isRaisecom = type === 'Conversor';
  
  if (isFortinet) {
    const labels = ['Console', 'Wan 2', 'Wan 1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];
    return labels[portNum - 1] || `Boca #${portNum}`;
  }
  if (isCisco2901) {
    const labels = ['Console', 'Aux', 'GE 0/0', 'GE 0/1'];
    return labels[portNum - 1] || `Boca #${portNum}`;
  }
  if (isRaisecom) {
    const labels = ['Optico (Fibra)', 'FastEthernet (LAN)', 'Console'];
    return labels[portNum - 1] || `Boca #${portNum}`;
  }
  return `Boca #${portNum}`;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (localStorage.getItem('use_local_api') === 'true') return;

    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const freshToken = await fbUser.getIdToken();
          localStorage.setItem('token', freshToken);
          setToken(freshToken);
        } catch (err) {
          console.error('Error refreshing Firebase token:', err);
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken('');
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!token) {
    return <Login onLogin={(session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('user', JSON.stringify(session.user));
      setToken(session.token);
      setUser(session.user);
    }} />;
  }

  return <Dashboard token={token} user={user} theme={theme} setTheme={setTheme} setToken={setToken} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@local');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(API_URL);

  async function submit(event) {
    event.preventDefault();
    setError('');

    // Save and apply custom Server URL
    const cleanUrl = serverUrlInput.trim().replace(/\/$/, '');
    localStorage.setItem('custom_api_url', cleanUrl);
    API_URL = cleanUrl;
    WS_URL = getWsUrl(cleanUrl);
    
    // Detect if email looks like a local/non-Firebase email (no real domain)
    const isLocalEmail = !email.includes('.') || email.endsWith('@local') || email.endsWith('.local');

    if (isLocalEmail) {
      // Skip Firebase for local emails — go straight to local API
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
          setError('Credenciales incorrectas');
          return;
        }
        localStorage.setItem('use_local_api', 'true');
        onLogin(await response.json());
      } catch (localErr) {
        setError('No se pudo conectar al servidor. Verifique la dirección del servidor.');
      }
      return;
    }

    try {
      // 1. Try Firebase Authentication first (for real email addresses)
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      // Look up role in Firestore
      let userRole = 'Solo Lectura';
      let fullName = 'Usuario Nube';
      try {
        const q = query(collection(db, 'app_users'), where('email', '==', fbUser.email.toLowerCase().trim()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          userRole = userData.role_name || 'Solo Lectura';
          fullName = userData.full_name || 'Usuario Nube';
        }
      } catch (err) {
        console.warn('Error buscando rol en Firestore:', err);
      }

      localStorage.setItem('use_local_api', 'false');
      onLogin({
        token: await fbUser.getIdToken(),
        user: { email: fbUser.email, role: userRole, full_name: fullName }
      });
    } catch (fbErr) {
      // 2. Fallback to local Express API if Firebase fails
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
          setError('Credenciales incorrectas');
          return;
        }
        localStorage.setItem('use_local_api', 'true');
        onLogin(await response.json());
      } catch (localErr) {
        setError('Error de conexión con el servidor de autenticación');
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-emerald-500 text-slate-950">
            <Network size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Win NetWatch</h1>
            <p className="text-sm text-slate-400">Consola RMM en la Nube</p>
          </div>
        </div>
        <label className="label">Correo</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label mt-3">Password</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950">
          <Shield size={18} /> Entrar
        </button>

        {/* Server API URL Settings Toggle */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 text-center">
          <button
            type="button"
            onClick={() => setShowServerSettings(!showServerSettings)}
            className="text-xs text-zinc-405 hover:text-white transition duration-150 underline decoration-dotted underline-offset-4"
          >
            {showServerSettings ? 'Ocultar Configuración de Servidor' : 'Configurar Servidor Local / VPN'}
          </button>
        </div>

        {showServerSettings && (
          <div className="mt-3 space-y-2.5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/50 animate-in fade-in duration-200 text-left">
            <label className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase tracking-wider block">DIRECCIÓN DEL SERVIDOR API</label>
            <input
              className="input text-xs py-1.5 font-mono"
              placeholder="ej. http://172.30.176.1:8080"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
            />
            <p className="text-[10px] text-zinc-550 leading-relaxed font-medium">
              Especifica la IP de la VPN o del host local si el backend corre en tu red privada (ej: <code>http://172.30.176.1:8080</code>).
            </p>
          </div>
        )}
      </form>
    </main>
  );
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function formatMAC(value, previousValue) {
  if (!value) return '';
  if (previousValue && value.length < previousValue.length) {
    if (previousValue.endsWith(':') && !value.endsWith(':')) {
      value = value.slice(0, -1);
    }
    return value.toUpperCase();
  }
  let cleaned = value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  cleaned = cleaned.substring(0, 12);
  let formatted = '';
  for (let i = 0; i < cleaned.length; i++) {
    if (i > 0 && i % 2 === 0) {
      formatted += ':';
    }
    formatted += cleaned[i];
  }
  return formatted;
}

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      // Silently close context if blocked by browser autoplay policy to avoid console warnings
      audioCtx.close();
      return;
    }
    const now = audioCtx.currentTime;
    
    if (type === 'online') {
      // Premium synth bell arpeggio (C5 -> E5 -> G5 -> C6)
      const playNote = (freq, delay, duration) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        gainNode.gain.setValueAtTime(0, now + delay);
        gainNode.gain.linearRampToValueAtTime(0.06, now + delay + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        
        osc.start(now + delay);
        osc.stop(now + delay + duration);
      };
      playNote(523.25, 0, 0.7);      // C5
      playNote(659.25, 0.06, 0.7);   // E5
      playNote(783.99, 0.12, 0.7);   // G5
      playNote(1046.50, 0.18, 0.9);  // C6
    } else {
      // Soft minor triad alert (A5 -> F5 -> D5)
      const playNote = (freq, delay, duration) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + delay);
        gainNode.gain.setValueAtTime(0, now + delay);
        gainNode.gain.linearRampToValueAtTime(0.08, now + delay + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        
        osc.start(now + delay);
        osc.stop(now + delay + duration);
      };
      playNote(880.00, 0, 0.5);      // A5
      playNote(698.46, 0.08, 0.5);    // F5
      playNote(587.33, 0.16, 0.7);    // D5
    }
  } catch (e) {
    console.warn('AudioContext not supported or blocked:', e);
  }
}

function getSubnetLabelGlobal(subnet) {
  const mapping = {
    '172.30.100.0/24': 'Antofagasta Rendic',
    '172.30.101.0/24': 'Antofagasta Matta',
    '172.30.102.0/24': 'Antofagasta Diario',
    '172.30.110.0/24': 'Arica',
    '172.30.112.0/24': 'Iquique'
  };
  return mapping[subnet] ? `${mapping[subnet]} (${subnet})` : subnet;
}

function getDeviceDisplayName(dev) {
  if (!dev) return '';
  const name = dev.responsible_user && dev.responsible_user !== 'Sin responsable' ? dev.responsible_user : '';
  const host = dev.hostname || dev.ip || '';
  if (name && host) return `${name} (${host})`;
  return name || host;
}

function Dashboard({ token, user, theme, setTheme, setToken }) {
  const isAdmin = user?.role === 'Super Administrador' || user?.role === 'Administrador';
  const [toasts, setToasts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeModal, setEmployeeModal] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ q: '', status: '' });
  const [deviceSortOption, setDeviceSortOption] = useState('ip'); // 'ip' or 'name'
  
  // Custom Settings parameter states
  const [subnetMappings, setSubnetMappings] = useState([]);
  const [dbDepartments, setDbDepartments] = useState([]);
  const [dbCities, setDbCities] = useState([]);

  // Tab States
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [adminSubTab, setAdminSubTab] = useState('employees');
  const [newSubnet, setNewSubnet] = useState('');
  const [newSubnetLabel, setNewSubnetLabel] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [useLocalApi, setUseLocalApi] = useState(() => {
    return localStorage.getItem('use_local_api') === 'true';
  });
  const [firebaseQuotaExceeded, setFirebaseQuotaExceeded] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [deviceModal, setDeviceModal] = useState(null);
  const [inventoryTab, setInventoryTab] = useState('Todos');
  const [appUsers, setAppUsers] = useState([]);
  const [appRoles, setAppRoles] = useState([]);
  const [userModal, setUserModal] = useState(null);
  const [userFilter, setUserFilter] = useState('');

  // Auto-select text in inputs/textareas globally when focused
  useEffect(() => {
    const handleFocus = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.target.type !== 'checkbox' && e.target.type !== 'radio' && e.target.type !== 'file' && e.target.type !== 'date') {
          setTimeout(() => {
            if (document.activeElement === e.target) {
              e.target.select();
            }
          }, 50);
        }
      }
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, []);

  // Infrastructure inventory states
  const [infrastructure, setInfrastructure] = useState([]);
  const [infraModal, setInfraModal] = useState(null);
  const [infraFilter, setInfraFilter] = useState('');
  const [activeSwitchForPorts, setActiveSwitchForPorts] = useState(null);
  const [savingInfra, setSavingInfra] = useState(false);
  const [deviceLinkSearch, setDeviceLinkSearch] = useState('');
  const [showDeviceLinkSelector, setShowDeviceLinkSelector] = useState(false);
  const [showTopologyMap, setShowTopologyMap] = useState(false);

  const allIps = useMemo(() => {
    const set = new Set();
    devices.forEach(d => { if (d.ip) set.add(d.ip); });
    infrastructure.forEach(i => { if (i.ip) set.add(i.ip); });
    return Array.from(set);
  }, [devices, infrastructure]);

  const allEmails = useMemo(() => {
    const set = new Set();
    employees.forEach(e => { if (e.email) set.add(e.email); });
    appUsers.forEach(u => { if (u.email) set.add(u.email); });
    devices.forEach(d => { if (d.email) set.add(d.email); });
    return Array.from(set);
  }, [employees, appUsers, devices]);

  useEffect(() => {
    setShowDeviceLinkSelector(false);
    setDeviceLinkSearch('');
  }, [employeeModal]);

  // Bulk action states
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [importResultModal, setImportResultModal] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [trendHistory, setTrendHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('netwatch_trend_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const prevDevicesRef = useRef({});


  // Dynamic Subnet Name Mappings
  const getSubnetLabel = useCallback((subnet) => {
    const found = subnetMappings.find(m => m.subnet === subnet || m.subnet.includes(subnet) || subnet.includes(m.subnet));
    if (found) {
      return `${found.label} (${subnet})`;
    }
    return getSubnetLabelGlobal(subnet);
  }, [subnetMappings]);

  // Client-side computed state selectors (Calculados en caliente para consistencia y tiempo real)
  const summary = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'online').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const slow = devices.filter(d => d.status === 'slow').length;
    const rdp = devices.filter(d => d.rdp_available).length;
    const critical = devices.filter(d => d.critical).length;
    const managed = devices.filter(d => d.managed).length;
    return { total, online, offline, slow, rdp, critical, managed };
  }, [devices]);

  const networkMap = useMemo(() => {
    const counts = {};
    devices.forEach(dev => {
      const sub = dev.subnet || 'unknown';
      const city = dev.city || 'Sin ciudad';
      const branch = dev.branch || 'Sin sucursal';
      const status = dev.status || 'unknown';
      const key = `${sub}||${city}||${branch}||${status}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([key, total]) => {
      const [subnet, city, branch, status] = key.split('||');
      return { subnet, city, branch, status, total };
    }).sort((a, b) => b.total - a.total);
  }, [devices]);

  const bySubnet = useMemo(() => {
    const counts = {};
    devices.forEach(dev => {
      const sub = dev.subnet || 'unknown';
      const stat = dev.status || 'unknown';
      const key = `${sub}||${stat}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([key, total]) => {
      const [subnet, status] = key.split('||');
      return { subnet, status, total };
    });
  }, [devices]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const text = `
        ${emp.full_name}
        ${emp.email}
        ${emp.department}
        ${emp.city}
      `.toLowerCase();
      return text.includes(employeeFilter.toLowerCase());
    });
  }, [employees, employeeFilter]);

  const filteredAdminDevices = useMemo(() => {
    const list = devices.filter(dev => {
      const text = `
        ${dev.hostname || ''}
        ${dev.ip || ''}
        ${dev.mac || ''}
        ${dev.os || ''}
        ${dev.office || ''}
        ${dev.antivirus || ''}
        ${dev.brand || ''}
        ${dev.model || ''}
        ${dev.responsible_user || ''}
        ${dev.location || ''}
      `.toLowerCase();
      return text.includes(deviceFilter.toLowerCase());
    });

    const getStatusPriority = (status) => {
      if (status === 'offline') return 0;
      if (status === 'slow') return 1;
      if (status === 'online') return 2;
      return 3;
    };

    const parseIp = (ip) => {
      if (!ip) return [999, 999, 999, 999];
      return ip.split('.').map(n => parseInt(n, 10) || 0);
    };

    return list.sort((a, b) => {
      const prioA = getStatusPriority(a.status);
      const prioB = getStatusPriority(b.status);
      if (prioA !== prioB) return prioA - prioB;

      if (deviceSortOption === 'name') {
        const nameA = (a.hostname || '').toLowerCase();
        const nameB = (b.hostname || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }

      const partsA = parseIp(a.ip);
      const partsB = parseIp(b.ip);
      for (let i = 0; i < 4; i++) {
        if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
      }
      return 0;
    });
  }, [devices, deviceFilter, deviceSortOption]);

  const filteredAdminDevicesByTab = useMemo(() => {
    return filteredAdminDevices.filter(dev => {
      if (inventoryTab === 'Todos') return true;
      return (dev.device_type || 'PC') === inventoryTab;
    });
  }, [filteredAdminDevices, inventoryTab]);

  // Dynamic Suggestion lists (merges configurations and on-the-fly fields)
  const existingCities = useMemo(() => {
    const cities = new Set(dbCities.map(c => c.name));
    employees.forEach(e => e.city && cities.add(e.city));
    devices.forEach(d => d.city && cities.add(d.city));
    return [...cities].sort();
  }, [employees, devices, dbCities]);

  const existingDepartments = useMemo(() => {
    const depts = new Set(dbDepartments.map(d => d.name));
    employees.forEach(e => e.department && depts.add(e.department));
    devices.forEach(d => d.department && depts.add(d.department));
    return [...depts].sort();
  }, [employees, devices, dbDepartments]);

  const existingCpus = useMemo(() => {
    const cpus = new Set();
    devices.forEach(d => d.cpu && cpus.add(d.cpu.trim()));
    return [...cpus].sort();
  }, [devices]);

  const existingRams = useMemo(() => {
    const rams = new Set();
    devices.forEach(d => d.ram && rams.add(d.ram.trim()));
    return [...rams].sort();
  }, [devices]);

  const existingStorages = useMemo(() => {
    const storages = new Set();
    devices.forEach(d => d.storage && storages.add(d.storage.trim()));
    return [...storages].sort();
  }, [devices]);

  const existingGpus = useMemo(() => {
    const gpus = new Set();
    devices.forEach(d => d.gpu && gpus.add(d.gpu.trim()));
    return [...gpus].sort();
  }, [devices]);

  const existingMotherboards = useMemo(() => {
    const mbs = new Set();
    devices.forEach(d => d.motherboard && mbs.add(d.motherboard.trim()));
    return [...mbs].sort();
  }, [devices]);

  const filteredDevices = useMemo(() => {
    const list = devices.filter(device => {
      const label = getSubnetLabel(device.subnet);
      const texto = (
        `${device.ip}
         ${device.hostname}
         ${device.responsible_user}
         ${device.city}
         ${label}
         ${device.location || ''}`
      ).toLowerCase();

      return (
        texto.includes(filter.q.toLowerCase()) &&
        (!filter.status || device.status === filter.status)
      );
    });

    const getStatusPriority = (status) => {
      if (status === 'offline') return 0;
      if (status === 'slow') return 1;
      if (status === 'online') return 2;
      return 3;
    };

    const parseIp = (ip) => {
      if (!ip) return [999, 999, 999, 999];
      return ip.split('.').map(n => parseInt(n, 10) || 0);
    };

    return list.sort((a, b) => {
      const prioA = getStatusPriority(a.status);
      const prioB = getStatusPriority(b.status);
      if (prioA !== prioB) return prioA - prioB;

      if (deviceSortOption === 'name') {
        const nameA = (a.hostname || '').toLowerCase();
        const nameB = (b.hostname || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }

      const partsA = parseIp(a.ip);
      const partsB = parseIp(b.ip);
      for (let i = 0; i < 4; i++) {
        if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
      }
      return 0;
    });
  }, [devices, filter, getSubnetLabel, deviceSortOption]);

  // Toast Helper
  const triggerToast = (text, type) => {
    const toastId = Date.now() + Math.random();
    setToasts(prev => {
      const existe = prev.some(t => t.text === text);
      if (existe) return prev;
      return [...prev.slice(-4), { id: toastId, text, type }];
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
    }, 6000);
  };

  // ------------------------------------------------------------
  // Firestore Live Subscriptions
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // Firestore Live Subscriptions with Local Fallback on error
  // ------------------------------------------------------------
  useEffect(() => {
    if (!token || useLocalApi) return;

    let unsubDevices, unsubEmployees, unsubSubnets, unsubDepts, unsubCities, unsubEvents, unsubAlerts, unsubInfra, unsubAnomalies;

    const handleFirebaseError = (err) => {
      console.warn('Firestore subscription failed, switching to local API polling:', err);
      if (err && (err.code === 'resource-exhausted' || (err.message && (err.message.toLowerCase().includes('resource-exhausted') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit'))))) {
        setFirebaseQuotaExceeded(true);
      }
      localStorage.setItem('use_local_api', 'true');
      setUseLocalApi(true);
      if (unsubDevices) unsubDevices();
      if (unsubEmployees) unsubEmployees();
      if (unsubSubnets) unsubSubnets();
      if (unsubDepts) unsubDepts();
      if (unsubCities) unsubCities();
      if (unsubEvents) unsubEvents();
      if (unsubAlerts) unsubAlerts();
      if (unsubInfra) unsubInfra();
      if (unsubAnomalies) unsubAnomalies();
    };

    try {
      unsubDevices = onSnapshot(collection(db, 'devices'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });

        if (Object.keys(prevDevicesRef.current).length > 0) {
          list.forEach(dev => {
            const prev = prevDevicesRef.current[dev.id];
            if (prev && prev.status !== dev.status) {
              if (dev.status === 'offline') {
                playNotificationSound('offline');
                triggerToast(`🔴 ${getDeviceDisplayName(dev)} se desconectó`, 'offline');
              } else if (dev.status === 'online') {
                playNotificationSound('online');
                triggerToast(`🟢 ${getDeviceDisplayName(dev)} volvió a estar disponible`, 'online');
              }
            }
          });
        }

        const nextRef = {};
        list.forEach(d => { nextRef[d.id] = { status: d.status }; });
        prevDevicesRef.current = nextRef;

        setDevices(list);

        setDeviceModal(prev => {
          if (prev && prev.mode !== 'edit' && prev.form?.id) {
            const updated = list.find(d => d.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });

      }, handleFirebaseError);

      unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setEmployees(list);

        setEmployeeModal(prev => {
          if (prev && prev.mode !== 'edit' && prev.form?.id) {
            const updated = list.find(e => e.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });
      }, handleFirebaseError);

      unsubSubnets = onSnapshot(collection(db, 'subnet_mappings'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ subnet: d.id, ...d.data() });
        });
        setSubnetMappings(list);
      }, handleFirebaseError);

      unsubDepts = onSnapshot(collection(db, 'departments'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setDbDepartments(list);
      }, handleFirebaseError);

      unsubCities = onSnapshot(collection(db, 'cities'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setDbCities(list);
      }, handleFirebaseError);

      const qEvents = query(collection(db, 'events'), orderBy('created_at', 'desc'), limit(12));
      unsubEvents = onSnapshot(qEvents, (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setEvents(list);
      }, handleFirebaseError);

      const qAlerts = query(collection(db, 'alerts'), orderBy('created_at', 'desc'), limit(50));
      unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setAlerts(list);
      }, handleFirebaseError);

      unsubInfra = onSnapshot(collection(db, 'infrastructure'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setInfrastructure(list);
      }, handleFirebaseError);

      const qAnomalies = query(collection(db, 'device_anomalies'), orderBy('detected_at', 'desc'), limit(30));
      unsubAnomalies = onSnapshot(qAnomalies, (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setAnomalies(list);
      }, handleFirebaseError);

      // Listen to users and roles for Cloud fallback
      onSnapshot(collection(db, 'app_users'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setAppUsers(list);
      }, handleFirebaseError);

      onSnapshot(collection(db, 'roles'), (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setAppRoles(list);
      }, handleFirebaseError);
    } catch (err) {
      handleFirebaseError(err);
    }

    return () => {
      if (unsubDevices) unsubDevices();
      if (unsubEmployees) unsubEmployees();
      if (unsubSubnets) unsubSubnets();
      if (unsubDepts) unsubDepts();
      if (unsubCities) unsubCities();
      if (unsubEvents) unsubEvents();
      if (unsubAlerts) unsubAlerts();
      if (unsubInfra) unsubInfra();
      if (unsubAnomalies) unsubAnomalies();
    };
  }, [token, useLocalApi]);

  // ------------------------------------------------------------
  // Local REST API Polling Fallback (Runs if Firestore fails)
  // ------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      const headers = { authorization: `Bearer ${token}` };
      
      // 1. Fetch devices
      const devRes = await fetch(`${API_URL}/api/devices`, { headers });
      if (devRes.status === 401) {
        // Token inválido o vencido localmente, forzar logout automático
        setToken('');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }
      if (devRes.ok) {
        const list = await devRes.json();
        setDevices(list);
        
        if (Object.keys(prevDevicesRef.current).length > 0) {
          list.forEach(dev => {
            const prev = prevDevicesRef.current[dev.id];
            if (prev && prev.status !== dev.status) {
              if (dev.status === 'offline') {
                playNotificationSound('offline');
                triggerToast(`🔴 ${getDeviceDisplayName(dev)} se desconectó`, 'offline');
              } else if (dev.status === 'online') {
                playNotificationSound('online');
                triggerToast(`🟢 ${getDeviceDisplayName(dev)} volvió a estar disponible`, 'online');
              }
            }
          });
        }
        const nextRef = {};
        list.forEach(d => { nextRef[d.id] = { status: d.status }; });
        prevDevicesRef.current = nextRef;

        setDeviceModal(prev => {
          if (prev && prev.mode !== 'edit' && prev.form?.id) {
            const updated = list.find(d => d.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });

      }

      // 2. Fetch employees
      const empRes = await fetch(`${API_URL}/api/employees`, { headers });
      if (empRes.ok) {
        const list = await empRes.json();
        setEmployees(list);

        setEmployeeModal(prev => {
          if (prev && prev.mode !== 'edit' && prev.form?.id) {
            const updated = list.find(e => e.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });
      }

      // 3. Fetch subnet mappings
      const subRes = await fetch(`${API_URL}/api/settings/subnets`, { headers });
      if (subRes.ok) {
        const list = await subRes.json();
        setSubnetMappings(list.map(m => ({ subnet: m.subnet, label: m.label })));
      }

      // 4. Fetch departments
      const deptRes = await fetch(`${API_URL}/api/settings/departments`, { headers });
      if (deptRes.ok) setDbDepartments(await deptRes.json());

      // 5. Fetch cities
      const cityRes = await fetch(`${API_URL}/api/settings/cities`, { headers });
      if (cityRes.ok) setDbCities(await cityRes.json());

      // 6. Fetch dashboard summary (for alerts & events)
      const summaryRes = await fetch(`${API_URL}/api/dashboard/summary`, { headers });
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setEvents(data.events || []);
        setAlerts(data.alerts || []);
        setFirebaseQuotaExceeded(!!data.firebase_quota_exceeded);
      }

      // 7. Fetch infrastructure
      const infraRes = await fetch(`${API_URL}/api/infrastructure`, { headers });
      if (infraRes.ok) setInfrastructure(await infraRes.json());

      // 8. Fetch anomalies
      const anomalyRes = await fetch(`${API_URL}/api/anomalies`, { headers });
      if (anomalyRes.ok) setAnomalies(await anomalyRes.json());
    } catch (err) {
      console.error('Error polling local API:', err);
    }
  }, [token, useLocalApi]);

  useEffect(() => {
    if (!token || !useLocalApi) return;

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [token, useLocalApi, loadData]);

  // WebSocket connection for real-time scan logs
  const [scanLogs, setScanLogs] = useState([]);
  const [isTerminalScrolling, setIsTerminalScrolling] = useState(true);
  const [consoleSearch, setConsoleSearch] = useState('');

  useEffect(() => {
    if (!token || !useLocalApi) return;

    let ws;
    let reconnectTimeout;

    function connect() {
      // Resolve proper WebSocket URL based on protocol
      const wsUrl = getWsUrl(API_URL);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setScanLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] Conectado a la consola de escaneo local`]);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'scan-log') {
            setScanLogs(prev => [...prev.slice(-199), msg.payload]);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setScanLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] Conexión con consola local cerrada. Reconectando...`]);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        // Silently handle error and let onclose reconnect
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [token, useLocalApi]);

  const [isProbing, setIsProbing] = useState(false);

  async function handleProbeIp() {
    const ip = consoleSearch.trim();
    if (!ip) return;
    setIsProbing(true);
    setScanLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] 🔍 Iniciando consulta en tiempo real para: ${ip}...`]);
    try {
      const response = await fetch(`${API_URL}/api/scan/probe/${ip}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }
      const data = await response.json();
      
      const statusText = data.reachable ? '🟢 ONLINE' : '🔴 OFFLINE';
      const latencyText = data.latencyMs !== null ? `${data.latencyMs} ms` : 'N/A';
      const hostnameText = data.hostname || 'Desconocido';
      const macText = data.mac || 'Desconocida';
      const portsText = data.openPorts && data.openPorts.length > 0 ? `[${data.openPorts.join(', ')}]` : 'ninguno';

      const logMsg = `[CONSULTA] ${ip} - ${statusText} | Latencia: ${latencyText} | Hostname: ${hostnameText} | MAC: ${macText} | Puertos: ${portsText}`;
      setScanLogs(prev => [...prev.slice(-199), logMsg]);
    } catch (err) {
      setScanLogs(prev => [...prev.slice(-199), `[ERROR] Error en consulta para ${ip}: ${err.message}`]);
    } finally {
      setIsProbing(false);
    }
  }

  // ------------------------------------------------------------
  // Cloud Database Actions
  // ------------------------------------------------------------

  async function connectRdp(device) {
    try {
      const response = await fetch('http://localhost:8999/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ip: device.ip })
      });
      if (response.ok) {
        console.log('RDP connected via local agent');
        return;
      }
      throw new Error('Local agent not running');
    } catch (err) {
      console.warn('Local agent connection failed, generating RDP file client-side:', err);
      // Generate RDP text template locally and trigger download
      const rdpContent = `full address:s:${device.ip}:3389\nprompt for credentials:i:1\nauthentication level:i:2\nenablecredsspsupport:i:1\nredirectprinters:i:0\nredirectclipboard:i:1\nredirectsmartcards:i:0\nscreen mode id:i:2\nuse multimon:i:1\n`;
      const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${device.hostname || device.ip}.rdp`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
  }

   async function saveEmployee(form) {
    try {
      // VALIDACIÓN DUPLICADOS: Verificar email o nombre completo
      const email = (form.email || '').trim().toLowerCase();
      const fullName = (form.full_name || '').trim().toLowerCase();
      const isEdit = !!form.id;

      if (email) {
        const emailDuplicate = employees.some(e => (!isEdit || e.id !== form.id) && (e.email || '').trim().toLowerCase() === email);
        if (emailDuplicate) {
          alert(`Ya existe un empleado registrado con el correo: ${form.email}.`);
          return;
        }
      }
      if (fullName) {
        const nameDuplicate = employees.some(e => (!isEdit || e.id !== form.id) && (e.full_name || '').trim().toLowerCase() === fullName);
        if (nameDuplicate) {
          alert(`Ya existe un empleado registrado con el nombre: ${form.full_name}.`);
          return;
        }
      }

      const payload = {
        full_name: form.full_name || '',
        email: form.email || '',
        department: form.department || '',
        city: form.city || '',
        status: form.workplace || form.status || 'Presencial',
        phone: form.phone || '',
        workplace: form.workplace || form.status || 'Presencial',
        vpn_active: form.vpn_active || false,
        vpn_type: form.vpn_type || 'Agencia',
        image_url: form.image_url || '',
        active: form.active !== undefined ? form.active : true,
        job_title: form.job_title || '',
        authorized_systems: form.authorized_systems || ''
      };

      if (useLocalApi) {
        const isEdit = !!form.id;
        const url = isEdit ? `${API_URL}/api/employees/${form.id}` : `${API_URL}/api/employees`;
        const method = isEdit ? 'PATCH' : 'POST';
        const response = await fetch(url, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          let errBody = '';
          try { errBody = JSON.stringify(await response.json()); } catch {}
          throw new Error(`Error ${response.status} al guardar empleado: ${errBody || response.statusText}`);
        }
        
        setEmployeeModal(null);
        triggerToast('Empleado guardado correctamente', 'success');
        loadData();
        return;
      }

      const id = form.id || doc(collection(db, 'employees')).id;
      const employeeRef = doc(db, 'employees', id);
      await setDoc(employeeRef, payload);

      // Auto-save city & department parameter in Firestore
      if (form.department && form.department.trim() !== '') {
        const deptId = form.department.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        await setDoc(doc(db, 'departments', deptId), { name: form.department.trim() });
      }
      if (form.city && form.city.trim() !== '') {
        const cityId = form.city.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        await setDoc(doc(db, 'cities', cityId), { name: form.city.trim() });
      }

      setEmployeeModal(null);
      triggerToast('Empleado guardado correctamente', 'success');
    } catch (err) {
      console.error('Error saving employee:', err);
      alert('Error al guardar empleado: ' + err.message);
    }
  }

  async function deleteEmployee(id) {
    if (!confirm('¿Estás seguro de eliminar este empleado? Los equipos vinculados quedarán sin responsable.')) return;
    try {
      if (useLocalApi) {
        const unlinked = devices.filter(d => d.employee_id === id);
        for (const dev of unlinked) {
          await fetch(`${API_URL}/api/devices/${dev.id}`, {
            method: 'PATCH',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ employee_id: null, responsible_user: '', email: '', department: '', city: '', phone: '' })
          });
        }
        const response = await fetch(`${API_URL}/api/employees/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete employee via local API');
        setEmployeeModal(null);
        triggerToast('Empleado eliminado con éxito', 'success');
        return;
      }

      const unlinked = devices.filter(d => d.employee_id === id);
      for (const dev of unlinked) {
        await setDoc(doc(db, 'devices', dev.id), {
          ...dev,
          employee_id: null,
          responsible_user: '',
          email: '',
          department: '',
          city: '',
          phone: ''
        });
      }
      await deleteDoc(doc(db, 'employees', id));
      setEmployeeModal(null);
      triggerToast('Empleado eliminado con éxito', 'success');
    } catch (err) {
      console.error('Error deleting employee:', err);
      alert('Error al eliminar empleado: ' + err.message);
    }
  }

  async function saveDevice(form) {
    try {
      let finalForm = { ...form };
      const isDynamic = finalForm.ip_type === 'dynamic';

      // 1. IP validation (IP is mandatory only for static IPs)
      if (!isDynamic && (!finalForm.ip || finalForm.ip.trim() === '')) {
        throw new Error('La dirección IP es obligatoria para IPs estáticas.');
      }

      // 2. IP address validation for duplicates (excluding the device itself, and only for static IPs)
      if (!isDynamic && finalForm.ip && finalForm.ip.trim() !== '') {
        const targetIp = finalForm.ip.trim();
        const duplicateIp = devices.find(d => 
          d.id !== finalForm.id && 
          d.ip_type !== 'dynamic' &&
          d.ip && 
          d.ip.trim() === targetIp
        );
        if (duplicateIp) {
          throw new Error(`La dirección IP "${targetIp}" ya está registrada en otro equipo (${duplicateIp.hostname || 'Sin nombre'}). Por favor, usa una IP única.`);
        }
      }

      // 3. Serial number validation for duplicates (excluding the device itself if editing)
      if (finalForm.serial_number && finalForm.serial_number.trim() !== '') {
        const targetSerial = finalForm.serial_number.trim().toLowerCase();
        // Ignore generic placeholder serial numbers
        const ignoreSerials = ['', 'n/a', 'na', 'unknown', 'sin serie', 'system serial number', 'to be filled by o.e.m.', '00000000', '12345678', 'none'];
        if (!ignoreSerials.includes(targetSerial)) {
          const duplicateSerial = devices.find(d => 
            d.id !== finalForm.id && 
            d.serial_number && 
            d.serial_number.trim().toLowerCase() === targetSerial
          );
          if (duplicateSerial) {
            throw new Error(`El número de serie "${finalForm.serial_number.trim()}" ya está registrado en otro equipo (${duplicateSerial.hostname || 'Sin nombre'} - IP: ${duplicateSerial.ip}).`);
          }
        }
      }

      if (typeof finalForm.tags === 'string') {
        finalForm.tags = finalForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      // Sync employee details if employee_id is changing
      if (finalForm.employee_id) {
        const emp = employees.find(e => e.id === finalForm.employee_id);
        if (emp) {
          finalForm.responsible_user = emp.full_name;
          finalForm.email = emp.email || '';
          finalForm.department = emp.department || '';
          finalForm.city = emp.city || '';
          finalForm.phone = emp.phone || '';
          finalForm.job_title = emp.job_title || '';
        }
      }

      // Calculate subnet client-side
      let subnet = 'unknown';
      if (finalForm.ip && finalForm.ip.trim() !== '') {
        const ipParts = finalForm.ip.trim().split('.');
        if (ipParts.length === 4) {
          subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24`;
        }
      }

      const payload = {
        hostname: finalForm.hostname || '',
        ip: finalForm.ip && finalForm.ip.trim() !== '' ? finalForm.ip.trim() : null,
        mac: finalForm.mac && finalForm.mac.trim() !== '' ? finalForm.mac.trim() : null,
        os: finalForm.os || '',
        office: finalForm.office || '',
        antivirus: finalForm.antivirus || '',
        status: finalForm.status || 'unknown',
        rdp_available: finalForm.rdp_available || false,
        latency_ms: finalForm.latency_ms || null,
        subnet,
        city: finalForm.city || '',
        branch: finalForm.branch || '',
        department: finalForm.department || '',
        responsible_user: finalForm.responsible_user || '',
        phone: finalForm.phone && finalForm.phone.trim() !== '' ? finalForm.phone.trim() : null,
        email: finalForm.email || '',
        job_title: finalForm.job_title || '',
        authorized_systems: finalForm.authorized_systems || '',
        notes: finalForm.notes || '',
        brand: finalForm.brand || '',
        model: finalForm.model || '',
        serial_number: finalForm.serial_number || '',
        critical: finalForm.critical || false,
        managed: finalForm.managed || false,
        employee_id: finalForm.employee_id || null,
        cpu: finalForm.cpu || '',
        ram: finalForm.ram || '',
        storage: finalForm.storage || '',
        gpu: finalForm.gpu || '',
        motherboard: finalForm.motherboard || '',
        image_url: finalForm.image_url || '',
        device_type: finalForm.device_type || 'PC',
        location: finalForm.location || 'Matta',
        last_seen: finalForm.last_seen || new Date().toISOString(),
        ip_type: finalForm.ip_type || 'static'
      };

      if (useLocalApi) {
        const isEdit = !!finalForm.id;
        const url = isEdit ? `${API_URL}/api/devices/${finalForm.id}` : `${API_URL}/api/devices`;
        const method = isEdit ? 'PATCH' : 'POST';
        const response = await fetch(url, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          let errBody = '';
          try { errBody = JSON.stringify(await response.json()); } catch {}
          throw new Error(`Error ${response.status} al guardar equipo: ${errBody || response.statusText}`);
        }
        
        setDeviceModal(null);
        setSelected(null);
        triggerToast('Equipo guardado con éxito', 'success');
        loadData();
        return;
      }

      const id = form.id || doc(collection(db, 'devices')).id;
      const deviceRef = doc(db, 'devices', id);
      await setDoc(deviceRef, { id, ...payload });

      // Auto-save city & department parameter in Firestore
      if (finalForm.department && finalForm.department.trim() !== '') {
        const deptId = finalForm.department.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        await setDoc(doc(db, 'departments', deptId), { name: finalForm.department.trim() });
      }
      if (finalForm.city && finalForm.city.trim() !== '') {
        const cityId = finalForm.city.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        await setDoc(doc(db, 'cities', cityId), { name: finalForm.city.trim() });
      }

      setDeviceModal(null);
      setSelected(null);
      triggerToast('Equipo guardado con éxito', 'success');
    } catch (err) {
      console.error('Error saving device:', err);
      if (err.code === 'resource-exhausted' || (err.message && (err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('exhausted')))) {
        setFirebaseQuotaExceeded(true);
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            console.log('Firebase quota exceeded, attempting local API fallback save...');
            const isEdit = !!finalForm.id;
            const url = isEdit ? `${API_URL}/api/devices/${finalForm.id}` : `${API_URL}/api/devices`;
            const method = isEdit ? 'PATCH' : 'POST';
            const response = await fetch(url, {
              method,
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (response.ok) {
              setDeviceModal(null);
              setSelected(null);
              triggerToast('Equipo guardado localmente con éxito (cuota nube excedida)', 'success');
              loadData(); // ensure local UI data is reloaded
              return;
            }
          } catch (localErr) {
            console.error('Local API fallback save failed:', localErr);
          }
        }
        alert('⚠️ Límite de cuota de Firebase excedido: Se ha agotado el límite gratuito diario de escrituras en la nube de Google. Los cambios no se pueden guardar en la nube hasta que la cuota se restablezca automáticamente (a medianoche). Si estás en la oficina, asegúrate de activar el Servidor Local para guardar sin límites.');
      } else {
        alert('Error al guardar equipo: ' + err.message);
      }
    }
  }

  async function deleteDevice(id) {
    if (!confirm('¿Estás seguro de eliminar este equipo del inventario?')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/devices/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete device via local API');
        
        setDeviceModal(null);
        setSelected(null);
        setSelectedDeviceIds(prev => prev.filter(x => x !== id));
        triggerToast('Equipo eliminado con éxito', 'success');
        return;
      }
      await deleteDoc(doc(db, 'devices', id));
      setDeviceModal(null);
      setSelected(null);
      setSelectedDeviceIds(prev => prev.filter(x => x !== id));
      triggerToast('Equipo eliminado con éxito', 'success');
    } catch (err) {
      console.error('Error deleting device:', err);
      alert('Error al eliminar equipo: ' + err.message);
    }
  }

  async function deleteSelectedDevices() {
    if (selectedDeviceIds.length === 0) return;
    if (!confirm(`¿Estás seguro de eliminar los ${selectedDeviceIds.length} equipos seleccionados del inventario?`)) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedDeviceIds) {
      try {
        if (useLocalApi) {
          const response = await fetch(`${API_URL}/api/devices/${id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('Error al borrar');
        } else {
          await deleteDoc(doc(db, 'devices', id));
        }
        successCount++;
      } catch (err) {
        console.error('Error deleting device bulk:', id, err);
        failCount++;
      }
    }

    triggerToast(`Eliminación masiva: ${successCount} eliminados, ${failCount} fallidos`, successCount > 0 ? 'success' : 'error');
    setSelectedDeviceIds([]);
    loadData();
  }

  async function unlinkDevice(deviceId) {
    try {
      const dev = devices.find(d => d.id === deviceId);
      if (!dev) return;

      const payload = {
        employee_id: null,
        responsible_user: '',
        email: '',
        department: '',
        city: '',
        phone: ''
      };

      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/devices/${deviceId}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to unlink device via local API');
        triggerToast('Equipo desvinculado con éxito', 'success');
        return;
      }

      await setDoc(doc(db, 'devices', deviceId), {
        ...dev,
        ...payload
      });
      triggerToast('Equipo desvinculado con éxito', 'success');
    } catch (err) {
      console.error('Error unlinking device:', err);
      alert('Error al desvincular equipo: ' + err.message);
    }
  }

  async function linkDevice(deviceId, employeeId) {
    try {
      const dev = devices.find(d => d.id === deviceId);
      const emp = employees.find(e => e.id === employeeId);
      if (!dev || !emp) return;

      const payload = {
        employee_id: emp.id,
        responsible_user: emp.full_name,
        email: emp.email || '',
        department: emp.department || '',
        city: emp.city || '',
        phone: emp.phone || '',
        job_title: emp.job_title || ''
      };

      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/devices/${deviceId}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to link device via local API');
        triggerToast('Equipo asignado con éxito', 'success');
        return;
      }

      await setDoc(doc(db, 'devices', deviceId), {
        ...dev,
        ...payload
      });
      triggerToast('Equipo asignado con éxito', 'success');
    } catch (err) {
      console.error('Error linking device:', err);
      alert('Error al asignar equipo: ' + err.message);
    }
  }

  // Queue remote action in Firebase Actions or execute directly via Local API
  async function executeRemoteAction(deviceId, actionName) {
    try {
      let actionLabel = actionName === 'scan' ? 'Escaneo' : actionName === 'wake-on-lan' ? 'WOL' : actionName === 'restart' ? 'Reinicio' : actionName === 'powershell' ? 'Script' : actionName;

      if (useLocalApi) {
        let url, body;
        if (actionName === 'scan') {
          url = `${API_URL}/api/scan/run`;
          body = JSON.stringify({});
        } else {
          url = `${API_URL}/api/devices/${deviceId}/actions/${actionName}`;
          body = JSON.stringify({});
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body
        });
        if (!response.ok) throw new Error('Failed to execute action via local API');
        triggerToast(`Acción '${actionLabel}' enviada con éxito localmente.`, 'info');
        return;
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'actions', actionId), {
        device_id: deviceId || null,
        action: actionName,
        status: 'queued',
        createdAt: new Date().toISOString()
      });

      triggerToast(`Acción '${actionLabel}' encolada para ejecución remota. Auditada en servidor.`, 'info');
    } catch (err) {
      console.error('Error queueing action:', err);
      alert('Error al encolar acción remota');
    }
  }

  // Parameters Management
  async function saveSubnetMapping(subnet, label) {
    if (!subnet || !label) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/subnets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subnet, label })
        });
        if (!response.ok) throw new Error();
        triggerToast('Mapeo de subred guardado', 'success');
        return;
      }
      await setDoc(doc(db, 'subnet_mappings', subnet), { label });
      triggerToast('Mapeo de subred guardado', 'success');
    } catch (err) {
      alert('Error al guardar subred');
    }
  }

  async function deleteSubnetMapping(subnet) {
    if (!confirm('¿Eliminar este mapeo de subred?')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/subnets/${subnet}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        triggerToast('Mapeo de subred eliminado', 'success');
        return;
      }
      await deleteDoc(doc(db, 'subnet_mappings', subnet));
      triggerToast('Mapeo de subred eliminado', 'success');
    } catch (err) {
      alert('Error al eliminar subred');
    }
  }

  async function saveDepartmentParam(name) {
    if (!name) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/departments`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error();
        triggerToast('Departamento guardado', 'success');
        return;
      }
      const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'departments', id), { name: name.trim() });
      triggerToast('Departamento guardado', 'success');
    } catch (err) {
      alert('Error al guardar departamento');
    }
  }

  async function deleteDepartmentParam(id) {
    if (!confirm('¿Eliminar este departamento de la lista de parámetros?')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/departments/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        triggerToast('Departamento eliminado', 'success');
        return;
      }
      await deleteDoc(doc(db, 'departments', id));
      triggerToast('Departamento eliminado', 'success');
    } catch (err) {
      alert('Error al eliminar departamento');
    }
  }

  async function saveCityParam(name) {
    if (!name) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/cities`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error();
        triggerToast('Ciudad guardada', 'success');
        return;
      }
      const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'cities', id), { name: name.trim() });
      triggerToast('Ciudad guardada', 'success');
    } catch (err) {
      alert('Error al guardar ciudad');
    }
  }

  async function deleteCityParam(id) {
    if (!confirm('¿Eliminar esta ciudad de la lista de parámetros?')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/cities/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        triggerToast('Ciudad eliminada', 'success');
        return;
      }
      await deleteDoc(doc(db, 'cities', id));
      triggerToast('Ciudad eliminada', 'success');
    } catch (err) {
      alert('Error al eliminar ciudad');
    }
  }

  // ============================================================
  // App Users CRUD
  // ============================================================
  async function loadAppUsers() {
    if (!useLocalApi) return; // Managed by Firestore collection snapshot listeners on Cloud mode
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch(`${API_URL}/api/settings/users`, { headers: { authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/settings/roles`, { headers: { authorization: `Bearer ${token}` } })
      ]);
      if (usersRes.ok) setAppUsers(await usersRes.json());
      if (rolesRes.ok) setAppRoles(await rolesRes.json());
    } catch (err) {
      console.warn('Error loading users/roles:', err);
    }
  }

  async function saveAppUser(form) {
    try {
      const isEdit = !!form.id;
      const body = { email: form.email, full_name: form.full_name, role_id: form.role_id };
      if (form.password) body.password = form.password;
      if (isEdit && form.active !== undefined) body.active = form.active;

      if (useLocalApi) {
        const response = await fetch(
          `${API_URL}/api/settings/users${isEdit ? '/' + form.id : ''}`,
          {
            method: isEdit ? 'PATCH' : 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(isEdit ? body : { ...body, password: form.password })
          }
        );
        if (!response.ok) {
          const err = await response.json();
          alert(err.error || 'Error al guardar usuario');
          return;
        }
        triggerToast(isEdit ? 'Usuario actualizado' : 'Usuario creado', 'success');
        setUserModal(null);
        loadAppUsers();
        return;
      }

      // Cloud mode fallback to Firestore
      const userId = isEdit ? form.id : `user_${Date.now()}`;
      // Resolve role name for local mapping/UI
      const defaultRoles = [
        { id: '1', name: 'Administrador' },
        { id: '2', name: 'Solo Lectura' },
        { id: '3', name: 'Soporte TI' }
      ];
      const selectedRole = appRoles.find(r => r.id === form.role_id) || defaultRoles.find(r => r.id === form.role_id);
      const payload = {
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        role_id: form.role_id,
        role_name: selectedRole ? selectedRole.name : 'Solo Lectura',
        active: form.active !== undefined ? form.active : true,
        created_at: form.created_at || new Date().toISOString()
      };
      if (form.password) {
        payload.password_plain = form.password; // Sync to local agent securely via Firestore
      }
      await setDoc(doc(db, 'app_users', userId), payload, { merge: true });
      triggerToast(isEdit ? 'Usuario actualizado (Nube)' : 'Usuario creado (Nube)', 'success');
      setUserModal(null);
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar usuario');
    }
  }

  async function deleteAppUser(id) {
    if (!confirm('¿Eliminar este usuario del sistema? Esta acción es irreversible.')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/users/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        triggerToast('Usuario eliminado', 'success');
        loadAppUsers();
        return;
      }

      // Cloud mode fallback to Firestore
      await deleteDoc(doc(db, 'app_users', id));
      triggerToast('Usuario eliminado (Nube)', 'success');
    } catch (err) {
      alert('Error al eliminar usuario');
    }
  }

  async function toggleAppUser(id, currentActive) {
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/settings/users/${id}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ active: !currentActive })
        });
        if (!response.ok) throw new Error();
        triggerToast(currentActive ? 'Usuario desactivado' : 'Usuario activado', 'success');
        loadAppUsers();
        return;
      }

      // Cloud mode fallback to Firestore
      await setDoc(doc(db, 'app_users', id), { active: !currentActive }, { merge: true });
      triggerToast(currentActive ? 'Usuario desactivado (Nube)' : 'Usuario activado (Nube)', 'success');
    } catch (err) {
      alert('Error al cambiar estado de usuario');
    }
  }

  // Infrastructure CRUD functions
  async function saveInfrastructure(form) {
    if (savingInfra) return;
    setSavingInfra(true);
    try {
      const isEdit = !!form.id;
      const payload = {
        type: form.type,
        brand: form.brand || '',
        model: form.model || '',
        serial_number: form.serial_number || '',
        ports_count: form.ports_count ? parseInt(form.ports_count, 10) : null,
        location: form.location || 'Matta',
        status: form.status || 'nuevo',
        acquired_at: form.acquired_at || new Date().toISOString().split('T')[0],
        notes: form.notes || '',
        mac: form.mac || '',
        floor: form.floor || '',
        ip: form.ip || '',
        city: form.city || 'Antofagasta'
      };

      if (useLocalApi) {
        const response = await fetch(
          `${API_URL}/api/infrastructure${isEdit ? '/' + form.id : ''}`,
          {
            method: isEdit ? 'PATCH' : 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok) {
          const err = await response.json();
          alert(err.error || 'Error al guardar elemento');
          return;
        }
        triggerToast(isEdit ? 'Elemento actualizado' : 'Elemento creado', 'success');
        setInfraModal(null);
        const res = await fetch(`${API_URL}/api/infrastructure`, { headers: { authorization: `Bearer ${token}` } });
        if (res.ok) setInfrastructure(await res.json());
        return;
      }

      // Cloud mode: write directly to Firestore
      const id = form.id || doc(collection(db, 'infrastructure')).id;
      await setDoc(doc(db, 'infrastructure', id), { id, ...payload });
      triggerToast(isEdit ? 'Elemento actualizado' : 'Elemento creado', 'success');
      setInfraModal(null);
    } catch (err) {
      console.error('Error saving infrastructure:', err);
      if (err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('exhausted') || err.code === 'resource-exhausted') {
        alert('⚠️ Límite de cuota de Firebase excedido: Se ha agotado el límite gratuito diario de escrituras en la nube de Google. Los cambios no se pueden guardar en la nube hasta que la cuota se restablezca automáticamente (a medianoche). Si estás en la oficina, asegúrate de activar el Servidor Local para guardar sin límites.');
      } else {
        alert('Error al guardar elemento de infraestructura: ' + err.message);
      }
    } finally {
      setSavingInfra(false);
    }
  }

  async function deleteInfrastructure(id) {
    if (!confirm('¿Estás seguro de eliminar este elemento del inventario?')) return;
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/infrastructure/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        triggerToast('Elemento eliminado', 'success');
        const res = await fetch(`${API_URL}/api/infrastructure`, { headers: { authorization: `Bearer ${token}` } });
        if (res.ok) setInfrastructure(await res.json());
        return;
      }

      // Cloud mode: delete directly from Firestore
      await deleteDoc(doc(db, 'infrastructure', id));
      triggerToast('Elemento eliminado', 'success');
    } catch (err) {
      console.error('Error deleting infrastructure:', err);
      alert('Error al eliminar elemento de infraestructura');
    }
  }

  // Load users when switching to the users tab
  useEffect(() => {
    if (adminSubTab === 'users' && appUsers.length === 0) {
      loadAppUsers();
    }
  }, [adminSubTab]);

  useEffect(() => {
    if (!devices || devices.length === 0) return;

    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const rawTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const onlineCount = devices.filter(d => d.status === 'online' || d.status === 'slow').length;
    const offlineCount = devices.filter(d => d.status === 'offline').length;

    // Calcular la latencia promedio de equipos online que tengan latency_ms
    const onlineWithLatency = devices.filter(d => (d.status === 'online' || d.status === 'slow') && typeof d.latency_ms === 'number' && d.latency_ms > 0);
    const avgLatency = onlineWithLatency.length
      ? Math.round(onlineWithLatency.reduce((sum, d) => sum + d.latency_ms, 0) / onlineWithLatency.length)
      : 0;

    setTrendHistory(prev => {
      // Evitar duplicados del mismo segundo exacto
      if (prev.length > 0 && prev[prev.length - 1].rawTime === rawTime) {
        return prev;
      }
      
      const newPoint = {
        time: timeLabel,
        rawTime,
        'Equipos Online': onlineCount,
        'Equipos Offline': offlineCount,
        'Latencia Promedio (ms)': avgLatency
      };

      const nextList = [...prev, newPoint].slice(-15);
      try {
        localStorage.setItem('netwatch_trend_history', JSON.stringify(nextList));
      } catch (e) {}
      return nextList;
    });
  }, [devices]);

  const chartData = trendHistory;

  const downloadInfraExcel = (cityFilter = null) => {
    const base = infrastructure.filter(item => {
      const q = infraFilter.toLowerCase().trim();
      const matchQuery = !q || (
        (item.type || '').toLowerCase().includes(q) ||
        (item.brand || '').toLowerCase().includes(q) ||
        (item.model || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.city || '').toLowerCase().includes(q) ||
        (item.ip || '').toLowerCase().includes(q) ||
        (item.serial_number || '').toLowerCase().includes(q)
      );
      const matchCity = !cityFilter || getInfraGroup(item) === cityFilter;
      return matchQuery && matchCity;
    });

    // Sort by Group alphabetically, then by Location to keep it clean
    base.sort((a, b) => {
      const groupA = getInfraGroup(a).toLowerCase();
      const groupB = getInfraGroup(b).toLowerCase();
      if (groupA !== groupB) {
        return groupA.localeCompare(groupB);
      }
      const locA = (a.location || '').toLowerCase();
      const locB = (b.location || '').toLowerCase();
      return locA.localeCompare(locB);
    });

    const headers = [
      'Ciudad', 'Lugar', 'Piso', 'Observaciones', 'Marca', 'Modelo',
      'Bocas', 'Dirección MAC', 'Número de Serie', 'Dirección IP', 'Enlace', 'Estado'
    ];

    const rowsHtml = base.map(item => {
      const notes = (item.notes || '').trim();
      const notesLower = notes.toLowerCase();

      // Deducir el enlace del proveedor a partir de las notas
      let enlace = '';
      if (notesLower.includes('entel')) enlace = 'Entel';
      else if (notesLower.includes('gtd')) enlace = 'GTD';
      else if (notesLower.includes('movistar')) enlace = 'Movistar';
      else if (notesLower.includes('claro')) enlace = 'Claro';
      else if (notesLower.includes('emelnor')) enlace = 'Emelnor';

      const columns = [
        item.city || 'Antofagasta',
        item.location || '',
        item.floor ? `Piso ${item.floor}` : '',
        notes || '—',
        item.brand || '',
        item.model || '',
        item.ports_count !== null && item.ports_count !== undefined ? `${item.ports_count}P` : '—',
        item.mac || '',
        item.serial_number || '',
        item.ip || '',
        enlace || '—',
        item.status || 'usado'
      ];

      // Colores de fila completa según estado
      let trStyle = '';
      if (item.status === 'malo') {
        trStyle = 'style="background-color: #fee2e2;"'; // soft red for bad
      } else if (item.status === 'apagado') {
        trStyle = 'style="background-color: #f1f5f9; color: #475569;"'; // soft gray/slate for offline
      } else if (item.status === 'nuevo') {
        trStyle = 'style="background-color: #ecfdf5;"'; // soft green for new
      }

      return `<tr ${trStyle} style="height:22px;vertical-align:middle;">${columns.map((val, idx) => {
        let align = 'text-align: center;';
        if (idx === 1 || idx === 3) {
          align = 'text-align: left;'; // Lugar y Observaciones alineadas a la izquierda
        }
        
        let s = `border: 1px solid #cbd5e1; padding: 6px; ${align}`;
        
        // Estilos específicos de fuente mono para campos técnicos (MAC, Serie, IP)
        if (idx === 7 || idx === 8 || idx === 9) {
          s += '; font-family: Consolas, monospace; font-size: 10px;';
        }

        // Estilos específicos de columna:
        // Columna Enlace (índice 10)
        if (idx === 10 && val && val !== '—') {
          if (val === 'Entel') s += '; background-color: #d1fae5; color: #065f46; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'Movistar') s += '; background-color: #e0f2fe; color: #0369a1; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'Claro') s += '; background-color: #ffedd5; color: #9a3412; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'GTD') s += '; background-color: #f3e8ff; color: #6b21a8; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'Emelnor') s += '; background-color: #fef9c3; color: #854d0e; font-weight: bold; border: 1px solid #cbd5e1;';
        }
        // Columna Estado (índice 11)
        else if (idx === 11) {
          if (val === 'nuevo') s += '; background-color: #d1fae5; color: #065f46; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'usado') s += '; background-color: #fffbeb; color: #b45309; border: 1px solid #cbd5e1;';
          else if (val === 'apagado') s += '; background-color: #e2e8f0; color: #475569; font-weight: bold; border: 1px solid #cbd5e1;';
          else if (val === 'malo') s += '; background-color: #fca5a5; color: #7f1d1d; font-weight: bold; border: 1px solid #cbd5e1;';
        }

        return `<td style="${s}">${String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`;
      }).join('')}</tr>`;
    }).join('');

    const title = cityFilter
      ? `Win NetWatch RMM — Infraestructura: ${cityFilter}`
      : `Win NetWatch RMM — Inventario de Infraestructura (Switches / Módems)`;

    const sheetName = cityFilter
      ? `Infraestructura ${cityFilter}`
      : `Infraestructura de Red`;
    const excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sheetName}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table{border-collapse:collapse;font-family:Segoe UI,sans-serif;}
    th{background:#1e293b;color:white;font-weight:bold;border:1px solid #cbd5e1;padding:8px;font-size:11px;text-align:center;}
    td{border:1px solid #cbd5e1;padding:6px;font-size:11px;}
  </style>
</head>
<body>
  <table>
    <colgroup>
      <col width="120" style="width: 120px;"/>
      <col width="160" style="width: 160px;"/>
      <col width="80"  style="width: 80px;"/>
      <col width="260" style="width: 260px;"/>
      <col width="120" style="width: 120px;"/>
      <col width="140" style="width: 140px;"/>
      <col width="80"  style="width: 80px;"/>
      <col width="160" style="width: 160px;"/>
      <col width="160" style="width: 160px;"/>
      <col width="130" style="width: 130px;"/>
      <col width="120" style="width: 120px;"/>
      <col width="100" style="width: 100px;"/>
    </colgroup>
    <thead>
      <tr style="height:35px;vertical-align:middle;">
        <th colspan="12" style="background:#1e293b;color:white;font-size:13px;font-weight:bold;text-align:center;border:1px solid #94a3b8;vertical-align:middle;">
          ${title.toUpperCase()}
        </th>
      </tr>
      <tr style="height:10px;background:#f8fafc;"><td colspan="12" style="border:none;background:#f8fafc;"></td></tr>
      <tr style="height:26px;vertical-align:middle;">
        ${headers.map(h => `<th style="background:#0f172a;color:white;font-weight:bold;border:1px solid #cbd5e1;padding:6px;text-align:center;">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const safeName = cityFilter
      ? `infraestructura_${cityFilter.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').toLowerCase()}.xls`
      : 'infraestructura_completa.xls';
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    triggerToast(`Excel exportado${cityFilter ? ` — ${cityFilter}` : ''}`, 'success');
  };

  const printInfraPDF = (cityFilter = null) => {
    const base = infrastructure.filter(item => {
      const q = infraFilter.toLowerCase().trim();
      const matchQuery = !q || (
        (item.type || '').toLowerCase().includes(q) ||
        (item.brand || '').toLowerCase().includes(q) ||
        (item.model || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.city || '').toLowerCase().includes(q) ||
        (item.ip || '').toLowerCase().includes(q) ||
        (item.serial_number || '').toLowerCase().includes(q)
      );
      const matchCity = !cityFilter || getInfraGroup(item) === cityFilter;
      return matchQuery && matchCity;
    });

    const grouped = {};
    base.forEach(item => {
      const c = getInfraGroup(item);
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(item);
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Por favor permite los popups para poder imprimir.'); return; }

    const buildPortsGrid = (item) => {
      const isFortinet = item.type === 'Fortinet';
      const isCisco2901 = item.type === 'Router';
      const isRaisecom = item.type === 'Conversor';
      
      let fortinetLabels = ['Console', 'Wan 2', 'Wan 1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];
      let fortinetShort = ['CNS', 'W2', 'W1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];
      
      if (isCisco2901) {
        fortinetLabels = ['Console', 'Aux', 'GE 0/0', 'GE 0/1'];
        fortinetShort = ['CNS', 'AUX', 'GE0', 'GE1'];
      } else if (isRaisecom) {
        fortinetLabels = ['Optico (Fibra)', 'FastEthernet (LAN)', 'Console'];
        fortinetShort = ['OPT', 'FE', 'CNS'];
      }
      
      const count = isFortinet ? 11 : (isCisco2901 ? 4 : (isRaisecom ? 3 : (item.ports_count || 24)));
      const portDeviceMap = {};
      
      const connectedDevs = devices.filter(d => d.switch_id === item.id && d.switch_port).map(d => ({ ...d, isDevice: true }));
      const connectedInfras = infrastructure.filter(i => i.switch_id === item.id && i.switch_port).map(i => ({ ...i, isInfra: true }));
      
      const parentInfras = [];
      if (item.switch_id && item.local_port) {
        const parent = infrastructure.find(p => p.id === item.switch_id);
        if (parent) {
          parentInfras.push({
            ...parent,
            isInfra: true,
            isParent: true,
            switch_port: parseInt(item.local_port, 10)
          });
        }
      }

      const connected = [...connectedDevs, ...connectedInfras, ...parentInfras];

      connected.forEach(elem => {
        if (elem.switch_port) portDeviceMap[elem.switch_port] = elem;
      });

      const cols = count <= 24 ? count : 24;
      let html = `<div style="background:#1e293b;border:2px solid #334155;padding:6px 8px;border-radius:6px;width:100%;box-sizing:border-box;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;font-size:7px;color:#94a3b8;font-family:monospace;margin-bottom:5px;">
          <span>${(item.brand||'').toUpperCase()} ${(item.model||'').toUpperCase()}</span>
          <span>SYS OK &#9679;</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,18px));gap:2px;width:100%;">`;
      for (let p = 1; p <= count; p++) {
        const dev = portDeviceMap[p];
        const label = (isFortinet || isCisco2901 || isRaisecom) ? fortinetShort[p - 1] : p;
        const fullName = getPortName(item.type, item.model, p);
        const bg = dev ? 'rgba(16,185,129,0.2)' : 'rgba(30,41,59,0.6)';
        const border = dev ? '1.5px solid #10b981' : '1.5px dashed #475569';
        const color = dev ? '#10b981' : '#475569';
        const symbol = dev ? '&#9679;' : '+';
        
        // Font size adjustments for labels like 'CNS', 'W2'
        const labelFontSize = (isFortinet || isCisco2901 || isRaisecom) && label.length > 2 ? '3px' : '4px';
        
        const titleText = dev 
          ? (dev.isInfra ? `${dev.type}: ${dev.brand} ${dev.model}` : (dev.responsible_user||dev.hostname||'Ocupado'))
          : fullName;
        
        html += `<div title="${titleText}" style="width:100%;padding-top:100%;position:relative;background:${bg};border:${border};border-radius:2px;overflow:hidden;">
          <span style="position:absolute;top:1px;left:1px;font-size:${labelFontSize};color:#64748b;line-height:1;font-family:monospace;font-weight:bold;">${label}</span>
          <span style="position:absolute;bottom:1px;right:0;left:0;text-align:center;font-size:6px;color:${color};">${symbol}</span>
        </div>`;
      }
      html += `</div></div>`;
      if (connected.length > 0) {
        html += `<div style="margin-top:6px;font-size:9px;color:#475569;">
          <strong style="color:#334155;">Equipos vinculados:</strong>
          <ul style="margin:2px 0 0 14px;padding:0;">`;
        connected.sort((a,b) => (a.switch_port||0)-(b.switch_port||0)).forEach(d => {
          let lbl = '';
          if (d.isInfra) {
            lbl = `${d.type}: ${d.brand} ${d.model}`;
          } else {
            lbl = (d.responsible_user && d.responsible_user !== 'Sin responsable') ? d.responsible_user : (d.hostname || 'Equipo');
          }
          if (d.notes) {
            lbl += ` (Obs: ${d.notes})`;
          }
          const portStr = getPortName(item.type, item.model, d.switch_port);
          html += `<li style="margin-bottom:1px;"><strong>${portStr}:</strong> ${lbl} — ${d.ip||'—'}</li>`;
        });
        html += `</ul></div>`;
      } else {
        html += `<div style="margin-top:4px;font-size:8px;color:#94a3b8;font-style:italic;">Sin equipos vinculados.</div>`;
      }
      return html;
    };

    const buildModemPanel = (item) => {
      const portCount = item.ports_count || 0;
      const portDevMap = {};

      const connectedDevs = devices.filter(d => d.switch_id === item.id && d.switch_port).map(d => ({ ...d, isDevice: true }));
      const connectedInfras = infrastructure.filter(i => i.switch_id === item.id && i.switch_port).map(i => ({ ...i, isInfra: true }));
      
      const parentInfras = [];
      if (item.switch_id && item.local_port) {
        const parent = infrastructure.find(i => i.id === item.switch_id);
        if (parent) {
          parentInfras.push({
            ...parent,
            isInfra: true,
            isParent: true,
            switch_port: parseInt(item.local_port, 10)
          });
        }
      }

      const connected = [...connectedDevs, ...connectedInfras, ...parentInfras];

      connected.forEach(elem => {
        if (elem.switch_port) portDevMap[elem.switch_port] = elem;
      });

      let portsHtml = '';
      if (portCount > 0) {
        portsHtml = `<div style="margin-top:6px;">
          <div style="font-size:7px;color:#94a3b8;font-family:monospace;margin-bottom:4px;text-transform:uppercase;">Bocas LAN (${portCount})</div>
          <div style="display:grid;grid-template-columns:repeat(${Math.min(portCount,8)},minmax(0,18px));gap:3px;">`;
        for (let p = 1; p <= portCount; p++) {
          const dev = portDevMap[p];
          const bg = dev ? 'rgba(16,185,129,0.2)' : 'rgba(30,41,59,0.6)';
          const border = dev ? '1.5px solid #10b981' : '1.5px dashed #475569';
          const color = dev ? '#10b981' : '#475569';
          const titleText = dev
            ? (dev.isInfra ? `${dev.type}: ${dev.brand} ${dev.model}` : (dev.responsible_user||dev.hostname||'Ocupado'))
            : `Puerto ${p}`;

          portsHtml += `<div title="${titleText}" style="aspect-ratio:1;background:${bg};border:${border};border-radius:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
            <span style="font-size:5px;color:#64748b;position:absolute;top:1px;left:2px;">${p}</span>
            <span style="font-size:7px;color:${color};margin-top:4px;">${dev ? '●' : '+'}</span>
          </div>`;
        }
        portsHtml += `</div></div>`;
      }
 
      let html = `<div style="background:#1e293b;border:2px solid #334155;padding:8px;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-size:8px;color:#94a3b8;font-family:monospace;font-weight:bold;">📡 MODEM / BROADBAND</div>
          <div style="display:flex;gap:2px;align-items:flex-end;height:18px;">
            ${[6,9,12,15,18].map(h => `<div style="width:4px;height:${h}px;background:#10b981;border-radius:1px;opacity:${0.4+h/30};"></div>`).join('')}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:8px;font-family:monospace;color:#94a3b8;margin-bottom:4px;">
          <div>WAN: <strong style="color:#10b981;">Connected</strong></div>
          <div>IP: <strong style="color:#e2e8f0;">${item.ip||'—'}</strong></div>
          <div>MAC: <strong style="color:#e2e8f0;">${item.mac||'—'}</strong></div>
          <div>Bocas: <strong style="color:#e2e8f0;">${portCount > 0 ? portCount+'P' : '—'}</strong></div>
        </div>
        ${portsHtml}
      </div>`;

      if (connected.length > 0) {
        html += `<div style="margin-top:6px;font-size:9px;color:#475569;">
          <strong style="color:#334155;">Equipos vinculados:</strong>
          <ul style="margin:2px 0 0 14px;padding:0;">`;
        connected.sort((a,b)=>(a.switch_port||0)-(b.switch_port||0)).forEach(d => {
          let lbl = '';
          if (d.isInfra) {
            lbl = `${d.type}: ${d.brand} ${d.model}`;
          } else {
            lbl = (d.responsible_user && d.responsible_user !== 'Sin responsable') ? d.responsible_user : (d.hostname||'Equipo');
          }
          if (d.notes) {
            lbl += ` (Obs: ${d.notes})`;
          }
          html += `<li style="margin-bottom:1px;"><strong>P${d.switch_port}:</strong> ${lbl} — ${d.ip||'—'}</li>`;
        });
        html += `</ul></div>`;
      } else {
        html += `<div style="margin-top:4px;font-size:8px;color:#94a3b8;font-style:italic;">Sin equipos vinculados.</div>`;
      }

      return html;
    };

    const titleStr = cityFilter
      ? `Infraestructura de Red — ${cityFilter}`
      : `Infraestructura de Red — Todas las Ciudades`;

    let content = `<html><head><title>${titleStr}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  @media print {
    body { margin:0; background:white !important; color:#0f172a !important; }
    .no-print { display:none; }
    /* Modo Impresión: Forzar 1 sola columna vertical de tarjetas */
    .cards-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
    /* Modo Impresión: Usar 4 columnas de detalles para ahorrar espacio vertical en papel */
    .details { grid-template-columns: repeat(4, 1fr) !important; gap: 8px 12px !important; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f8fafc; color:#1e293b; padding:20px; font-size:11px; }
  .page-header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #10b981; padding-bottom:10px; margin-bottom:16px; }
  .page-header h1 { margin:0; font-size:18px; color:#0f172a; }
  .page-header p { margin:3px 0 0; font-size:10px; color:#64748b; }
  .brand { font-weight:bold; color:#10b981; font-size:15px; }
  .city-block { margin-bottom:24px; }
  .city-title { font-size:14px; font-weight:bold; text-transform:uppercase; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:4px; margin-bottom:12px; letter-spacing:0.05em; page-break-after: avoid; break-after: avoid; }
  
  /* Modo Pantalla: 2 columnas horizontales de tarjetas */
  .cards-grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  
  /* Tarjeta en diseño de fila (detalles izquierda, diagrama derecha) */
  .card { background:white; border:1px solid #e2e8f0; border-radius:8px; padding:14px; display:flex; flex-direction:row; gap:16px; page-break-inside:avoid; break-inside:avoid; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
  .card-left { flex:1; min-width:0; }
  .card-right { width: 45%; max-width:320px; min-width:240px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-start; }
  
  .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #f1f5f9; }
  .card-title { font-size:12px; font-weight:bold; color:#0f172a; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .badges { display:flex; gap:4px; flex-shrink:0; }
  .badge { font-size:8px; font-weight:bold; text-transform:uppercase; padding:2px 6px; border-radius:3px; }
  .badge-switch   { background:#e0f2fe; color:#0369a1; }
  .badge-switch-generic { background:#fef3c7; color:#b45309; }
  .badge-modem    { background:#ecfdf5; color:#047857; }
  .badge-fortinet { background:#fff7ed; color:#c2410c; }
  .badge-new    { background:#d1fae5; color:#065f46; }
  .badge-used   { background:#fef3c7; color:#92400e; }
  .badge-offline { background:#f1f5f9; color:#475569; }
  .badge-bad { background:#fee2e2; color:#b91c1c; }
  
  /* Detalles en 2 columnas en pantalla */
  .details { display:grid; grid-template-columns: repeat(2, 1fr); gap:4px 10px; }
  .detail { font-size:9px; }
  .detail strong { color:#94a3b8; display:block; font-size:7.5px; text-transform:uppercase; margin-bottom:1px; }
  .detail span { font-weight:600; color:#1e293b; word-break:break-all; }
  .notes { font-size:8px; color:#64748b; font-style:italic; background:#f8fafc; padding:4px 6px; border-radius:4px; border-left:2px solid #cbd5e1; margin-top:6px; }
</style></head><body>
<div class="page-header">
  <div>
    <h1>${titleStr}</h1>
    <p>Generado: ${new Date().toLocaleString()} · ${user?.full_name || 'Administrador'}</p>
  </div>
  <div class="brand">Win NetWatch RMM</div>
</div>`;

    Object.keys(grouped).sort().forEach(city => {
      content += `<div class="city-block"><div class="city-title">📍 Ciudad: ${city}</div><div class="cards-grid">`;
      grouped[city].forEach(item => {
        const isSwitch = item.type === 'Switch' || item.type === 'Switch Genérico' || item.type === 'Fortinet' || item.type === 'Router' || item.type === 'Conversor';
        
        let badgeType = 'badge-modem';
        let badgeLabel = 'MÓDEM';
        if (item.type === 'Switch') { badgeType = 'badge-switch'; badgeLabel = 'SWITCH'; }
        else if (item.type === 'Switch Genérico') { badgeType = 'badge-switch-generic'; badgeLabel = 'SWITCH GENÉRICO'; }
        else if (item.type === 'Fortinet') { badgeType = 'badge-fortinet'; badgeLabel = 'FORTINET'; }
        else if (item.type === 'Router') { badgeType = 'badge-switch'; badgeLabel = 'ROUTER'; }
        else if (item.type === 'Conversor') { badgeType = 'badge-fortinet'; badgeLabel = 'CONVERSOR'; }
        
        let badgeStatus = 'badge-used';
        if (item.status === 'nuevo') badgeStatus = 'badge-new';
        else if (item.status === 'apagado') badgeStatus = 'badge-offline';
        else if (item.status === 'malo') badgeStatus = 'badge-bad';

        const diagram = isSwitch ? buildPortsGrid(item) : buildModemPanel(item);

        content += `<div class="card">
          <div class="card-left">
            <div class="card-header">
              <span class="card-title">${item.type === 'Fortinet' ? '🛡️' : item.type === 'Router' ? '📶' : item.type === 'Conversor' ? '🔄' : isSwitch ? '🔌' : '📡'} ${item.brand} ${item.model}</span>
              <div class="badges">
                <span class="badge ${badgeType}">${badgeLabel}</span>
                <span class="badge ${badgeStatus}">${item.status}</span>
              </div>
            </div>
            <div class="details">
              <div class="detail"><strong>IP</strong><span>${item.ip||'—'}</span></div>
              <div class="detail"><strong>MAC</strong><span>${item.mac||'—'}</span></div>
              <div class="detail"><strong>N° Serie</strong><span>${item.serial_number||'—'}</span></div>
              <div class="detail"><strong>Bocas</strong><span>${(item.ports_count||0) > 0 ? (item.ports_count + (item.type === 'Switch' ? ' puertos' : item.type === 'Fortinet' ? ' int.' : item.type === 'Router' ? ' int.' : item.type === 'Conversor' ? ' int.' : ' LAN')) : '—'}</span></div>
              <div class="detail"><strong>Ubicación</strong><span>${item.location||'—'}</span></div>
              <div class="detail"><strong>Piso</strong><span>${item.floor ? 'Piso '+item.floor : '—'}</span></div>
              <div class="detail"><strong>Estado</strong><span>${item.status||'—'}</span></div>
              <div class="detail"><strong>Ingreso</strong><span>${item.acquired_at ? item.acquired_at.split('T')[0] : '—'}</span></div>
            </div>
            ${item.notes ? `<div class="notes"><strong>Obs:</strong> ${item.notes}</div>` : ''}
          </div>
          <div class="card-right">${diagram}</div>
        </div>`;
      });
      content += `</div></div>`;
    });

    content += `</body></html>`;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 600);
  };



  const downloadDevicesCSV = () => {
    const headers = [
      'Hostname', 'IP', 'MAC', 'OS', 'Office', 'Antivirus', 'Status', 'RDP Habilitado',
      'Responsable', 'Cargo', 'Sistemas', 'City', 'Branch', 'Department', 'Brand', 'Model',
      'Serial Number', 'Location'
    ];
    // Build Excel-friendly HTML Table structure with styling for VPN, No City and Status
    const rowsHtml = devices.map(d => {
      const city = d.city || '';
      const hasNoCity = !city || city.trim().toLowerCase() === 'no asignada' || city.trim() === '';
      const ip = d.ip || '';
      const isVpn = ip.startsWith('10.8.') || ip.startsWith('172.16.') || 
                    city.toLowerCase().includes('vpn') || 
                    (d.branch && d.branch.toLowerCase().includes('vpn'));

      const rdp = d.rdp_available ? 'SI' : 'NO';
      const status = d.status || 'unknown';

      let rowStyle = '';
      if (isVpn) {
        rowStyle = 'style="background-color: #e0f2fe; color: #0369a1;"'; // soft blue for VPN
      } else if (hasNoCity) {
        rowStyle = 'style="background-color: #fef3c7; color: #b45309;"'; // soft amber/yellow for no city
      }

      const columns = [
        d.hostname || '',
        ip,
        d.mac || '',
        d.os || '',
        d.office || '',
        d.antivirus || '',
        status,
        rdp,
        d.responsible_user || '',
        d.job_title || '',
        d.authorized_systems || '',
        city,
        d.branch || '',
        d.department || '',
        d.brand || '',
        d.model || '',
        d.serial_number || '',
        d.location || ''
      ];

      return `
        <tr ${rowStyle}>
          ${columns.map((val, idx) => {
            let cellStyle = '';
            if (idx === 6) { // Status column
              if (val === 'online' || val === 'up') cellStyle = 'style="background-color: #d1fae5; color: #065f46; font-weight: bold; border: 1px solid #d1d5db;"';
              else if (val === 'offline' || val === 'down') cellStyle = 'style="background-color: #fee2e2; color: #991b1b; font-weight: bold; border: 1px solid #d1d5db;"';
            }
            return `<td ${cellStyle}>${String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
          }).join('')}
        </tr>
      `;
    }).join('');

    let excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Inventario de Equipos</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Segoe UI, sans-serif; }
          th { background-color: #10b981; color: white; font-weight: bold; border: 1px solid #d1d5db; padding: 6px; }
          td { border: 1px solid #e5e7eb; padding: 6px; }
          .title { font-size: 16px; font-weight: bold; color: #065f46; padding-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="title">Win NetWatch RMM - Inventario Completo de Equipos</div>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'inventario_equipos.xls';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    triggerToast('Inventario exportado como Excel estructurado', 'success');
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        let importedDevices = [];

        // Parse HTML Table (.xls generated by downloadDevicesCSV)
        if (text.includes('<table') || text.includes('<html')) {
          const parser = new DOMParser();
          const docEl = parser.parseFromString(text, 'text/html');
          const table = docEl.querySelector('table');
          if (!table) throw new Error('No se encontró la tabla de datos en el archivo Excel.');

          const headers = [...table.querySelectorAll('thead th')].map(th => th.innerText.trim().toLowerCase());
          const rows = [...table.querySelectorAll('tbody tr')];

          importedDevices = rows.map(tr => {
            const cells = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
            const dev = {};
            headers.forEach((h, index) => {
              const val = cells[index] || '';
              if (h.includes('hostname')) dev.hostname = val;
              else if (h.includes('ip')) dev.ip = val;
              else if (h.includes('mac')) dev.mac = val;
              else if (h.includes('os') || h.includes('sistema')) dev.os = val;
              else if (h.includes('office')) dev.office = val;
              else if (h.includes('antivirus')) dev.antivirus = val;
              else if (h.includes('status') || h.includes('estado')) dev.status = val;
              else if (h.includes('rdp')) dev.rdp_available = (val.toUpperCase() === 'SI' || val.toUpperCase() === 'YES' || val === '1' || val.toUpperCase() === 'TRUE');
              else if (h.includes('responsable')) dev.responsible_user = val;
              else if (h.includes('cargo')) dev.job_title = val;
              else if (h.includes('sistemas')) dev.authorized_systems = val;
              else if (h.includes('city') || h.includes('ciudad')) dev.city = val;
              else if (h.includes('branch') || h.includes('sucursal')) dev.branch = val;
              else if (h.includes('department') || h.includes('departamento')) dev.department = val;
              else if (h.includes('brand') || h.includes('marca')) dev.brand = val;
              else if (h.includes('model') || h.includes('modelo')) dev.model = val;
              else if (h.includes('serial') || h.includes('serie')) dev.serial_number = val;
              else if (h.includes('location') || h.includes('ubicación')) dev.location = val;
            });
            return dev;
          });
        } else {
          // Standard CSV parser (comma or semicolon split)
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          if (lines.length < 2) throw new Error('Archivo CSV vacío o con formato inválido');

          const delimiter = lines[0].includes(';') ? ';' : ',';
          const headers = lines[0].split(delimiter).map(h => h.replace(/["']/g, '').trim().toLowerCase());
          
          importedDevices = lines.slice(1).map(line => {
            const cells = line.split(delimiter).map(c => c.replace(/["']/g, '').trim());
            const dev = {};
            headers.forEach((h, index) => {
              const val = cells[index] || '';
              if (h.includes('hostname')) dev.hostname = val;
              else if (h.includes('ip')) dev.ip = val;
              else if (h.includes('mac')) dev.mac = val;
              else if (h.includes('os') || h.includes('sistema')) dev.os = val;
              else if (h.includes('office')) dev.office = val;
              else if (h.includes('antivirus')) dev.antivirus = val;
              else if (h.includes('status') || h.includes('estado')) dev.status = val;
              else if (h.includes('rdp')) dev.rdp_available = (val.toUpperCase() === 'SI' || val.toUpperCase() === 'YES' || val === '1' || val.toUpperCase() === 'TRUE');
              else if (h.includes('responsable')) dev.responsible_user = val;
              else if (h.includes('cargo')) dev.job_title = val;
              else if (h.includes('sistemas')) dev.authorized_systems = val;
              else if (h.includes('city') || h.includes('ciudad')) dev.city = val;
              else if (h.includes('branch') || h.includes('sucursal')) dev.branch = val;
              else if (h.includes('department') || h.includes('departamento')) dev.department = val;
              else if (h.includes('brand') || h.includes('marca')) dev.brand = val;
              else if (h.includes('model') || h.includes('modelo')) dev.model = val;
              else if (h.includes('serial') || h.includes('serie')) dev.serial_number = val;
              else if (h.includes('location') || h.includes('ubicación')) dev.location = val;
            });
            return dev;
          });
        }

        if (importedDevices.length === 0) {
          alert('No se encontraron registros de equipos válidos para importar.');
          return;
        }

        if (!confirm(`Se encontraron ${importedDevices.length} equipos en el archivo. ¿Deseas importarlos / actualizarlos en la base de datos?\n\nLos equipos existentes con la misma IP o Hostname se actualizarán.`)) {
          return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const item of importedDevices) {
          if (!item.ip && !item.hostname) {
            failCount++;
            continue;
          }

          // Search if device with this IP or Hostname exists
          const existing = devices.find(d => (item.ip && d.ip === item.ip) || (item.hostname && d.hostname && d.hostname.toLowerCase() === item.hostname.toLowerCase()));
          
          let empId = null;
          if (item.responsible_user) {
            const foundEmp = employees.find(e => e.full_name.trim().toLowerCase() === item.responsible_user.trim().toLowerCase());
            if (foundEmp) empId = foundEmp.id;
          }

          const devicePayload = {
            id: existing ? existing.id : undefined,
            hostname: item.hostname || (existing ? existing.hostname : ''),
            ip: item.ip || (existing ? existing.ip : ''),
            mac: item.mac || (existing ? existing.mac : ''),
            os: item.os || (existing ? existing.os : ''),
            office: item.office || (existing ? existing.office : ''),
            antivirus: item.antivirus || (existing ? existing.antivirus : ''),
            status: item.status || (existing ? existing.status : 'unknown'),
            rdp_available: item.rdp_available !== undefined ? item.rdp_available : (existing ? existing.rdp_available : false),
            responsible_user: item.responsible_user || (existing ? existing.responsible_user : ''),
            job_title: item.job_title || (existing ? existing.job_title : ''),
            authorized_systems: item.authorized_systems || (existing ? existing.authorized_systems : ''),
            city: item.city || (existing ? existing.city : ''),
            branch: item.branch || (existing ? existing.branch : ''),
            department: item.department || (existing ? existing.department : ''),
            brand: item.brand || (existing ? existing.brand : ''),
            model: item.model || (existing ? existing.model : ''),
            serial_number: item.serial_number || (existing ? existing.serial_number : ''),
            location: item.location || (existing ? existing.location : 'Matta'),
            device_type: item.device_type || (existing ? existing.device_type : 'PC'),
            employee_id: empId || (existing ? existing.employee_id : null)
          };

          try {
            await saveDevice(devicePayload);
            successCount++;
          } catch (err) {
            console.error('Error importing device:', item.ip || item.hostname, err);
            failCount++;
          }
        }

        triggerToast(`Migración completada: ${successCount} importados/actualizados correctamente. Errores: ${failCount}`, successCount > 0 ? 'success' : 'error');
        loadData();
      } catch (err) {
        console.error(err);
        alert('Error al procesar el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportJSONs = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (!confirm(`Se encontraron ${files.length} fichas JSON de equipos. ¿Deseas importarlas / actualizarlas en la base de datos?\n\nLos datos de hardware se asociarán a cada equipo correspondiente.`)) {
      e.target.value = '';
      return;
    }

    const importedList = [];
    const failedList = [];

    for (const file of files) {
      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsText(file);
        });

        // Limpiar JSON de caracteres BOM u otros caracteres no válidos de PowerShell
        let cleanText = text.replace(/^\ufeff/, '').trim();
        const startIdx = cleanText.indexOf('{');
        const endIdx = cleanText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
          cleanText = cleanText.slice(startIdx, endIdx + 1);
        }

        const data = JSON.parse(cleanText);
        if (!data.ip) {
          throw new Error('El archivo no contiene una IP válida (campo "ip" ausente).');
        }

        // Buscar si ya existe por IP
        const existing = devices.find(d => d.ip === data.ip);

        // Si ya existe y ya tiene datos de hardware completos E info de Office/Antivirus (no omitir si estos ultimos faltaban)
        if (existing && existing.cpu && existing.cpu.trim() !== '' && existing.office && existing.office.trim() !== '' && existing.office !== 'No detectado') {
          importedList.push({
            hostname: data.hostname || 'Sin nombre',
            ip: data.ip,
            statusText: 'Ya registrado (Omitido)',
            isSkip: true,
            fileName: file.name
          });
          continue;
        }

        let empId = null;
        if (data.responsible_user) {
          const foundEmp = employees.find(e => e.full_name.trim().toLowerCase() === data.responsible_user.trim().toLowerCase());
          if (foundEmp) empId = foundEmp.id;
        }

        // Calcular subred
        const ipParts = data.ip.split('.');
        const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24` : 'unknown';

        const devicePayload = {
          id: existing ? existing.id : undefined, // Si existe, actualiza ese mismo ID (evita duplicados)
          hostname: data.hostname || (existing ? existing.hostname : ''),
          ip: data.ip,
          mac: data.mac || (existing ? existing.mac : ''),
          os: data.os || (existing ? existing.os : ''),
          office: data.office || (existing ? existing.office : ''),
          antivirus: data.antivirus || (existing ? existing.antivirus : ''),
          status: 'online',
          last_seen: new Date().toISOString(),
          responsible_user: data.responsible_user || (existing ? existing.responsible_user : ''),
          job_title: data.job_title || (existing ? existing.job_title : ''),
          authorized_systems: data.authorized_systems || (existing ? existing.authorized_systems : ''),
          city: data.city || (existing ? existing.city : ''),
          branch: data.branch || (existing ? existing.branch : ''),
          department: data.department || (existing ? existing.department : ''),
          brand: data.brand || (existing ? existing.brand : ''),
          model: data.model || (existing ? existing.model : ''),
          serial_number: data.serial_number || (existing ? existing.serial_number : ''),
          location: data.location || (existing ? existing.location : 'Matta'),
          device_type: data.device_type || (existing ? existing.device_type : 'PC'),
          employee_id: empId || (existing ? existing.employee_id : null),
          cpu: data.cpu || (existing ? existing.cpu : ''),
          ram: data.ram || (existing ? existing.ram : ''),
          storage: data.storage || (existing ? existing.storage : ''),
          gpu: data.gpu || (existing ? existing.gpu : ''),
          motherboard: data.motherboard || (existing ? existing.motherboard : '')
        };

        await saveDevice(devicePayload);

        // Si estamos en Cloud, agregar evento también
        if (!useLocalApi) {
          const eventId = doc(collection(db, 'events')).id;
          await setDoc(doc(db, 'events', eventId), {
            id: eventId,
            device_id: existing ? existing.id : doc(collection(db, 'devices')).id,
            type: existing ? 'device.online' : 'device.new',
            severity: 'info',
            message: `Ficha importada manualmente desde JSON para equipo ${data.hostname || data.ip}`,
            created_at: new Date().toISOString()
          });
        }

        importedList.push({
          hostname: data.hostname || 'Sin nombre',
          ip: data.ip,
          isUpdate: !!existing,
          statusText: existing ? 'Actualizado' : 'Nuevo',
          fileName: file.name
        });
      } catch (err) {
        console.error('Error importando ficha JSON:', file.name, err);
        failedList.push({
          fileName: file.name,
          error: err.message || String(err)
        });
      }
    }

    setImportResultModal({ success: importedList, failed: failedList });
    loadData();
    e.target.value = '';
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-slate-950 dark:text-slate-100 font-sans transition-colors duration-300">
      <datalist id="existing-ips">
        {allIps.map(ip => (
          <option key={ip} value={ip} />
        ))}
      </datalist>
      <datalist id="existing-emails">
        {allEmails.map(email => (
          <option key={email} value={email} />
        ))}
      </datalist>
      {firebaseQuotaExceeded && (
        <div className="bg-amber-500 text-zinc-950 text-center py-2 px-4 text-xs font-bold flex items-center justify-center gap-2 border-b border-amber-600/20 shadow-md">
          <AlertTriangle size={14} className="flex-shrink-0 animate-pulse text-amber-950" />
          <span>Límite de cuota en la Nube (Firebase) excedido. Los cambios se guardan localmente en tiempo real, pero se sincronizarán con la Nube una vez restablecida la cuota diaria (esta noche).</span>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex flex-col md:flex-row md:items-center justify-between px-4 py-3 gap-3 max-w-[1600px]">
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 shadow">
                <Network size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Win NetWatch RMM</h1>
                <p className="text-xs text-zinc-500 dark:text-slate-400">{user?.role} · {user?.email}</p>
              </div>
            </div>
            {/* Mobile-only action buttons */}
            <div className="flex items-center gap-1 md:hidden">
              <IconButton title="Ejecutar escaneo" onClick={() => executeRemoteAction(null, 'scan')}><RefreshCw size={16} /></IconButton>
              <IconButton title="Tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</IconButton>
              <IconButton title="Cerrar Sesión" onClick={async () => {
                try { await auth.signOut(); } catch(_) {}
                localStorage.clear();
                location.reload();
              }}><LogOut size={16} /></IconButton>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Navigation tabs */}
            <nav className="flex items-center gap-1 bg-zinc-200/50 dark:bg-slate-900/50 p-1 rounded-xl w-full sm:w-auto">
              <button
                onClick={() => setCurrentTab('dashboard')}
                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-lg transition-all text-center ${
                  currentTab === 'dashboard'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-zinc-600 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Monitoreo
              </button>
              {(user?.role === 'Super Administrador' || user?.role === 'Administrador') && (
                <button
                  onClick={() => setCurrentTab('admin')}
                  className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-lg transition-all text-center ${
                    currentTab === 'admin'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-zinc-600 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Administración
                </button>
              )}
            </nav>

            {/* Desktop-only action buttons */}
            <div className="hidden md:flex items-center gap-2">
              {isAdmin && <IconButton title="Ejecutar escaneo" onClick={() => executeRemoteAction(null, 'scan')}><RefreshCw size={18} /></IconButton>}
              <IconButton title="Exportar CSV" onClick={downloadDevicesCSV}><FileDown size={18} /></IconButton>
              <IconButton title="Tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
              <IconButton title="Cerrar Sesión" onClick={async () => {
                try { await auth.signOut(); } catch(_) {}
                localStorage.clear();
                location.reload();
              }}><LogOut size={18} /></IconButton>
            </div>
          </div>
        </div>
      </header>

      {currentTab === 'dashboard' ? (
        <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <Stats summary={summary} />

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              <Panel title="Mapa de estado de red" icon={<Boxes size={18} />}>
                <SubnetMap rows={bySubnet} getSubnetLabel={getSubnetLabel} devices={devices} onOpen={(device) => setSelected(device)} />
              </Panel>
              <Panel title="Tendencia histórica" icon={<Activity size={18} />}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis dataKey="time" stroke="currentColor" opacity={0.5} fontSize={10} />
                      {/* Eje izquierdo: Equipos Online y Offline (Auto-zoom basado en el minimo y maximo de datos) */}
                      <YAxis yAxisId="left" domain={['auto', 'auto']} allowDecimals={false} stroke="#10b981" opacity={0.6} fontSize={10} />
                      {/* Eje derecho: Latencia Promedio (Auto-zoom para ver fluctuaciones milimetricas) */}
                      <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} allowDecimals={false} stroke="#f59e0b" opacity={0.6} fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <Area yAxisId="left" type="monotone" dataKey="Equipos Online" stroke="#10b981" fill="url(#colorOnline)" strokeWidth={2} />
                      <Area yAxisId="left" type="monotone" dataKey="Equipos Offline" stroke="#ef4444" fill="url(#colorOffline)" strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="Latencia Promedio (ms)" stroke="#f59e0b" fill="url(#colorLatency)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <Panel title="Equipos" icon={<Laptop size={18} />}>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_150px_150px]">
                <div className="relative">
                  <input className="input pr-10" placeholder="Buscar por nombre, IP, responsable, ubicación..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
                  <Search className="absolute right-3 top-2.5 text-zinc-400" size={18} />
                </div>
                <select className="input" value={deviceSortOption} onChange={(e) => setDeviceSortOption(e.target.value)}>
                  <option value="ip">Ordenar por IP</option>
                  <option value="name">Ordenar por Nombre</option>
                </select>
                <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                  <option value="">Todos los estados</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="slow">Respuesta lenta</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onOpen={() => setSelected(device)}
                    onConnectRdp={() => connectRdp(device)}
                    getSubnetLabel={getSubnetLabel}
                    infrastructure={infrastructure}
                  />
                ))}
              </div>
            </Panel>
          </section>

          <aside className="space-y-4">
            <Panel title="Ultimas alertas" icon={<Bell size={18} />}>
              <div className="feed-scroll">
                <Feed rows={alerts} kind="alert" devices={devices} />
              </div>
            </Panel>
            <Panel title="Auditoria y eventos" icon={<Clock3 size={18} />}>
              <div className="feed-scroll">
                <Feed rows={events} kind="event" devices={devices} />
              </div>
            </Panel>
            <Panel title="Anomalías y Reinicios" icon={<Shield size={18} />}>
              <div className="feed-scroll">
                <Feed rows={anomalies} kind="anomaly" devices={devices} />
              </div>
            </Panel>

            {useLocalApi && (
              <Panel
                title="Consola de Escaneo en Tiempo Real"
                icon={<TerminalSquare size={18} className="text-emerald-500" />}
                headerAction={
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex items-center gap-1.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={consoleSearch}
                          onChange={e => setConsoleSearch(e.target.value)}
                          placeholder="Buscar IP…"
                          className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] rounded px-2 py-0.5 pl-5 w-28 focus:outline-none focus:border-emerald-500 placeholder-zinc-600"
                        />
                        <span className="absolute left-1.5 top-0.5 text-zinc-500 text-[10px] select-none">🔍</span>
                      </div>
                      {consoleSearch.trim() && (
                        <button
                          type="button"
                          disabled={isProbing}
                          onClick={handleProbeIp}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition disabled:opacity-50"
                        >
                          {isProbing ? 'Probando...' : 'Probar IP'}
                        </button>
                      )}
                      {consoleSearch.trim() && (
                        <span className="text-[9px] text-emerald-400 font-bold whitespace-nowrap">
                          {scanLogs.filter(l => l.toLowerCase().includes(consoleSearch.trim().toLowerCase())).length} res
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsTerminalScrolling(!isTerminalScrolling)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition ${
                        isTerminalScrolling ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {isTerminalScrolling ? 'Auto-scroll: On' : 'Auto-scroll: Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanLogs([])}
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition"
                    >
                      Limpiar
                    </button>
                  </div>
                }
              >
                <TerminalConsole
                  logs={scanLogs}
                  autoScroll={isTerminalScrolling && !consoleSearch.trim()}
                  searchTerm={consoleSearch}
                />
              </Panel>
            )}

            <Panel title="Vista jerárquica" icon={<Building2 size={18} />}>
               <NetworkGroups rows={networkMap} getSubnetLabel={getSubnetLabel} />
            </Panel>
          </aside>
        </div>
      ) : (
        <div className="mx-auto max-w-[1600px] px-4 py-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xl text-zinc-950 dark:text-slate-100">
            <div className="mb-6 flex border-b border-zinc-200 dark:border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none">
              <button
                onClick={() => setAdminSubTab('employees')}
                className={`border-b-2 px-5 py-3 text-sm font-bold transition-all -mb-[2px] ${
                  adminSubTab === 'employees'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Gestión de Empleados
              </button>

              <button
                onClick={() => setAdminSubTab('devices')}
                className={`border-b-2 px-5 py-3 text-sm font-bold transition-all -mb-[2px] ${
                  adminSubTab === 'devices'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Inventario de Equipos
              </button>

              <button
                onClick={() => setAdminSubTab('config')}
                className={`border-b-2 px-5 py-3 text-sm font-bold transition-all -mb-[2px] ${
                  adminSubTab === 'config'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Parámetros y Red
              </button>

              <button
                onClick={() => setAdminSubTab('users')}
                className={`border-b-2 px-5 py-3 text-sm font-bold transition-all -mb-[2px] ${
                  adminSubTab === 'users'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Usuarios del Sistema
              </button>

              <button
                onClick={() => setAdminSubTab('infrastructure')}
                className={`border-b-2 px-5 py-3 text-sm font-bold transition-all -mb-[2px] ${
                  adminSubTab === 'infrastructure'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Infraestructura (Switches/Monitores)
              </button>
            </div>

            {adminSubTab === 'employees' ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-md">
                    <input
                      className="input pr-10"
                      placeholder="Buscar empleado por nombre, email, dpto, ciudad..."
                      value={employeeFilter}
                      onChange={(e) => setEmployeeFilter(e.target.value)}
                    />
                    <Search className="absolute right-3 top-2.5 text-zinc-400" size={18} />
                  </div>
                  <button
                    onClick={() =>
                      setEmployeeModal({
                        mode: 'create',
                        form: {
                          full_name: '',
                          email: '',
                          department: '',
                          city: '',
                          status: 'Presencial',
                          phone: '',
                          workplace: 'Presencial',
                          vpn_active: false,
                          vpn_type: 'Ninguno',
                          image_url: '',
                          active: true
                        }
                      })
                    }
                    className="button primary flex items-center gap-1.5"
                  >
                    <Plus size={16} /> Agregar Empleado
                  </button>
                </div>

                <div className="overflow-hidden border border-zinc-200 dark:border-slate-800 rounded-xl shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-semibold">
                          <th className="py-3.5 px-4">Empleado</th>
                          <th className="py-3.5 px-4">Email</th>
                          <th className="py-3.5 px-4">Departamento</th>
                          <th className="py-3.5 px-4">Lugar Trabajo</th>
                          <th className="py-3.5 px-4">Teléfono</th>
                          <th className="py-3.5 px-4">VPN</th>
                          <th className="py-3.5 px-4">Estado</th>
                          <th className="py-3.5 px-4">Equipos</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="py-8 text-center text-zinc-500 dark:text-slate-400">
                              No se encontraron empleados.
                            </td>
                          </tr>
                        ) : (
                          filteredEmployees.map((emp) => {
                            const assigned = devices.filter(d => d.employee_id === emp.id);
                            return (
                              <tr
                                key={emp.id}
                                onClick={() => setEmployeeModal({ mode: 'view', form: emp })}
                                className="cursor-pointer border-b border-zinc-100 dark:border-slate-800/50 hover:bg-zinc-50/50 dark:hover:bg-slate-800/30 transition duration-150"
                              >
                                <td className="py-3 px-4 font-semibold">
                                  <div className="flex items-center gap-2.5">
                                    {emp.image_url ? (
                                      <img src={emp.image_url} alt={emp.full_name} className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-slate-700" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center font-bold text-xs">
                                        {getInitials(emp.full_name)}
                                      </div>
                                    )}
                                    <span>{emp.full_name}</span>
                                  </div>
                                </td>
                                 <td className="py-3 px-4 text-zinc-500 dark:text-slate-400">
                                   {emp.email ? (
                                     <a
                                       href={`mailto:${emp.email}`}
                                       className="text-zinc-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:underline transition-colors"
                                       title="Enviar correo"
                                     >
                                       {emp.email}
                                     </a>
                                   ) : (
                                     '—'
                                   )}
                                 </td>
                                <td className="py-3 px-4">{emp.department || '—'}</td>
                                <td className="py-3 px-4">
                                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    (emp.workplace || emp.status) === 'Teletrabajo' || (emp.workplace || emp.status) === 'Remoto'
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300'
                                      : 'bg-zinc-100 text-zinc-800 dark:bg-slate-800 dark:text-slate-300'
                                  }`}>
                                    {emp.workplace || emp.status || 'Presencial'}
                                  </span>
                                </td>
                                 <td className="py-3 px-4 font-mono text-xs">
                                   {emp.phone ? (() => {
                                     const digits = emp.phone.replace(/\D/g, '');
                                     const waNum = digits.length === 9 && digits.startsWith('9') ? '56' + digits : digits;
                                     return (
                                       <a
                                         href={`whatsapp://send?phone=${waNum}`}
                                         className="text-emerald-500 hover:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1"
                                         title="Escribir o llamar por WhatsApp"
                                       >
                                         {emp.phone}
                                       </a>
                                     );
                                   })() : (
                                     '—'
                                   )}
                                 </td>
                                <td className="py-3 px-4">
                                  {emp.vpn_active ? (
                                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400">
                                      {emp.vpn_type || 'Activa'}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-zinc-400 dark:text-slate-500">Inactiva</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    emp.active
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${emp.active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                    {emp.active ? 'Activo' : 'Inactivo'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-bold">{assigned.length}</td>
                                <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEmployeeModal({ mode: 'edit', form: emp })}
                                      className="button secondary py-1 px-2.5 text-xs hover:border-emerald-500"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => deleteEmployee(emp.id)}
                                      className="button py-1 px-2.5 text-xs text-red-500 border-red-200 dark:border-red-900/30 hover:border-red-500 hover:bg-red-500/10"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : adminSubTab === 'devices' ? (
              <div className="space-y-4">
                {/* Categorization tab bar */}
                <div className="flex flex-wrap gap-1.5 bg-zinc-100 dark:bg-slate-950 p-1.5 rounded-xl border border-zinc-200/50 dark:border-slate-800/50">
                  {['Todos', 'PC', 'Notebook', 'All in One', 'Servidor', 'Otro'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setInventoryTab(tab)}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        inventoryTab === tab
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      {tab === 'Todos' ? 'Todos' : tab === 'PC' ? 'PC de Escritorio' : tab}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {/* Row 1: Search Input (Full width on mobile) */}
                  <div className="relative w-full sm:max-w-md">
                    <input
                      className="input w-full pr-10"
                      placeholder="Buscar equipo por hostname, IP, marca, modelo, ubicación..."
                      value={deviceFilter}
                      onChange={(e) => setDeviceFilter(e.target.value)}
                    />
                    <Search className="absolute right-3 top-2.5 text-zinc-400" size={18} />
                  </div>

                  {/* Row 2: Sorting Options & Bulk Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-slate-400">Ordenar por:</span>
                      <select
                        className="input text-xs py-1.5 font-semibold bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-lg px-2 text-zinc-700 dark:text-slate-300"
                        value={deviceSortOption}
                        onChange={(e) => setDeviceSortOption(e.target.value)}
                      >
                        <option value="ip">Dirección IP</option>
                        <option value="name">Nombre / Hostname</option>
                      </select>
                    </div>
                    
                    {/* Botón de Eliminación Masiva */}
                    {selectedDeviceIds.length > 0 && (
                      <button
                        onClick={deleteSelectedDevices}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow border border-red-600 animate-in fade-in slide-in-from-left-2 duration-200"
                        title="Eliminar en lote todos los equipos seleccionados"
                      >
                        <Trash2 size={14} />
                        Eliminar Seleccionados ({selectedDeviceIds.length})
                      </button>
                    )}
                  </div>

                  {/* Row 3: Action Buttons (Stacked on mobile, side-by-side on desktop) */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full">
                    <input
                      type="file"
                      id="importExcelInput"
                      accept=".xls,.xlsx,.csv"
                      onChange={handleImportExcel}
                      className="hidden"
                    />
                    <input
                      type="file"
                      id="importJsonInput"
                      accept=".json"
                      multiple
                      onChange={handleImportJSONs}
                      className="hidden"
                    />
                    <button
                      onClick={() => document.getElementById('importExcelInput').click()}
                      className="button secondary text-xs flex flex-1 sm:flex-initial items-center justify-center gap-1.5 font-bold"
                      title="Importar inventario desde archivo Excel estructurado o CSV"
                    >
                      <Upload size={16} className="text-emerald-500" />
                      Importar XLS / CSV
                    </button>
                    <button
                      onClick={() => document.getElementById('importJsonInput').click()}
                      className="button secondary text-xs flex flex-1 sm:flex-initial items-center justify-center gap-1.5 font-bold"
                      title="Importar fichas JSON de hardware de equipos"
                    >
                      <Download size={16} className="text-emerald-500" />
                      Importar Fichas JSON
                    </button>
                    <button
                      onClick={() => setDeviceModal({ mode: 'create', form: { ip: '', hostname: '', mac: '', os: '', city: '', branch: '', department: '', responsible_user: '', job_title: '', phone: '', email: '', notes: '', brand: '', model: '', serial_number: '', asset_status: 'active', critical: false, managed: false, tags: [], cpu: '', ram: '', storage: '', gpu: '', motherboard: '', image_url: '', device_type: 'PC', location: 'Matta', employee_id: null } })}
                      className="button primary text-xs flex w-full sm:w-auto items-center justify-center gap-1.5 font-bold rounded-xl"
                    >
                      <Plus size={16} /> Registrar Equipo Manual
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden border border-zinc-200 dark:border-slate-800 rounded-xl shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-semibold">
                          <th className="py-3.5 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 h-4 w-4"
                              checked={filteredAdminDevicesByTab.length > 0 && selectedDeviceIds.length === filteredAdminDevicesByTab.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeviceIds(filteredAdminDevicesByTab.map(d => d.id));
                                } else {
                                  setSelectedDeviceIds([]);
                                }
                              }}
                            />
                          </th>
                          <th className="py-3.5 px-4">Equipo (Hostname)</th>
                          <th className="py-3.5 px-4">Dirección IP</th>
                          <th className="py-3.5 px-4">MAC</th>
                          <th className="py-3.5 px-4">Sistema Op.</th>
                          <th className="py-3.5 px-4">Office</th>
                          <th className="py-3.5 px-4">Antivirus</th>
                          <th className="py-3.5 px-4">Categoría</th>
                          <th className="py-3.5 px-4">Responsable</th>
                          <th className="py-3.5 px-4">Ubicación</th>
                          <th className="py-3.5 px-4">Estado Red</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdminDevicesByTab.length === 0 ? (
                          <tr>
                            <td colSpan="11" className="py-8 text-center text-zinc-500 dark:text-slate-400">
                              No se encontraron equipos en esta sección.
                            </td>
                          </tr>
                        ) : (
                          filteredAdminDevicesByTab.map((dev) => {
                            const emp = employees.find(e => e.id === dev.employee_id);
                            const isRemote = emp && (emp.vpn_active || emp.workplace === 'Teletrabajo');
                            const rowClass = isRemote
                              ? "cursor-pointer border-b border-sky-100 dark:border-sky-950/40 bg-sky-50/40 dark:bg-sky-950/15 hover:bg-sky-100/50 dark:hover:bg-sky-950/25 transition duration-150"
                              : "cursor-pointer border-b border-zinc-100 dark:border-slate-800/50 hover:bg-zinc-50/50 dark:hover:bg-slate-800/30 transition duration-150";
                            return (
                              <tr
                                key={dev.id}
                                onClick={() => setDeviceModal({ mode: 'edit', form: dev })}
                                className={rowClass + (selectedDeviceIds.includes(dev.id) ? " bg-emerald-500/5 dark:bg-emerald-500/5" : "")}
                              >
                                <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 h-4 w-4"
                                    checked={selectedDeviceIds.includes(dev.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedDeviceIds(prev => [...prev, dev.id]);
                                      } else {
                                        setSelectedDeviceIds(prev => prev.filter(id => id !== dev.id));
                                      }
                                    }}
                                  />
                                </td>
                                <td className="py-3 px-4 font-semibold">
                                  <div className="flex items-center gap-2.5">
                                    {dev.image_url ? (
                                      <img src={dev.image_url} alt={dev.hostname} className="w-8 h-8 rounded object-cover border border-zinc-200 dark:border-slate-700 flex-shrink-0" />
                                    ) : (
                                      <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 text-zinc-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
                                        <Laptop size={16} />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-zinc-950 dark:text-white truncate block max-w-[130px]" title={dev.hostname || 'Equipo sin nombre'}>
                                          {dev.hostname || 'Equipo sin nombre'}
                                        </span>
                                        {dev.critical && <span className="rounded bg-amber-400 px-1 py-0.5 text-[8px] font-extrabold text-slate-950 tracking-wider flex-shrink-0">CRÍTICO</span>}
                                      </div>
                                      <span className="text-[10px] text-zinc-400 dark:text-slate-400 block font-normal truncate max-w-[130px]" title={`${dev.brand} ${dev.model}`}>{dev.brand} {dev.model}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-zinc-550 dark:text-slate-350 font-mono text-xs">{dev.ip}</td>
                                <td className="py-3 px-4 text-zinc-500 dark:text-slate-400 font-mono text-[11px]">{dev.mac || '—'}</td>
                                <td className="py-3 px-4 text-zinc-700 dark:text-slate-300 text-xs font-medium max-w-[130px] truncate" title={dev.os || '—'}>{dev.os || '—'}</td>
                                <td className="py-3 px-4 text-zinc-700 dark:text-slate-300 text-xs font-medium max-w-[130px] truncate" title={dev.office || '—'}>{dev.office || '—'}</td>
                                <td className="py-3 px-4 text-zinc-700 dark:text-slate-300 text-xs font-medium max-w-[130px] truncate" title={dev.antivirus || '—'}>{dev.antivirus || '—'}</td>
                                <td className="py-3 px-4">
                                  <span className="rounded bg-slate-100 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 px-2 py-0.5 text-xs font-semibold">
                                    {dev.device_type || 'PC'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <div className="max-w-[130px] min-w-0">
                                    {emp ? (
                                      <button
                                        type="button"
                                        onClick={() => setEmployeeModal({ mode: 'view', form: emp })}
                                        className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline text-left truncate block w-full"
                                        title={dev.responsible_user || 'Sin asignar'}
                                      >
                                        {dev.responsible_user || 'Sin asignar'}
                                      </button>
                                    ) : (
                                      <div className="font-semibold text-zinc-800 dark:text-slate-200 truncate block w-full" title={dev.responsible_user || 'Sin asignar'}>
                                        {dev.responsible_user || 'Sin asignar'}
                                      </div>
                                    )}
                                    {dev.email && <span className="text-[10px] text-zinc-400 dark:text-slate-500 block font-normal truncate w-full" title={dev.email}>{dev.email}</span>}
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-bold text-xs text-emerald-600 dark:text-emerald-400 max-w-[100px]">
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <span className="truncate block" title={dev.location || 'Matta'}>{dev.location || 'Matta'}</span>
                                    {isRemote && (
                                      <span className="inline-block self-start rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-350 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-wide border border-sky-200 dark:border-sky-800/50 shadow-sm truncate max-w-full" title="VPN / Teletrabajo">
                                        VPN
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <StatusPill status={dev.status} />
                                </td>
                                <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setDeviceModal({ mode: 'edit', form: dev })}
                                      className="button secondary py-1 px-2.5 text-xs hover:border-emerald-500"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => deleteDevice(dev.id)}
                                      className="button py-1 px-2.5 text-xs text-red-500 border-red-200 dark:border-red-900/30 hover:border-red-500"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : adminSubTab === 'users' ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-md">
                    <input
                      className="input pr-10"
                      placeholder="Buscar usuario por nombre o correo..."
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                    />
                    <Search className="absolute right-3 top-2.5 text-zinc-400" size={18} />
                  </div>
                  <button
                    className="button primary text-xs flex items-center gap-2 px-4 py-2.5 font-bold rounded-xl"
                    onClick={() => setUserModal({ mode: 'create', form: { email: '', password: '', full_name: '', role_id: appRoles[0]?.id || '' } })}
                  >
                    <UserPlus size={16} /> Nuevo Usuario
                  </button>
                </div>

                <div className="border border-zinc-200 dark:border-slate-800/80 rounded-2xl overflow-hidden overflow-x-auto shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-bold text-xs uppercase border-b border-zinc-200 dark:border-slate-800">
                        <th className="py-3 px-4">Nombre</th>
                        <th className="py-3 px-4">Correo</th>
                        <th className="py-3 px-4">Rol</th>
                        <th className="py-3 px-4 text-center">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appUsers.filter(u => {
                        const q = userFilter.toLowerCase();
                        return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                      }).length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-8 text-center text-zinc-500 dark:text-slate-400">No se encontraron usuarios.</td>
                        </tr>
                      ) : (
                        appUsers.filter(u => {
                          const q = userFilter.toLowerCase();
                          return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                        }).map((u) => (
                          <tr key={u.id} className="border-b border-zinc-100 dark:border-slate-800/50 hover:bg-zinc-50/50 dark:hover:bg-slate-800/30 transition duration-150">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                  u.active
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : 'bg-zinc-200 text-zinc-500 dark:bg-slate-800 dark:text-slate-500'
                                }`}>
                                  {getInitials(u.full_name)}
                                </div>
                                <span className="font-semibold text-zinc-800 dark:text-slate-100">{u.full_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-zinc-500 dark:text-slate-400 font-mono text-xs">{u.email}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                u.role_name === 'Super Administrador' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                                : u.role_name === 'Administrador' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                                : u.role_name === 'Soporte TI' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                                : u.role_name === 'Solo Lectura' ? 'bg-zinc-100 text-zinc-600 dark:bg-slate-800 dark:text-slate-400'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              }`}>
                                {u.role_name === 'Solo Lectura' && <Eye size={10} />}
                                {u.role_name === 'Super Administrador' && <Shield size={10} />}
                                {u.role_name}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => toggleAppUser(u.id, u.active)}
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition ${
                                  u.active
                                    ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                    : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                                }`}
                                title={u.active ? 'Desactivar' : 'Activar'}
                              >
                                {u.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                {u.active ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    const defaultRoles = [
                                      { id: '1', name: 'Administrador' },
                                      { id: '2', name: 'Solo Lectura' },
                                      { id: '3', name: 'Soporte TI' }
                                    ];
                                    let resolvedRoleId = u.role_id;
                                    if (!resolvedRoleId && u.role_name) {
                                      const found = (appRoles.length > 0 ? appRoles : defaultRoles).find(r => r.name === u.role_name);
                                      if (found) resolvedRoleId = found.id;
                                    }
                                    setUserModal({ mode: 'edit', form: { id: u.id, email: u.email, full_name: u.full_name, role_id: resolvedRoleId, active: u.active, password: '' } });
                                  }}
                                  className="text-sky-500 hover:text-sky-700 p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/30 transition"
                                  title="Editar"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => deleteAppUser(u.id)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* User create/edit modal */}
                {userModal && (
                  <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-5">
                        <Lock size={20} className="text-emerald-500" />
                        {userModal.mode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
                      </h3>
                      <form onSubmit={(e) => { e.preventDefault(); saveAppUser(userModal.form); }} className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Nombre Completo</label>
                          <input
                            className="input w-full"
                            placeholder="ej: Juan Pérez"
                            value={userModal.form.full_name}
                            onChange={(e) => setUserModal({ ...userModal, form: { ...userModal.form, full_name: e.target.value } })}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Correo Electrónico</label>
                          <input
                            className="input w-full"
                            type="email"
                            placeholder="ej: usuario@empresa.cl"
                            value={userModal.form.email}
                            onChange={(e) => setUserModal({ ...userModal, form: { ...userModal.form, email: e.target.value } })}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">
                            {userModal.mode === 'create' ? 'Contraseña' : 'Nueva Contraseña (dejar vacío para no cambiar)'}
                          </label>
                          <input
                            className="input w-full"
                            type="password"
                            placeholder={userModal.mode === 'create' ? 'Contraseña segura' : '••••••••'}
                            value={userModal.form.password}
                            onChange={(e) => setUserModal({ ...userModal, form: { ...userModal.form, password: e.target.value } })}
                            {...(userModal.mode === 'create' ? { required: true } : {})}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Rol / Permisos</label>
                          <select
                            className="input w-full"
                            value={userModal.form.role_id}
                            onChange={(e) => setUserModal({ ...userModal, form: { ...userModal.form, role_id: e.target.value } })}
                            required
                          >
                            <option value="">Seleccionar rol...</option>
                            {(appRoles.length > 0 ? appRoles : [
                              { id: '1', name: 'Administrador' },
                              { id: '2', name: 'Solo Lectura' },
                              { id: '3', name: 'Soporte TI' }
                            ]).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}{r.name === 'Solo Lectura' ? ' (solo ver, sin editar)' : ''}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[10px] text-zinc-400 dark:text-slate-500">
                            "Solo Lectura" permite ver el monitoreo sin acceso a editar ni administrar.
                          </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-slate-800">
                          <button type="button" className="button secondary" onClick={() => setUserModal(null)}>Cancelar</button>
                          <button type="submit" className="button primary flex items-center gap-1.5">
                            <Shield size={14} />
                            {userModal.mode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ) : adminSubTab === 'config' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMN 1: Mapeo de Subredes */}
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-slate-800/80 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-zinc-800 dark:text-white flex items-center gap-2">
                      <Network size={18} className="text-emerald-500" />
                      Mapeo de Subredes
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">
                      Asigna nombres amigables a las subredes (ej: 100.0/24 &rarr; Antofagasta Rendic).
                    </p>
                  </div>
                  
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newSubnet || !newSubnetLabel) return;
                    await saveSubnetMapping(newSubnet.trim(), newSubnetLabel.trim());
                    setNewSubnet('');
                    setNewSubnetLabel('');
                  }} className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Subred IP (ej. 172.30.100.0 o 100.0)</label>
                      <input 
                        type="text"
                        className="input w-full text-sm"
                        placeholder="ej: 172.30.100.0 o 100.0"
                        value={newSubnet}
                        onChange={(e) => setNewSubnet(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Nombre Descriptivo</label>
                      <input 
                        type="text"
                        className="input w-full text-sm"
                        placeholder="ej: Antofagasta Rendic"
                        value={newSubnetLabel}
                        onChange={(e) => setNewSubnetLabel(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="button primary w-full text-xs py-2 flex items-center justify-center gap-1.5 font-bold">
                      <Plus size={14} /> Registrar Mapeo
                    </button>
                  </form>

                  <div className="border border-zinc-100 dark:border-slate-800/50 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto feed-scroll">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-bold border-b border-zinc-100 dark:border-slate-800/50">
                          <th className="p-2.5">Subred</th>
                          <th className="p-2.5">Nombre</th>
                          <th className="p-2.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subnetMappings.length === 0 ? (
                          <tr>
                            <td colSpan="3" className="p-4 text-center text-zinc-400 dark:text-slate-500">No hay subredes mapeadas.</td>
                          </tr>
                        ) : (
                          subnetMappings.map((m) => (
                            <tr key={m.subnet} className="border-b border-zinc-50 dark:border-slate-800/30 hover:bg-zinc-50/50 dark:hover:bg-slate-800/20 transition duration-150">
                              <td className="p-2.5 font-mono text-zinc-600 dark:text-slate-300 font-semibold">{m.subnet}</td>
                              <td className="p-2.5 text-zinc-800 dark:text-slate-200 font-semibold">{m.label}</td>
                              <td className="p-2.5 text-right">
                                <button 
                                  onClick={() => deleteSubnetMapping(m.subnet)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/35 transition"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* COLUMN 2: Departamentos */}
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-slate-800/80 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-zinc-800 dark:text-white flex items-center gap-2">
                      <Briefcase size={18} className="text-emerald-500" />
                      Departamentos / Áreas
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">
                      Gestiona la lista predeterminada de departamentos para empleados y equipos.
                    </p>
                  </div>
                  
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newDeptName) return;
                    await saveDepartmentParam(newDeptName.trim());
                    setNewDeptName('');
                  }} className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Nombre del Departamento</label>
                      <input 
                        type="text"
                        className="input w-full text-sm"
                        placeholder="ej: Informática, Recursos Humanos..."
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="button primary w-full text-xs py-2 flex items-center justify-center gap-1.5 font-bold">
                      <Plus size={14} /> Agregar Departamento
                    </button>
                  </form>

                  <div className="border border-zinc-100 dark:border-slate-800/50 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto feed-scroll">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-bold border-b border-zinc-100 dark:border-slate-800/50">
                          <th className="p-2.5">Departamento</th>
                          <th className="p-2.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbDepartments.length === 0 ? (
                          <tr>
                            <td colSpan="2" className="p-4 text-center text-zinc-400 dark:text-slate-500">No hay departamentos agregados.</td>
                          </tr>
                        ) : (
                          dbDepartments.map((d) => (
                            <tr key={d.id} className="border-b border-zinc-50 dark:border-slate-800/30 hover:bg-zinc-50/50 dark:hover:bg-slate-800/20 transition duration-150">
                              <td className="p-2.5 text-zinc-800 dark:text-slate-200 font-semibold">{d.name}</td>
                              <td className="p-2.5 text-right">
                                <button 
                                  onClick={() => deleteDepartmentParam(d.id)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/35 transition"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* COLUMN 3: Ciudades */}
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-slate-800/80 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-zinc-800 dark:text-white flex items-center gap-2">
                      <MapPin size={18} className="text-emerald-500" />
                      Ciudades / Sucursales
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">
                      Gestiona la lista predeterminada de ciudades para la ubicación de recursos.
                    </p>
                  </div>
                  
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCityName) return;
                    await saveCityParam(newCityName.trim());
                    setNewCityName('');
                  }} className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Nombre de la Ciudad</label>
                      <input 
                        type="text"
                        className="input w-full text-sm"
                        placeholder="ej: Santiago, Antofagasta..."
                        value={newCityName}
                        onChange={(e) => setNewCityName(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="button primary w-full text-xs py-2 flex items-center justify-center gap-1.5 font-bold">
                      <Plus size={14} /> Agregar Ciudad
                    </button>
                  </form>

                  <div className="border border-zinc-100 dark:border-slate-800/50 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto feed-scroll">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-bold border-b border-zinc-100 dark:border-slate-800/50">
                          <th className="p-2.5">Ciudad</th>
                          <th className="p-2.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbCities.length === 0 ? (
                          <tr>
                            <td colSpan="2" className="p-4 text-center text-zinc-400 dark:text-slate-500">No hay ciudades agregadas.</td>
                          </tr>
                        ) : (
                          dbCities.map((c) => (
                            <tr key={c.id} className="border-b border-zinc-50 dark:border-slate-800/30 hover:bg-zinc-50/50 dark:hover:bg-slate-800/20 transition duration-150">
                              <td className="p-2.5 text-zinc-800 dark:text-slate-200 font-semibold">{c.name}</td>
                              <td className="p-2.5 text-right">
                                <button 
                                  onClick={() => deleteCityParam(c.id)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/35 transition"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : adminSubTab === 'infrastructure' ? (
              <div className="space-y-4 w-full">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-md">
                    <input
                      className="input pr-10"
                      placeholder="Buscar switch, módem o ubicación..."
                      value={infraFilter}
                      onChange={(e) => setInfraFilter(e.target.value)}
                    />
                    <Search className="absolute right-3 top-2.5 text-zinc-400" size={18} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                    <button
                      className="button secondary text-xs flex flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 font-bold rounded-xl"
                      onClick={() => downloadInfraExcel()}
                      title="Exportar a Excel"
                    >
                      <FileDown size={15} /> Excel
                    </button>
                    <button
                      className="button secondary text-xs flex flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 font-bold rounded-xl"
                      onClick={() => printInfraPDF()}
                      title="Imprimir reporte en PDF"
                    >
                      <Printer size={15} /> PDF
                    </button>
                    <button
                      className="button secondary text-xs flex flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 font-bold rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 hover:bg-violet-500/20"
                      onClick={() => setShowTopologyMap(true)}
                      title="Ver Diagrama de Flujo / Topología de Red"
                    >
                      <Network size={15} className="text-violet-500" /> Topología
                    </button>
                    <button
                      className="button primary text-xs flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 font-bold rounded-xl"
                      onClick={() => setInfraModal({ mode: 'create', form: { type: 'Switch', brand: '', model: '', serial_number: '', ports_count: 24, location: 'Matta', status: 'nuevo', acquired_at: new Date().toISOString().split('T')[0], notes: '', mac: '', floor: '1', ip: '', city: 'Antofagasta' } })}
                    >
                      <Plus size={16} /> Agregar Infraestructura
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden border border-zinc-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-slate-900">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-semibold">
                          <th className="py-3.5 px-4">Tipo</th>
                          <th className="py-3.5 px-4">Marca / Modelo</th>
                          <th className="py-3.5 px-4">N° Serie</th>
                          <th className="py-3.5 px-4">Dirección IP</th>
                          <th className="py-3.5 px-4">Dirección MAC</th>
                          <th className="py-3.5 px-4">Bocas / Puertos</th>
                          <th className="py-3.5 px-4">Ubicación</th>
                          <th className="py-3.5 px-4">Piso</th>
                          <th className="py-3.5 px-4">Estado</th>
                          <th className="py-3.5 px-4">Fecha Ingreso</th>
                          <th className="py-3.5 px-4">Observaciones</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const query = infraFilter.toLowerCase();
                          const filtered = infrastructure.filter(i => {
                            return (i.brand || '').toLowerCase().includes(query) ||
                                   (i.model || '').toLowerCase().includes(query) ||
                                   (i.serial_number || '').toLowerCase().includes(query) ||
                                   (i.location || '').toLowerCase().includes(query) ||
                                   (i.mac || '').toLowerCase().includes(query) ||
                                   (i.floor || '').toLowerCase().includes(query) ||
                                   (i.ip || '').toLowerCase().includes(query) ||
                                   (i.city || '').toLowerCase().includes(query) ||
                                   (i.notes || '').toLowerCase().includes(query);
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan="12" className="py-8 text-center text-zinc-500 dark:text-slate-400 font-semibold">
                                  No se encontraron elementos de infraestructura.
                                </td>
                              </tr>
                            );
                          }

                          // Group by city using getInfraGroup to separate subnets and locations
                          const grouped = {};
                          filtered.forEach(item => {
                            const c = getInfraGroup(item);
                            if (!grouped[c]) grouped[c] = [];
                            grouped[c].push(item);
                          });

                          return Object.keys(grouped).sort().map(city => (
                            <React.Fragment key={city}>
                              <tr className="bg-zinc-100/70 dark:bg-slate-800/40 border-b border-zinc-200 dark:border-slate-800/60 select-none">
                                <td colSpan="12" className="py-2 px-4">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                      📍 Ciudad: {city}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); downloadInfraExcel(city); }}
                                        title={`Exportar ${city} a Excel`}
                                      >
                                        <FileDown size={12} /> Excel
                                      </button>
                                      <button
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); printInfraPDF(city); }}
                                        title={`Imprimir PDF de ${city}`}
                                      >
                                        <Printer size={12} /> PDF
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              {grouped[city].map((item) => (
                                <tr
                                  key={item.id}
                                  className="border-b border-zinc-100 dark:border-slate-800/50 hover:bg-zinc-50/50 dark:hover:bg-slate-800/30 transition duration-150 cursor-pointer"
                                  onClick={() => setInfraModal({ mode: 'edit', form: item })}
                                >
                                  <td className="py-3 px-4 font-semibold text-zinc-950 dark:text-white">
                                    <div className="flex items-center">
                                      {item.type === 'Switch' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 text-xs font-bold shadow-sm">
                                          <Network size={13} className="text-sky-500" />
                                          <span>Switch</span>
                                        </div>
                                      ) : item.type === 'Switch Genérico' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold shadow-sm">
                                          <Network size={13} className="text-amber-500" />
                                          <span>Switch Genérico</span>
                                        </div>
                                      ) : item.type === 'Fortinet' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 text-xs font-bold shadow-sm">
                                          <Shield size={13} className="text-orange-500" />
                                          <span>Fortinet</span>
                                        </div>
                                      ) : item.type === 'Router' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 text-xs font-bold shadow-sm">
                                          <Server size={13} className="text-violet-500" />
                                          <span>Router</span>
                                        </div>
                                      ) : item.type === 'Conversor' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 text-xs font-bold shadow-sm">
                                          <Cable size={13} className="text-pink-500" />
                                          <span>Conversor</span>
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold shadow-sm">
                                          <Router size={13} className="text-emerald-500" />
                                          <span>Módem</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-semibold">
                                    {item.brand} {item.model}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs">
                                    {item.serial_number || '—'}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs">
                                    {item.ip || '—'}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs">
                                    {item.mac || '—'}
                                  </td>
                                  <td className="py-3 px-4">
                                    {item.ports_count !== null && item.ports_count !== undefined
                                      ? `${item.ports_count} ${
                                          item.type === 'Switch' || item.type === 'Switch Genérico' ? 'Bocas' :
                                          item.type === 'Fortinet' ? 'Int.' :
                                          item.type === 'Router' ? 'Int.' :
                                          item.type === 'Conversor' ? 'Int.' :
                                          'Bocas LAN'
                                        }`
                                      : '—'}
                                  </td>
                                  <td className="py-3 px-4">
                                    {item.location}
                                  </td>
                                  <td className="py-3 px-4 font-medium">
                                    {item.floor ? `Piso ${item.floor}` : '—'}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                                      item.status === 'nuevo'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                                        : item.status === 'usado'
                                        ? 'bg-amber-100 text-amber-850 dark:bg-amber-500/10 dark:text-amber-350'
                                        : item.status === 'apagado'
                                        ? 'bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-400'
                                        : 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400'
                                    }`}>
                                      {item.status || 'usado'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-xs font-mono">
                                    {item.acquired_at ? new Date(item.acquired_at).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="py-3 px-4 text-xs max-w-[150px] truncate text-zinc-500 dark:text-slate-400 font-normal" title={item.notes}>
                                    {item.notes || '—'}
                                  </td>
                                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-2">
                                      {(item.type === 'Switch' || item.type === 'Switch Genérico' || item.type === 'Fortinet' || item.type === 'Modem' || item.type === 'Router' || item.type === 'Conversor') && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setActiveSwitchForPorts(item); }}
                                          className={`button primary py-1 px-2.5 text-xs flex items-center gap-1 border-0 whitespace-nowrap ${
                                            item.type === 'Fortinet'
                                              ? 'bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-500 hover:to-red-600'
                                              : item.type === 'Modem'
                                              ? 'bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600'
                                              : item.type === 'Router'
                                              ? 'bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600'
                                              : item.type === 'Conversor'
                                              ? 'bg-gradient-to-r from-pink-600 to-fuchsia-700 hover:from-pink-500 hover:to-fuchsia-600'
                                              : item.type === 'Switch Genérico'
                                              ? 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-extrabold'
                                              : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600'
                                          }`}
                                        >
                                          <Network size={12} /> {
                                            item.type === 'Fortinet' ? 'Interfaces' :
                                            item.type === 'Router' ? 'Interfaces' :
                                            item.type === 'Conversor' ? 'Interfaces' :
                                            item.type === 'Modem' ? 'Bocas' :
                                            'Puertos'
                                          }
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setInfraModal({ mode: 'edit', form: item })}
                                        className="button secondary py-1 px-2.5 text-xs hover:border-emerald-500"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => deleteInfrastructure(item.id)}
                                        className="button py-1 px-2.5 text-xs text-red-500 border-red-200 dark:border-red-900/30 hover:border-red-500"
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Infrastructure Edit/Create Modal */}
                {infraModal && (
                  <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-zinc-950 dark:text-slate-100">
                      <h3 className="text-lg font-bold flex items-center gap-2 mb-5">
                        <Boxes size={20} className="text-emerald-500" />
                        {infraModal.mode === 'create' ? 'Agregar Infraestructura' : 'Editar Elemento'}
                      </h3>
                      <form onSubmit={(e) => { e.preventDefault(); saveInfrastructure(infraModal.form); }} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Tipo de Elemento</label>
                            <select
                              className="input w-full"
                              value={infraModal.form.type}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, type: e.target.value } })}
                              required
                            >
                              <option value="Switch">Switch Administrable</option>
                              <option value="Switch Genérico">Switch Genérico (No Administrable)</option>
                              <option value="Modem">Módem</option>
                              <option value="Fortinet">Fortinet / Firewall</option>
                              <option value="Router">Router</option>
                              <option value="Conversor">Conversor</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Estado</label>
                            <select
                              className="input w-full"
                              value={infraModal.form.status}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, status: e.target.value } })}
                              required
                            >
                              <option value="nuevo">Nuevo</option>
                              <option value="usado">Usado</option>
                              <option value="apagado">Apagado</option>
                              <option value="malo">Malo</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Marca</label>
                            <input
                              className="input w-full"
                              placeholder="ej. Cisco, HP, Dell"
                              value={infraModal.form.brand}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, brand: e.target.value } })}
                              required
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Modelo</label>
                            <input
                              className="input w-full"
                              placeholder="ej. Catalyst 2960"
                              value={infraModal.form.model}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, model: e.target.value } })}
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Número de Serie</label>
                            <input
                              className="input w-full"
                              placeholder="N° de Serie"
                              value={infraModal.form.serial_number}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, serial_number: e.target.value } })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Ubicación</label>
                            <input
                              className="input w-full"
                              placeholder="ej. Oficina TI, Sala 2"
                              value={infraModal.form.location}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, location: e.target.value } })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">
                              {infraModal.form.type === 'Modem' ? 'Bocas LAN' : 'Bocas / Interfaces'}
                            </label>
                            <input
                              className="input w-full"
                              type="number"
                              placeholder={
                                infraModal.form.type === 'Fortinet' ? '11 (Por defecto)' :
                                infraModal.form.type === 'Router' ? '4 (Por defecto)' :
                                infraModal.form.type === 'Conversor' ? '3 (Por defecto)' :
                                'ej. 24, 48'
                              }
                              value={infraModal.form.ports_count || ''}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, ports_count: parseInt(e.target.value, 10) || 0 } })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Fecha Ingreso</label>
                            <input
                              className="input w-full"
                              type="date"
                              value={infraModal.form.acquired_at ? infraModal.form.acquired_at.split('T')[0] : ''}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, acquired_at: e.target.value } })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Dirección IP</label>
                            <input
                              className="input w-full"
                              list="existing-ips"
                              placeholder="ej. 172.30.100.10"
                              value={infraModal.form.ip || ''}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, ip: e.target.value } })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Dirección MAC</label>
                            <input
                              className="input w-full"
                              placeholder="ej. AA:BB:CC:DD:EE:FF"
                              value={infraModal.form.mac || ''}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, mac: formatMAC(e.target.value, infraModal.form.mac) } })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Piso</label>
                            <select
                              className="input w-full"
                              value={infraModal.form.floor || '1'}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, floor: e.target.value } })}
                            >
                              <option value="1">Piso 1</option>
                              <option value="2">Piso 2</option>
                              <option value="3">Piso 3</option>
                              <option value="Ninguno">Ninguno / Otro</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Ciudad</label>
                            <select
                              className="input w-full"
                              value={infraModal.form.city || 'Antofagasta'}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, city: e.target.value } })}
                              required
                            >
                              {Array.from(new Set([...existingCities, 'Antofagasta', infraModal.form.city].filter(Boolean))).sort().map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Observaciones</label>
                          <textarea
                            className="input w-full min-h-16"
                            placeholder="Detalles adicionales..."
                            value={infraModal.form.notes}
                            onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, notes: e.target.value } })}
                          />
                        </div>

                         <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-slate-800">
                          <button type="button" className="button secondary" onClick={() => setInfraModal(null)} disabled={savingInfra}>
                            Cancelar
                          </button>
                          <button type="submit" className="button primary flex items-center gap-1.5" disabled={savingInfra}>
                            {savingInfra ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                            {savingInfra ? 'Guardando...' : (infraModal.mode === 'create' ? 'Agregar Elemento' : 'Guardar Cambios')}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-zinc-500">Subpestaña no configurada.</div>
            )}
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div
          className="toast-counter"
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            zIndex: 999999
          }}
        >
          🔔 {toasts.length}
        </div>
      )}

      {/* Modern floating toasts */}
      <div
        className="fixed top-20 right-6 z-[999999] flex flex-col gap-3 pointer-events-none"
        style={{ width: '340px' }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            title="Hacer clic para cerrar"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 font-semibold text-white pointer-events-auto border-l-4 cursor-pointer hover:scale-[1.02] ${
              toast.type === 'offline'
                ? 'bg-gradient-to-r from-red-600 to-rose-700 border-red-400'
                : 'bg-gradient-to-r from-emerald-600 to-teal-700 border-emerald-400'
            }`}
          >
            <div className="rounded-full bg-white/10 p-1.5 flex-shrink-0">
              {toast.type === 'offline' ? <WifiOff size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-tight font-bold">{toast.text}</p>
              <span className="text-[9px] opacity-75 font-normal block mt-0.5">Alerta RMM en tiempo real</span>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <DeviceDrawer
          key={selected.id}
          device={selected}
          employees={employees}
          infrastructure={infrastructure}
          token={token}
          user={user}
          onClose={() => setSelected(null)}
          onSaved={loadData}
          onConnectRdp={() => connectRdp(selected)}
          existingCities={existingCities}
          existingDepartments={existingDepartments}
          useLocalApi={useLocalApi}
          setEmployeeModal={setEmployeeModal}
          setFirebaseQuotaExceeded={setFirebaseQuotaExceeded}
          existingCpus={existingCpus}
          existingRams={existingRams}
          existingStorages={existingStorages}
          existingGpus={existingGpus}
          existingMotherboards={existingMotherboards}
        />
      )}

      {activeSwitchForPorts && (
        <SwitchPortMapModal
          activeSwitch={activeSwitchForPorts}
          onClose={() => setActiveSwitchForPorts(null)}
          devices={devices}
          infrastructure={infrastructure}
          token={token}
          user={user}
          useLocalApi={useLocalApi}
          onSaved={loadData}
          onOpenDeviceDrawer={(device) => {
            setSelected(device);
          }}
        />
      )}

      {showTopologyMap && (
        <TopologyMapModal
          isOpen={showTopologyMap}
          onClose={() => setShowTopologyMap(false)}
          infrastructure={infrastructure}
          devices={devices}
          setActiveSwitchForPorts={setActiveSwitchForPorts}
        />
      )}

      {/* Modal de Resultados de Importación JSON */}
      {importResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-zinc-950 dark:text-slate-100 overflow-hidden transition-all duration-300">
            <div className="flex items-center justify-between border-b border-zinc-150 dark:border-slate-800/80 px-6 py-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                Resultado de la Importación JSON
              </h3>
              <button 
                onClick={() => setImportResultModal(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 max-h-[500px] overflow-y-auto space-y-5 feed-scroll">
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-250/20 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{importResultModal.success.length}</div>
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300/80 uppercase tracking-wider mt-1">Exitosos</div>
                </div>
                <div className={`rounded-xl p-4 text-center border ${
                  importResultModal.failed.length > 0
                    ? 'bg-red-50/50 dark:bg-red-950/10 border-red-250/20'
                    : 'bg-zinc-50 dark:bg-slate-800/30 border-zinc-200 dark:border-slate-800'
                }`}>
                  <div className={`text-2xl font-black ${importResultModal.failed.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-slate-400'}`}>
                    {importResultModal.failed.length}
                  </div>
                  <div className="text-xs font-bold text-zinc-550 dark:text-slate-400 uppercase tracking-wider mt-1">Fallidos</div>
                </div>
              </div>

              {/* Lista exitosos */}
              {importResultModal.success.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Equipos Importados/Actualizados</h4>
                  <div className="border border-zinc-100 dark:border-slate-800/50 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-slate-900/30 text-zinc-500 dark:text-slate-400 font-bold border-b border-zinc-100 dark:border-slate-800/50">
                          <th className="p-2.5">Hostname</th>
                          <th className="p-2.5">Dirección IP</th>
                          <th className="p-2.5">Archivo Origen</th>
                          <th className="p-2.5 text-right">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResultModal.success.map((item, idx) => (
                          <tr key={idx} className="border-b border-zinc-50 dark:border-slate-850 hover:bg-zinc-50/40 dark:hover:bg-slate-800/10 transition">
                            <td className="p-2.5 text-zinc-800 dark:text-slate-200 font-bold">{item.hostname}</td>
                            <td className="p-2.5 font-mono text-zinc-600 dark:text-slate-400">{item.ip}</td>
                            <td className="p-2.5 text-zinc-500 dark:text-slate-500 italic max-w-[150px] truncate" title={item.fileName}>{item.fileName}</td>
                            <td className="p-2.5 text-right font-medium">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.isSkip 
                                  ? 'bg-zinc-100 text-zinc-800 dark:bg-slate-800 dark:text-slate-350'
                                  : item.isUpdate 
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400' 
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                              }`}>
                                {item.statusText}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lista fallidos */}
              {importResultModal.failed.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block">Fichas con Errores</h4>
                  <div className="border border-red-100/50 dark:border-red-950/20 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-red-50/20 dark:bg-red-950/5 text-red-500 dark:text-red-400 font-bold border-b border-red-100/30 dark:border-red-950/20">
                          <th className="p-2.5">Archivo</th>
                          <th className="p-2.5">Razón del Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResultModal.failed.map((item, idx) => (
                          <tr key={idx} className="border-b border-red-50/10 dark:border-red-950/5 hover:bg-red-500/5 transition">
                            <td className="p-2.5 text-zinc-800 dark:text-slate-200 font-semibold">{item.fileName}</td>
                            <td className="p-2.5 text-red-500 dark:text-red-400">{item.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-zinc-50 dark:bg-slate-900/50 border-t border-zinc-150 dark:border-slate-800 px-6 py-4 flex justify-end">
              <button 
                onClick={() => setImportResultModal(null)}
                className="button primary px-5 font-bold text-xs py-2"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {employeeModal && (
        <EmployeeModalDialog
          key={employeeModal.mode + '_' + (employeeModal.form.id || 'new')}
          employeeModal={employeeModal}
          setEmployeeModal={setEmployeeModal}
          existingCities={existingCities}
          existingDepartments={existingDepartments}
          devices={devices}
          employees={employees}
          token={token}
          useLocalApi={useLocalApi}
          saveEmployee={saveEmployee}
          unlinkDevice={unlinkDevice}
          linkDevice={linkDevice}
          setSelected={(dev) => {
            setSelected(dev);
            setEmployeeModal(null);
          }}
        />
      )}

      {/* Device Modal (Ficha de Equipo Inventario) */}
      {deviceModal && (
        <DeviceModalDialog
          deviceModal={deviceModal}
          setDeviceModal={setDeviceModal}
          employees={employees}
          saveDevice={saveDevice}
          existingCities={existingCities}
          existingDepartments={existingDepartments}
          setEmployeeModal={setEmployeeModal}
          existingCpus={existingCpus}
          existingRams={existingRams}
          existingStorages={existingStorages}
          existingGpus={existingGpus}
          existingMotherboards={existingMotherboards}
          infrastructure={infrastructure}
        />
      )}

      {/* Datalists suggestion elements */}
      <datalist id="cities-list">
        {existingCities.map(c => <option key={c} value={c} />)}
      </datalist>
      <datalist id="departments-list">
        {existingDepartments.map(d => <option key={d} value={d} />)}
      </datalist>
      <datalist id="cpus-list">
        {existingCpus.map(c => <option key={c} value={c} />)}
      </datalist>
      <datalist id="rams-list">
        {existingRams.map(r => <option key={r} value={r} />)}
      </datalist>
      <datalist id="storages-list">
        {existingStorages.map(s => <option key={s} value={s} />)}
      </datalist>
      <datalist id="gpus-list">
        {existingGpus.map(g => <option key={g} value={g} />)}
      </datalist>
      <datalist id="motherboards-list">
        {existingMotherboards.map(m => <option key={m} value={m} />)}
      </datalist>
    </main>
  );
}

// Sub-component for DeviceModalDialog (creation/editing manually) to keep code structured
function DeviceModalDialog({
  deviceModal,
  setDeviceModal,
  employees,
  saveDevice,
  existingCities = [],
  existingDepartments = [],
  setEmployeeModal,
  existingCpus = [],
  existingRams = [],
  existingStorages = [],
  existingGpus = [],
  existingMotherboards = [],
  infrastructure = []
}) {
  const [form, setForm] = useState(deviceModal.form);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [showEmployeeSearchList, setShowEmployeeSearchList] = useState(false);
  
  // Locations management
  const predefinedLocations = ['Matta', 'Diario', 'Casa'];
  const isCustomLocation = form.location && !predefinedLocations.includes(form.location);
  const [locationType, setLocationType] = useState(isCustomLocation ? 'Otro' : (form.location || 'Matta'));

  // Custom states for selects + manually entered inputs
  const [cityType, setCityType] = useState(form.city && !existingCities.includes(form.city) ? 'Otro' : (form.city || ''));
  const [deptType, setDeptType] = useState(form.department && !existingDepartments.includes(form.department) ? 'Otro' : (form.department || ''));
  const [cpuType, setCpuType] = useState(form.cpu && !existingCpus.includes(form.cpu) ? 'Otro' : (form.cpu || ''));
  const [ramType, setRamType] = useState(form.ram && !existingRams.includes(form.ram) ? 'Otro' : (form.ram || ''));
  const [storageType, setStorageType] = useState(form.storage && !existingStorages.includes(form.storage) ? 'Otro' : (form.storage || ''));
  const [gpuType, setGpuType] = useState(form.gpu && !existingGpus.includes(form.gpu) ? 'Otro' : (form.gpu || ''));
  const [mbType, setMbType] = useState(form.motherboard && !existingMotherboards.includes(form.motherboard) ? 'Otro' : (form.motherboard || ''));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-hidden">
      <div className="w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-xl rounded-none sm:rounded-2xl border-0 sm:border border-zinc-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-zinc-900 dark:text-slate-100 overflow-hidden flex flex-col justify-between my-0 sm:my-8 transition-all duration-300">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2 leading-tight">
              <Laptop className="text-emerald-500" size={20} />
              {deviceModal.mode === 'create' ? 'Registrar Equipo Manual' : 'Ficha de Equipo'}
            </h3>
            {deviceModal.mode === 'edit' && (
              <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1 font-mono">
                IP: {form.ip} · MAC: {form.mac || 'No detectada'} · OS: {form.os || 'No identificado'}
              </p>
            )}
          </div>
          <button className="text-2xl text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-200" onClick={() => setDeviceModal(null)}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 xs:p-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{form.ip_type === 'dynamic' ? 'Dirección IP (Opcional)' : 'Dirección IP *'}</span>
            <input
              className="input"
              list="existing-ips"
              disabled={deviceModal.mode === 'edit'}
              value={form.ip || ''}
              onChange={(e) => {
                const newIp = e.target.value;
                const ipParts = newIp.split('.');
                let autoCity = form.city;
                let autoBranch = form.branch;
                if (ipParts.length >= 3) {
                  const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24`;
                  // Basándonos en mapeo de subredes del sistema
                  if (subnet === '172.30.100.0/24') {
                    autoCity = 'Antofagasta';
                    autoBranch = 'Rendic';
                  } else if (subnet === '172.30.101.0/24') {
                    autoCity = 'Antofagasta';
                    autoBranch = 'Matta';
                  } else if (subnet === '172.30.102.0/24') {
                    autoCity = 'Antofagasta';
                    autoBranch = 'Diario';
                  } else if (subnet === '172.30.110.0/24') {
                    autoCity = 'Arica';
                    autoBranch = 'Arica';
                  } else if (subnet === '172.30.112.0/24') {
                    autoCity = 'Iquique';
                    autoBranch = 'Iquique';
                  }
                }
                setForm({ ...form, ip: newIp, city: autoCity, branch: autoBranch });
              }}
              placeholder={form.ip_type === 'dynamic' ? 'Dejar vacío si no se conoce' : 'ej. 172.30.100.15'}
            />
            {deviceModal.mode !== 'edit' && (
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase text-zinc-500 dark:text-slate-400">
                  <input
                    type="radio"
                    name="ip_type"
                    value="static"
                    checked={form.ip_type !== 'dynamic'}
                    onChange={() => setForm({ ...form, ip_type: 'static' })}
                    className="rounded-full border-zinc-300 text-emerald-500 focus:ring-emerald-500 h-3 w-3"
                  />
                  <span>IP Estática</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase text-zinc-500 dark:text-slate-400">
                  <input
                    type="radio"
                    name="ip_type"
                    value="dynamic"
                    checked={form.ip_type === 'dynamic'}
                    onChange={() => setForm({ ...form, ip_type: 'dynamic', ip: '' })}
                    className="rounded-full border-zinc-300 text-emerald-500 focus:ring-emerald-500 h-3 w-3"
                  />
                  <span>IP Dinámica (DHCP)</span>
                </label>
              </div>
            )}
          </label>
          <label className="block">
            <span className="label">Nombre Equipo (Hostname)</span>
            <input
              className="input"
              value={form.hostname || ''}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="ej. PC-FINANZAS-01"
            />
          </label>

          <label className="block bg-zinc-50 dark:bg-slate-950 p-3 rounded-lg border border-dashed border-zinc-300 dark:border-slate-800 sm:col-span-2">
            <span className="label mb-2 flex items-center gap-1.5">
              <Upload size={14} className="text-emerald-500" />
              Foto del Equipo (Subir archivo o pegar URL)
            </span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {form.image_url ? (
                <div className="relative w-24 h-16 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex-shrink-0">
                  <img src={form.image_url} alt="Vista previa del equipo" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, image_url: '' })}
                    className="absolute inset-0 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-[10px] font-bold transition duration-150"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="w-24 h-16 rounded bg-zinc-100 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-slate-500">
                  <Laptop size={24} />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs text-zinc-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400 file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setForm({ ...form, image_url: reader.result });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <input
                  className="input text-xs py-1"
                  placeholder="O pega una URL directa de la imagen..."
                  value={form.image_url || ''}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </div>
            </div>
          </label>

          <label className="block">
            <span className="label">Categoría / Tipo de Equipo</span>
            <select
              className="input"
              value={form.device_type || 'PC'}
              onChange={(e) => setForm({ ...form, device_type: e.target.value })}
            >
              <option value="PC">PC de Escritorio</option>
              <option value="Notebook">Notebook (Laptop)</option>
              <option value="All in One">All in One</option>
              <option value="Servidor">Servidor</option>
              <option value="Otro">Otro</option>
            </select>
          </label>

          <label className="block">
            <span className="label">Ubicación / Sala</span>
            <select
              className="input"
              value={locationType}
              onChange={(e) => {
                const val = e.target.value;
                setLocationType(val);
                if (val !== 'Otro') {
                  setForm({ ...form, location: val });
                }
              }}
            >
              <option value="Matta">Matta</option>
              <option value="Diario">Diario</option>
              <option value="Casa">Casa</option>
              <option value="Otro">Otro lugar...</option>
            </select>
            {locationType === 'Otro' && (
              <input
                className="input mt-2"
                placeholder="Escribe la ubicación..."
                value={form.location || ''}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            )}
          </label>

          <label className="block">
            <span className="label">Dirección MAC</span>
            <input
              className="input"
              value={form.mac || ''}
              onChange={(e) => setForm({ ...form, mac: formatMAC(e.target.value, form.mac) })}
              placeholder="ej. AA:BB:CC:DD:EE:FF"
            />
          </label>
          <label className="block">
            <span className="label">Sistema Operativo</span>
            <input
              className="input"
              value={form.os || ''}
              onChange={(e) => setForm({ ...form, os: e.target.value })}
              placeholder="ej. Windows 11 Pro"
            />
          </label>

          <label className="block">
            <span className="label">Versión de Office</span>
            <input
              className="input"
              value={form.office || ''}
              onChange={(e) => setForm({ ...form, office: e.target.value })}
              placeholder="ej. Office LTSC 2021 / 365"
            />
          </label>

          <label className="block">
            <span className="label">Antivirus</span>
            <input
              className="input"
              value={form.antivirus || ''}
              onChange={(e) => setForm({ ...form, antivirus: e.target.value })}
              placeholder="ej. Windows Defender / Kaspersky"
            />
          </label>
          
          <div className="block relative">
            <div className="flex justify-between items-center mb-1">
              <span className="label mb-0">Responsable Asignado</span>
              <button
                type="button"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                onClick={() => {
                  setEmployeeModal({
                    mode: 'create',
                    form: {
                      full_name: '', email: '', phone: '', job_title: '', department: form.department || '', city: form.city || '', authorized_systems: '', active: true, vpn_active: false, workplace: 'Presencial'
                    }
                  });
                }}
              >
                + Agregar nuevo empleado
              </button>
            </div>
            
            <div className="relative">
              {!showEmployeeSearchList ? (
                <button
                  type="button"
                  className="input text-left py-2 px-3 text-xs w-full flex justify-between items-center bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-800 rounded-lg text-zinc-700 dark:text-slate-350"
                  onClick={() => {
                    setShowEmployeeSearchList(true);
                    setEmployeeSearchText('');
                  }}
                >
                  <span>{form.responsible_user || 'Sin responsable (Haz clic para asignar)'}</span>
                  <span className="text-zinc-400 text-[10px]">▼</span>
                </button>
              ) : (
                <div className="absolute top-0 left-0 right-0 z-[60] border border-zinc-200 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-xl space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Buscar empleado..."
                      className="input py-1 px-2 text-xs flex-1"
                      value={employeeSearchText}
                      onChange={(e) => setEmployeeSearchText(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="button secondary py-1 px-2 text-xs font-bold"
                      onClick={() => setShowEmployeeSearchList(false)}
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-zinc-200/50 dark:divide-slate-800/50 text-[11px] border border-zinc-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                    <button
                      type="button"
                      className="w-full text-left p-2 hover:bg-zinc-50 dark:hover:bg-slate-800/40 font-bold text-red-500 block"
                      onClick={() => {
                        setForm({
                          ...form,
                          employee_id: null,
                          responsible_user: '',
                          email: '',
                          department: '',
                          city: '',
                          phone: '',
                          job_title: ''
                        });
                        setShowEmployeeSearchList(false);
                      }}
                    >
                      Sin responsable (Desasignar)
                    </button>
                    {employees
                      .filter(emp => {
                        const q = employeeSearchText.toLowerCase();
                        return (
                          (emp.full_name || '').toLowerCase().includes(q) ||
                          (emp.department || '').toLowerCase().includes(q) ||
                          (emp.email || '').toLowerCase().includes(q)
                        );
                      })
                      .map(emp => (
                        <button
                          key={emp.id}
                          type="button"
                          className="w-full text-left p-2 hover:bg-zinc-50 dark:hover:bg-slate-800/40 font-semibold block text-zinc-800 dark:text-slate-200"
                          onClick={() => {
                            setForm({
                              ...form,
                              employee_id: emp.id,
                              responsible_user: emp.full_name,
                              email: emp.email || '',
                              department: emp.department || '',
                              city: emp.city || '',
                              phone: emp.phone || '',
                              job_title: emp.job_title || ''
                            });
                            setShowEmployeeSearchList(false);
                          }}
                        >
                          <span className="font-bold text-zinc-950 dark:text-white">{emp.full_name}</span> - {emp.department}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <label className="block">
            <span className="label">Correo Electrónico</span>
            <input
              className="input"
              type="email"
              list="existing-emails"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Cargo</span>
            <input
              className="input"
              value={form.job_title || ''}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Teléfono</span>
            <input
              className="input"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Ciudad</span>
            <select
              className="input"
              value={cityType}
              onChange={(e) => {
                const val = e.target.value;
                setCityType(val);
                if (val !== 'Otro') {
                  setForm({ ...form, city: val });
                }
              }}
            >
              <option value="">-- Seleccionar Ciudad --</option>
              {existingCities.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Otro">Otro (Escribir manual)...</option>
            </select>
            {cityType === 'Otro' && (
              <input
                className="input mt-2 animate-in fade-in duration-200"
                placeholder="Escribe la ciudad..."
                value={form.city || ''}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            )}
          </label>
          <label className="block">
            <span className="label">Sucursal</span>
            <input
              className="input"
              value={form.branch || ''}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Departamento</span>
            <select
              className="input"
              value={deptType}
              onChange={(e) => {
                const val = e.target.value;
                setDeptType(val);
                if (val !== 'Otro') {
                  setForm({ ...form, department: val });
                }
              }}
            >
              <option value="">-- Seleccionar Departamento --</option>
              {existingDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="Otro">Otro (Escribir manual)...</option>
            </select>
            {deptType === 'Otro' && (
              <input
                className="input mt-2 animate-in fade-in duration-200"
                placeholder="Escribe el departamento..."
                value={form.department || ''}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            )}
          </label>
          <label className="block">
            <span className="label">Estado Activo</span>
            <select
              className="input"
              value={form.asset_status || 'active'}
              onChange={(e) => setForm({ ...form, asset_status: e.target.value })}
            >
              <option value="active">Activo</option>
              <option value="retired">Retirado / De baja</option>
              <option value="maintenance">Mantenimiento</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Marca</span>
            <input
              className="input"
              value={form.brand || ''}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Modelo</span>
            <input
              className="input"
              value={form.model || ''}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </label>

          {/* Hardware specifications module */}
          <div className="sm:col-span-2 border-t border-zinc-200 dark:border-slate-800 pt-4 mt-2">
            <h4 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-3 flex items-center gap-1.5">
              <Cpu size={14} className="text-emerald-500" />
              Especificaciones de Hardware
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">CPU (Procesador)</span>
                <select
                  className="input"
                  value={cpuType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCpuType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, cpu: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar CPU --</option>
                  {existingCpus.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {cpuType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="ej. Intel Core i5-12400"
                    value={form.cpu || ''}
                    onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                  />
                )}
              </label>
              <label className="block">
                <span className="label">Memoria RAM</span>
                <select
                  className="input"
                  value={ramType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRamType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, ram: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar RAM --</option>
                  {existingRams.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {ramType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="ej. 16GB DDR4"
                    value={form.ram || ''}
                    onChange={(e) => setForm({ ...form, ram: e.target.value })}
                  />
                )}
              </label>
              <label className="block">
                <span className="label">Almacenamiento (Disco)</span>
                <select
                  className="input"
                  value={storageType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStorageType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, storage: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar Almacenamiento --</option>
                  {existingStorages.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {storageType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="ej. 512GB SSD NVMe"
                    value={form.storage || ''}
                    onChange={(e) => setForm({ ...form, storage: e.target.value })}
                  />
                )}
              </label>
              <label className="block">
                <span className="label">Tarjeta de Video (GPU)</span>
                <select
                  className="input"
                  value={gpuType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGpuType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, gpu: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar GPU --</option>
                  {existingGpus.map(g => <option key={g} value={g}>{g}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {gpuType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="ej. NVIDIA GTX 1650"
                    value={form.gpu || ''}
                    onChange={(e) => setForm({ ...form, gpu: e.target.value })}
                  />
                )}
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Placa Madre (Motherboard)</span>
                <select
                  className="input"
                  value={mbType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMbType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, motherboard: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar Motherboard --</option>
                  {existingMotherboards.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {mbType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="ej. Gigabyte H610M"
                    value={form.motherboard || ''}
                    onChange={(e) => setForm({ ...form, motherboard: e.target.value })}
                  />
                )}
              </label>
            </div>
          </div>

          <label className="block sm:col-span-2">
            <span className="label">Número de Serie</span>
            <input
              className="input"
              value={form.serial_number || ''}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
          </label>

          <div className="flex gap-4 sm:col-span-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.critical || false}
                onChange={(e) => setForm({ ...form, critical: e.target.checked })}
                className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
              />
              <span className="text-sm font-semibold">Equipo Crítico</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.managed || false}
                onChange={(e) => setForm({ ...form, managed: e.target.checked })}
                className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
              />
              <span className="text-sm font-semibold">Administrado / Monitoreado</span>
            </label>
          </div>

          {(() => {
            const matchedSwitch = form.switch_id ? infrastructure.find(i => i.id === form.switch_id) : null;
            if (!matchedSwitch) return null;
            return (
              <div className="sm:col-span-2 bg-emerald-50/40 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <Network size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-450 dark:text-slate-500 uppercase tracking-wider">Conexión de Red Física</h4>
                    <p className="text-sm font-extrabold text-zinc-950 dark:text-white mt-0.5">
                      Switch: {matchedSwitch.brand} {matchedSwitch.model}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5 font-medium">
                      Ubicación: {matchedSwitch.location} · Puerto: <strong className="text-emerald-600 dark:text-emerald-400">{getPortName(matchedSwitch.type, matchedSwitch.model, form.switch_port)}</strong>
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <label className="block sm:col-span-2">
            <span className="label">Observaciones</span>
            <textarea
              className="input min-h-20"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="bg-zinc-50 dark:bg-slate-900/50 px-4 xs:px-6 py-4 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800 flex-shrink-0">
          <button className="button secondary" onClick={() => setDeviceModal(null)}>Cancelar</button>
          <button className="button primary" onClick={() => saveDevice(form)}>Guardar Equipo</button>
        </div>
      </div>
    </div>
  );
}

function Stats({ summary }) {
  const items = [
    ['Total', summary.total || 0, <Laptop size={18} />, 'bg-zinc-900 text-white dark:bg-slate-100 dark:text-slate-950'],
    ['Online', summary.online || 0, <CheckCircle2 size={18} />, 'bg-emerald-500 text-slate-950'],
    ['Offline', summary.offline || 0, <WifiOff size={18} />, 'bg-red-500 text-white'],
    ['RDP', summary.rdp || 0, <Cable size={18} />, 'bg-sky-500 text-white']
  ];
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">{items.map(([label, value, icon, color]) => (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-300 hover:shadow-md" key={label}>
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${color} shadow-sm`}>{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-zinc-500 dark:text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
    </div>
  ))}</div>;
}

function Panel({ title, icon, headerAction, children }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-zinc-100 dark:border-slate-800/80 pb-2">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-slate-200 uppercase tracking-wider">{icon}{title}</div>
        {headerAction && <div>{headerAction}</div>}
      </div>
      {children}
    </section>
  );
}

function TerminalConsole({ logs, autoScroll, searchTerm = '' }) {
  const containerRef = useRef(null);
  const term = searchTerm.trim().toLowerCase();

  const filteredLogs = term
    ? logs.filter(log => log.toLowerCase().includes(term))
    : logs;

  useEffect(() => {
    if (autoScroll && !term && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, term]);

  function highlight(text) {
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fbbf24', color: '#000', borderRadius: '2px', padding: '0 2px' }}>
          {text.slice(idx, idx + term.length)}
        </mark>
        {text.slice(idx + term.length)}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-56 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-950 p-3.5 font-mono text-xs text-slate-300 leading-relaxed shadow-inner dark:border-slate-850"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.1) rgba(0,0,0,0.2)'
      }}
    >
      {logs.length === 0 ? (
        <div className="flex h-full items-center justify-center text-slate-500 animate-pulse">
          <span>&gt; Esperando actividad de escaneo del backend local...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex h-full items-center justify-center text-amber-400">
          <span>&gt; Sin resultados para &quot;{searchTerm}&quot;</span>
        </div>
      ) : (
        <div className="space-y-1 text-[11px] md:text-xs">
          {filteredLogs.map((log, idx) => {
            let colorClass = 'text-slate-300';
            if (log.includes('Online')) colorClass = 'text-emerald-400';
            else if (log.includes('Offline') || log.includes('offline')) colorClass = 'text-rose-400';
            else if (log.includes('🔄 CAMBIO:')) colorClass = 'text-amber-400 font-semibold';
            else if (log.includes('⚡ ANOMALÍAS') || log.includes('ANOMALÍA') || log.includes('⚡ UPTIME')) colorClass = 'text-amber-400 font-semibold';
            else if (log.includes('[ERROR]')) colorClass = 'text-rose-500 font-bold';
            else if (log.includes('Scan started') || log.includes('Scan finished')) colorClass = 'text-cyan-400 font-semibold';
            else if (log.includes('Scanning subnet') || log.includes('Finished subnet')) colorClass = 'text-blue-400';

            return (
              <div key={idx} className={`${colorClass} whitespace-pre-wrap break-all`}>
                <span className="text-slate-600 mr-2 select-none">&gt;</span>
                {highlight(log)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device, onOpen, onConnectRdp, getSubnetLabel, infrastructure = [] }) {
  const tone = {
    online: 'border-l-emerald-500',
    offline: 'border-l-red-500',
    slow: 'border-l-amber-400',
    unknown: 'border-l-zinc-400'
  }[device.status] || 'border-l-zinc-400';
  
  const label = getSubnetLabel ? getSubnetLabel(device.subnet) : device.subnet;

  return (
    <article className={`rounded-xl border border-l-4 border-zinc-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 text-left">
          {label && (
            <span className="text-[9px] font-extrabold text-teal-600 dark:text-teal-400 block uppercase tracking-wider mb-1">
              {label}
            </span>
          )}
          <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white" title={device.responsible_user || 'Sin responsable'}>
            {device.responsible_user || 'Sin responsable'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
            {device.ip || 'IP Dinámica'}
            {device.ip_type === 'dynamic' && (
              <span className="px-1.5 py-0.2 text-[8px] font-extrabold uppercase tracking-wider rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">DHCP</span>
            )}
          </p>
          <p className="text-xs text-zinc-400 dark:text-slate-500 font-semibold truncate mt-1">
            Equipo: {device.hostname || 'Equipo sin nombre'}
          </p>
        </button>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {device.managed && <span className="rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide border border-sky-500/20 shadow-sm">Admin</span>}
          {(() => {
            const matchedSwitch = device.switch_id ? infrastructure.find(i => i.id === device.switch_id) : null;
            if (!matchedSwitch) return null;
            const portName = getPortName(matchedSwitch.type, matchedSwitch.model, device.switch_port);
            return (
              <span 
                className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider border border-emerald-500/20 shadow-sm cursor-help whitespace-nowrap"
                title={`Conectado al Switch: ${matchedSwitch.brand} ${matchedSwitch.model} (${matchedSwitch.location})`}
              >
                🔌 {portName}
              </span>
            );
          })()}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-slate-300 border-t border-b border-zinc-100 dark:border-slate-800 py-2">
        <span className="truncate">{device.department || 'Sin departamento'}</span>
        <span className="text-right truncate text-emerald-600 dark:text-emerald-400 font-semibold">{device.location || 'Matta'}</span>
        <div className="pt-0.5"><StatusPill status={device.status} /></div>
        <span className="text-right pt-0.5 font-semibold text-zinc-500 dark:text-slate-400">{device.rdp_available ? 'RDP habilitado' : 'RDP inactivo'}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] font-mono text-zinc-400 dark:text-slate-500">
          Ping: {device.latency_ms ?? '—'} ms
        </span>
        {device.rdp_available && (
          <button
            className="icon-button h-8 w-8 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 shadow-sm"
            title="Conectar por RDP"
            onClick={onConnectRdp}
          >
            <Cable size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

function DeviceDrawer({
  device,
  employees,
  infrastructure = [],
  token,
  user,
  onClose,
  onSaved,
  onConnectRdp,
  existingCities = [],
  existingDepartments = [],
  useLocalApi,
  setEmployeeModal,
  setFirebaseQuotaExceeded,
  existingCpus = [],
  existingRams = [],
  existingStorages = [],
  existingGpus = [],
  existingMotherboards = []
}) {
  const [form, setForm] = useState(device);
  const isAdmin = user?.role === 'Super Administrador' || user?.role === 'Administrador';

  // Custom states for selects + manually entered inputs
  const [cityType, setCityType] = useState(form.city && !existingCities.includes(form.city) ? 'Otro' : (form.city || ''));
  const [deptType, setDeptType] = useState(form.department && !existingDepartments.includes(form.department) ? 'Otro' : (form.department || ''));
  const [cpuType, setCpuType] = useState(form.cpu && !existingCpus.includes(form.cpu) ? 'Otro' : (form.cpu || ''));
  const [ramType, setRamType] = useState(form.ram && !existingRams.includes(form.ram) ? 'Otro' : (form.ram || ''));
  const [storageType, setStorageType] = useState(form.storage && !existingStorages.includes(form.storage) ? 'Otro' : (form.storage || ''));
  const [gpuType, setGpuType] = useState(form.gpu && !existingGpus.includes(form.gpu) ? 'Otro' : (form.gpu || ''));
  const [mbType, setMbType] = useState(form.motherboard && !existingMotherboards.includes(form.motherboard) ? 'Otro' : (form.motherboard || ''));

  async function save() {
    try {
      if (useLocalApi) {
        await fetch(`${API_URL}/api/devices/${device.id}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(form)
        });
      } else {
        await setDoc(doc(db, 'devices', device.id), form);
      }
      onClose();
      void onSaved();
    } catch (err) {
      console.error('Error saving device from drawer:', err);
      if (err.code === 'resource-exhausted' || (err.message && (err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('exhausted')))) {
        if (setFirebaseQuotaExceeded) setFirebaseQuotaExceeded(true);
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            console.log('Firebase quota exceeded in drawer save, attempting local API fallback...');
            await fetch(`${API_URL}/api/devices/${device.id}`, {
              method: 'PATCH',
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify(form)
            });
            onClose();
            void onSaved();
            return;
          } catch (localErr) {
            console.error('Local API fallback save from drawer failed:', localErr);
          }
        }
      }
      alert('Error al guardar: ' + err.message);
    }
  }

  async function action(name) {
    try {
      if (useLocalApi) {
        const response = await fetch(`${API_URL}/api/devices/${device.id}/actions/${name}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({})
        });
        if (response.ok) {
          alert(`Acción remota '${name}' enviada con éxito localmente.`);
        }
      } else {
        const actionId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await setDoc(doc(db, 'actions', actionId), {
          device_id: device.id,
          action: name,
          status: 'queued',
          createdAt: new Date().toISOString()
        });
        alert(`Acción remota '${name}' encolada con éxito en Firestore.`);
      }
    } catch (err) {
      console.error('Error executing action:', err);
      alert('Error al ejecutar acción: ' + err.message);
    }
  }

  const handleEmployeeChange = (selectedId) => {
    const emp = employees.find(e => String(e.id) === String(selectedId));
    if (!emp) {
      setForm(prev => ({
        ...prev,
        employee_id: null,
        responsible_user: '',
        email: '',
        department: '',
        city: '',
        phone: '',
        job_title: ''
      }));
    } else {
      setForm(prev => ({
        ...prev,
        employee_id: emp.id,
        responsible_user: emp.full_name,
        email: emp.email || '',
        department: emp.department || '',
        city: emp.city || '',
        phone: emp.phone || '',
        job_title: emp.job_title || ''
      }));
    }
  };

  const predefinedLocations = ['Matta', 'Diario', 'Casa'];
  const isCustomLocation = form.location && !predefinedLocations.includes(form.location);
  const [locationType, setLocationType] = useState(isCustomLocation ? 'Otro' : (form.location || 'Matta'));

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-sm flex justify-end items-end sm:items-stretch">
      <aside className="h-[100dvh] sm:h-full w-full max-w-xl bg-white shadow-2xl dark:bg-slate-900 border-0 sm:border-l border-zinc-200 dark:border-slate-800 transition-all duration-300 flex flex-col justify-between overflow-hidden">
        {/* Fixed Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 dark:border-slate-800 p-4 xs:p-6 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-950 dark:text-white">
              <Laptop className="text-emerald-500" size={22} />
              {form.hostname || form.ip || 'Equipo sin nombre'}
              {form.ip_type === 'dynamic' && (
                <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 ml-2">DHCP</span>
              )}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1 font-mono">{form.ip || 'IP Dinámica'} · {form.mac || 'MAC no detectada'} · {form.os || 'SO no identificado'}</p>
          </div>
          <button className="text-2xl text-zinc-400 hover:text-zinc-650 dark:hover:text-slate-200 font-semibold px-2" onClick={onClose}>×</button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 xs:p-6 space-y-6">
          {/* Device Image Section */}
        <div className="mt-4 bg-zinc-50 dark:bg-slate-900 p-4 rounded-xl border border-zinc-200 dark:border-slate-800">
          <h4 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Foto del Equipo</h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {form.image_url ? (
              <div className="relative w-32 h-20 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex-shrink-0">
                <img src={form.image_url} alt="Equipo" className="w-full h-full object-cover" />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, image_url: '' })}
                    className="absolute inset-0 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-xs font-bold transition duration-150"
                  >
                    Cambiar / Eliminar
                  </button>
                )}
              </div>
            ) : (
              <div className="w-32 h-20 rounded bg-zinc-100 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-slate-500">
                <Laptop size={32} />
              </div>
            )}
            {!isAdmin ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500">Solo lectura. No tienes permisos para editar la foto.</p>
            ) : (
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs text-zinc-600 dark:text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400 file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setForm({ ...form, image_url: reader.result });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <input
                  className="input text-xs py-1"
                  placeholder="Pegar URL de foto..."
                  value={form.image_url || ''}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Remote Actions */}
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Acciones Remotas</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800" onClick={onConnectRdp}><Cable size={16} className="text-sky-500" /> RDP</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isAdmin} onClick={() => action('wake-on-lan')}><Play size={16} className="text-emerald-500" /> WOL</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isAdmin} onClick={() => action('restart')}><RefreshCw size={16} className="text-amber-500" /> Reinicio</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isAdmin} onClick={() => action('powershell')}><TerminalSquare size={16} className="text-indigo-500" /> Script</button>
          </div>
        </div>

        {/* Physical network connection info */}
        {(() => {
          const matchedSwitch = form.switch_id ? infrastructure.find(i => i.id === form.switch_id) : null;
          if (!matchedSwitch) return null;
          return (
            <div className="mt-5 bg-emerald-55/40 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-250 dark:border-emerald-900/35 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Network size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-450 dark:text-slate-500 uppercase tracking-wider">Conexión de Red Física</h4>
                  <p className="text-sm font-extrabold text-zinc-950 dark:text-white mt-0.5">
                    Switch: {matchedSwitch.brand} {matchedSwitch.model}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5 font-medium">
                    Ubicación: {matchedSwitch.location} · Puerto: <strong className="text-emerald-600 dark:text-emerald-400">#{form.switch_port}</strong>
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
        </div>
 
        {/* General details */}
        <fieldset disabled={!isAdmin} className="flex-1 overflow-y-auto space-y-6 block min-w-0 p-4 xs:p-6 pb-6">
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-3 pb-1 border-b border-zinc-200 dark:border-slate-800">Detalles de Asignación y Ubicación</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block">
              <div className="flex items-center justify-between mb-1">
                <span className="label mb-0">Responsable</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeeModal({
                        mode: 'create',
                        form: {
                          full_name: '',
                          email: '',
                          phone: '',
                          job_title: '',
                          department: form.department || '',
                          city: form.city || '',
                          authorized_systems: '',
                          active: true,
                          vpn_active: false,
                          workplace: 'Presencial'
                        }
                      });
                    }}
                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 hover:underline"
                  >
                    + Agregar nuevo usuario
                  </button>
                  {form.employee_id && (
                    <>
                      <span className="text-zinc-300 dark:text-slate-700">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const emp = employees.find(e => String(e.id) === String(form.employee_id));
                          if (emp) {
                            setEmployeeModal({ mode: 'view', form: emp });
                            onClose(); // Close the DeviceDrawer
                          }
                        }}
                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 hover:underline"
                      >
                        Ver Ficha Empleado
                      </button>
                    </>
                  )}
                </div>
              </div>
              <select
                className="input"
                value={form.employee_id || ''}
                onChange={(e) => handleEmployeeChange(e.target.value)}
              >
                <option value="">Sin responsable</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
            <label className="block">
              <span className="label">Categoría / Tipo de Equipo</span>
              <select
                className="input"
                value={form.device_type || 'PC'}
                onChange={(e) => setForm({ ...form, device_type: e.target.value })}
              >
                <option value="PC">PC de Escritorio</option>
                <option value="Notebook">Notebook (Laptop)</option>
                <option value="All in One">All in One</option>
                <option value="Servidor">Servidor</option>
                <option value="Otro">Otro</option>
              </select>
            </label>

            <label className="block">
              <span className="label">Ubicación / Sala</span>
              <select
                className="input"
                value={locationType}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocationType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, location: val });
                  }
                }}
              >
                <option value="Matta">Matta</option>
                <option value="Diario">Diario</option>
                <option value="Casa">Casa</option>
                <option value="Otro">Otro lugar...</option>
              </select>
              {locationType === 'Otro' && (
                <input
                  className="input mt-2"
                  placeholder="Escribe la ubicación..."
                  value={form.location || ''}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              )}
            </label>

            <label className="block">
              <span className="label">Cargo</span>
              <input className="input" value={form.job_title || ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Departamento</span>
              <select
                className="input"
                value={deptType}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeptType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, department: val });
                  }
                }}
              >
                <option value="">-- Seleccionar Departamento --</option>
                {existingDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {deptType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="Escribe el departamento..."
                  value={form.department || ''}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              )}
            </label>
            <label className="block">
              <span className="label">Ciudad</span>
              <select
                className="input"
                value={cityType}
                onChange={(e) => {
                  const val = e.target.value;
                  setCityType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, city: val });
                  }
                }}
              >
                <option value="">-- Seleccionar Ciudad --</option>
                {existingCities.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {cityType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="Escribe la ciudad..."
                  value={form.city || ''}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              )}
            </label>
            <label className="block">
              <span className="label">Sucursal</span>
              <input className="input" value={form.branch || ''} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Teléfono</span>
              <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Correo</span>
              <input className="input" type="email" list="existing-emails" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Versión de Office</span>
              <input className="input" value={form.office || ''} onChange={(e) => setForm({ ...form, office: e.target.value })} placeholder="ej. Office LTSC 2021 / 365" />
            </label>
            <label className="block">
              <span className="label">Antivirus</span>
              <input className="input" value={form.antivirus || ''} onChange={(e) => setForm({ ...form, antivirus: e.target.value })} placeholder="ej. Kaspersky / Defender" />
            </label>
            <label className="block">
              <span className="label">Estado Activo</span>
              <select className="input" value={form.asset_status || 'active'} onChange={(e) => setForm({ ...form, asset_status: e.target.value })}>
                <option value="active">Activo</option>
                <option value="retired">Retirado / De baja</option>
                <option value="maintenance">Mantenimiento</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Sistema Operativo</span>
              <input className="input" value={form.os || ''} onChange={(e) => setForm({ ...form, os: e.target.value })} placeholder="ej. Windows 11 Pro" />
            </label>
            <label className="block">
              <span className="label">Marca</span>
              <input className="input" value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="ej. Lenovo / HP" />
            </label>
            <label className="block">
              <span className="label">Modelo</span>
              <input className="input" value={form.model || ''} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="ej. ThinkPad L14" />
            </label>
            <label className="block">
              <span className="label">Número de Serie</span>
              <input className="input" value={form.serial_number || ''} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="ej. SN123456" />
            </label>
            <div className="flex gap-4 sm:col-span-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.critical || false}
                  onChange={(e) => setForm({ ...form, critical: e.target.checked })}
                  className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                />
                <span className="text-sm font-semibold">Equipo Crítico</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.managed || false}
                  onChange={(e) => setForm({ ...form, managed: e.target.checked })}
                  className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                />
                <span className="text-sm font-semibold">Administrado / Monitoreado</span>
              </label>
            </div>
          </div>
        </div>

        {/* Hardware specifications */}
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-3 pb-1 border-b border-zinc-200 dark:border-slate-800 flex items-center gap-1.5">
            <Activity size={14} className="text-emerald-500" />
            Monitoreo y Diagnóstico (Uptime / Reinicios)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block">
              <span className="label">TTL de Ping (OS/Network)</span>
              <p className="text-sm font-bold text-zinc-800 dark:text-slate-350 bg-zinc-50 dark:bg-slate-950 px-3 py-2 rounded border border-zinc-200 dark:border-slate-800 font-mono">
                {form.ping_ttl || 'No capturado'} {form.ping_ttl ? `(${form.ping_ttl === 128 ? 'Typical Windows' : form.ping_ttl === 64 ? 'Typical Linux/Printer' : 'Other'})` : ''}
              </p>
            </div>
            <div className="block">
              <span className="label">Contador de Reinicios</span>
              <p className="text-sm font-bold text-zinc-800 dark:text-slate-350 bg-zinc-50 dark:bg-slate-950 px-3 py-2 rounded border border-zinc-200 dark:border-slate-800 font-mono">
                🔥 {form.boot_count || 0} reinicios registrados
              </p>
            </div>
            <div className="block">
              <span className="label">Uptime Estimado</span>
              <p className="text-sm font-bold text-zinc-800 dark:text-slate-350 bg-zinc-50 dark:bg-slate-950 px-3 py-2 rounded border border-zinc-200 dark:border-slate-800 font-mono">
                {form.estimated_uptime_seconds
                  ? `${Math.floor(form.estimated_uptime_seconds / 3600)}h ${Math.floor((form.estimated_uptime_seconds % 3600) / 60)}m ${form.estimated_uptime_seconds % 60}s`
                  : 'Desconocido (Offline)'}
              </p>
            </div>
            <div className="block">
              <span className="label">Último Reinicio Detectado</span>
              <p className="text-sm font-bold text-zinc-800 dark:text-slate-350 bg-zinc-50 dark:bg-slate-950 px-3 py-2 rounded border border-zinc-200 dark:border-slate-800 font-mono">
                {form.last_reboot ? new Date(form.last_reboot).toLocaleString() : 'No registrado'}
              </p>
            </div>
          </div>
        </div>

        {/* Hardware specifications */}
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-3 pb-1 border-b border-zinc-200 dark:border-slate-800 flex items-center gap-1.5">
            <Cpu size={14} className="text-emerald-500" />
            Especificaciones de Hardware
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Procesador (CPU)</span>
              <select
                className="input"
                value={cpuType}
                onChange={(e) => {
                  const val = e.target.value;
                  setCpuType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, cpu: val });
                  }
                }}
              >
                <option value="">-- Seleccionar CPU --</option>
                {existingCpus.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {cpuType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="ej. Intel i7-13700 / Ryzen 7 7700"
                  value={form.cpu || ''}
                  onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                />
              )}
            </label>
            <label className="block">
              <span className="label">Memoria RAM</span>
              <select
                className="input"
                value={ramType}
                onChange={(e) => {
                  const val = e.target.value;
                  setRamType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, ram: val });
                  }
                }}
              >
                <option value="">-- Seleccionar RAM --</option>
                {existingRams.map(r => <option key={r} value={r}>{r}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {ramType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="ej. 16GB DDR5 4800MHz"
                  value={form.ram || ''}
                  onChange={(e) => setForm({ ...form, ram: e.target.value })}
                />
              )}
            </label>
            <label className="block">
              <span className="label">Almacenamiento</span>
              <select
                className="input"
                value={storageType}
                onChange={(e) => {
                  const val = e.target.value;
                  setStorageType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, storage: val });
                  }
                }}
              >
                <option value="">-- Seleccionar Almacenamiento --</option>
                {existingStorages.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {storageType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="ej. 1TB NVMe SSD"
                  value={form.storage || ''}
                  onChange={(e) => setForm({ ...form, storage: e.target.value })}
                />
              )}
            </label>
            <label className="block">
              <span className="label">Tarjeta de Video (GPU)</span>
              <select
                className="input"
                value={gpuType}
                onChange={(e) => {
                  const val = e.target.value;
                  setGpuType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, gpu: val });
                  }
                }}
              >
                <option value="">-- Seleccionar GPU --</option>
                {existingGpus.map(g => <option key={g} value={g}>{g}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {gpuType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="ej. NVIDIA RTX 4060 / Intel Iris Xe"
                  value={form.gpu || ''}
                  onChange={(e) => setForm({ ...form, gpu: e.target.value })}
                />
              )}
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Placa Madre (Motherboard)</span>
              <select
                className="input"
                value={mbType}
                onChange={(e) => {
                  const val = e.target.value;
                  setMbType(val);
                  if (val !== 'Otro') {
                    setForm({ ...form, motherboard: val });
                  }
                }}
              >
                <option value="">-- Seleccionar Motherboard --</option>
                {existingMotherboards.map(m => <option key={m} value={m}>{m}</option>)}
                <option value="Otro">Otro (Escribir manual)...</option>
              </select>
              {mbType === 'Otro' && (
                <input
                  className="input mt-2 animate-in fade-in duration-200"
                  placeholder="ej. ASUS Prime B760M-A"
                  value={form.motherboard || ''}
                  onChange={(e) => setForm({ ...form, motherboard: e.target.value })}
                />
              )}
            </label>
          </div>
        </div>

        {/* Notes */}
        <label className="mt-6 block">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Observaciones</h3>
          <textarea className="input min-h-24" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        </fieldset>

        {/* Fixed Footer Actions */}
        <div className="bg-zinc-50 dark:bg-slate-900/50 px-4 xs:px-6 py-4 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800 flex-shrink-0">
          <button className="button secondary py-1.5 px-3.5 text-xs font-bold" onClick={onClose}>Cancelar</button>
          {isAdmin && <button className="button primary py-1.5 px-3.5 text-xs font-bold" onClick={save}>Guardar Cambios</button>}
        </div>
      </aside>
    </div>
  );
}

function SubnetMap({ rows, getSubnetLabel, devices = [], onOpen }) {
  const [selectedSubnet, setSelectedSubnet] = useState(null);

  const grouped = rows.reduce((acc, row) => {
    acc[row.subnet] ||= [];
    acc[row.subnet].push(row);
    return acc;
  }, {});

  const barColor = (status) => ({
    online: 'text-emerald-500 dark:text-emerald-400',
    offline: 'text-rose-500 dark:text-rose-400',
    slow:    'text-amber-500 dark:text-amber-400'
  }[status] || 'text-zinc-500');

  const statusLabel = (status) => ({
    online: 'Online', offline: 'Offline', slow: 'Lento'
  }[status] || status);

  const STATUS_ORDER = { online: 0, slow: 1, offline: 2 };
  const sortDevices = (list) =>
    [...list].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 3;
      const sb = STATUS_ORDER[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      
      const partsA = (a.ip || '').split('.').map(n => parseInt(n, 10) || 0);
      const partsB = (b.ip || '').split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < 4; i++) {
        const valA = partsA[i] || 0;
        const valB = partsB[i] || 0;
        if (valA !== valB) return valA - valB;
      }
      return 0;
    });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(grouped).map(([subnet, stats]) => {
        const total  = stats.reduce((s, r) => s + r.total, 0);
        const online = stats.find(r => r.status === 'online')?.total || 0;
        const slow   = stats.find(r => r.status === 'slow')?.total   || 0;
        const pct    = total > 0 ? Math.round(((online + slow) / total) * 100) : 0;

        let color1      = 'rgb(16, 185, 129)';
        let color1Alpha = 'rgba(16, 185, 129, 0.65)';
        let color2Alpha = 'rgba(52, 211, 153, 0.35)';
        let glow        = 'rgba(16, 185, 129, 0.4)';
        let textColor   = 'text-emerald-500 dark:text-emerald-400';
        let borderColor = 'border-emerald-400 dark:border-emerald-500';
        let activeBg    = 'bg-emerald-50 dark:bg-emerald-950/20';

        if (pct < 50) {
          color1      = 'rgb(239, 68, 68)';
          color1Alpha = 'rgba(239, 68, 68, 0.65)';
          color2Alpha = 'rgba(248, 113, 113, 0.35)';
          glow        = 'rgba(239, 68, 68, 0.4)';
          textColor   = 'text-rose-500 dark:text-rose-400';
          borderColor = 'border-rose-400 dark:border-rose-500';
          activeBg    = 'bg-rose-50 dark:bg-rose-950/20';
        } else if (pct < 80) {
          color1      = 'rgb(245, 158, 11)';
          color1Alpha = 'rgba(245, 158, 11, 0.65)';
          color2Alpha = 'rgba(253, 186, 116, 0.35)';
          glow        = 'rgba(245, 158, 11, 0.4)';
          textColor   = 'text-amber-500 dark:text-amber-400';
          borderColor = 'border-amber-400 dark:border-amber-500';
          activeBg    = 'bg-amber-50 dark:bg-amber-950/20';
        }

        const orderedStats = ['online', 'slow', 'offline'].map(status => ({
          status,
          total: stats.find(r => r.status === status)?.total || 0
        }));

        const isOpen      = selectedSubnet === subnet;
        const subnetDevs  = isOpen ? sortDevices(devices.filter(d => d.subnet === subnet)) : [];

        return (
          <div key={subnet} className="flex flex-col rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-slate-800 transition-all duration-200">

            {/* ── Subnet card header (clickable) ── */}
            <button
              type="button"
              onClick={() => setSelectedSubnet(isOpen ? null : subnet)}
              className={`flex items-center justify-between p-4 text-left w-full transition-colors duration-200 ${
                isOpen
                  ? `${activeBg} border-b ${borderColor}`
                  : 'bg-white dark:bg-slate-900/60 hover:bg-zinc-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex-1 min-w-0 pr-3">
                {/* Title row */}
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-extrabold text-sm uppercase tracking-wide text-zinc-800 dark:text-slate-200 truncate">
                    {getSubnetLabel(subnet)}
                  </span>
                  {isOpen && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-slate-900/60 text-zinc-600 dark:text-slate-300 border border-zinc-300 dark:border-slate-600 normal-case tracking-normal whitespace-nowrap">
                      ▲ ocultar
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-slate-500 font-bold font-mono mb-3">
                  {subnet}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {orderedStats.map(row => (
                    <div key={row.status} className="flex flex-col">
                      <span className="text-[9px] font-bold text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
                        {statusLabel(row.status)}
                      </span>
                      <span className={`text-base font-extrabold ${barColor(row.status)}`}>
                        {row.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Donut gauge */}
              <div
                className="circular-progress-ring relative flex items-center justify-center rounded-full w-[72px] h-[72px] shrink-0 shadow-md"
                style={{
                  background: `conic-gradient(${color1} 0%, ${color1} ${pct}%, rgba(128,128,128,0.15) ${pct}%, rgba(128,128,128,0.15) 100%)`,
                  boxShadow: `0 0 12px ${glow}`
                }}
              >
                <div className="liquid-container border-0 bg-white dark:bg-slate-950 relative flex items-center justify-center rounded-full w-[62px] h-[62px] overflow-hidden">
                  <div
                    className="liquid-bubble absolute bottom-0 left-0 w-full h-full transition-transform duration-1000 ease-out"
                    style={{
                      transform: `translateY(${100 - pct}%)`,
                      '--wave-color-1': color1Alpha,
                      '--wave-color-2': color2Alpha,
                      '--wave-glow': glow
                    }}
                  >
                    <div className="liquid-wave-1" />
                    <div className="liquid-wave-2" />
                  </div>
                  <div className={`liquid-text text-sm font-black relative z-10 select-none ${textColor}`}>
                    {pct}<span className="text-[9px] font-bold ml-0.5">%</span>
                  </div>
                </div>
              </div>
            </button>

            {/* ── Accordion device list ── smooth expand via max-height */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out bg-white dark:bg-slate-900/80"
              style={{ maxHeight: isOpen ? '480px' : '0px' }}
            >
              {/* Mini header inside list */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/90">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  } animate-pulse`} />
                  <span className="text-xs font-bold text-zinc-600 dark:text-slate-300">
                    {subnetDevs.length} equipo{subnetDevs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedSubnet(null); }}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 text-base font-bold leading-none"
                  title="Cerrar"
                >
                  ×
                </button>
              </div>

              {/* Scrollable device rows */}
              <div className="overflow-y-auto divide-y divide-zinc-100 dark:divide-slate-800" style={{ maxHeight: '416px' }}>
                {subnetDevs.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-slate-500 px-4 py-5 text-center">
                    No hay equipos en esta subred.
                  </p>
                ) : subnetDevs.map(device => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => onOpen && onOpen(device)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors duration-100 group"
                  >
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      device.status === 'online' ? 'bg-emerald-500' :
                      device.status === 'slow'   ? 'bg-amber-500'   : 'bg-rose-500'
                    }`} />

                    {/* Hostname + IP */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {device.hostname || 'Sin nombre'}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-400 dark:text-slate-500">{device.ip}</p>
                    </div>

                    {/* Latency — hidden on tiny screens */}
                    <span className="hidden xs:block text-[10px] font-mono text-zinc-300 dark:text-slate-600 shrink-0 w-12 text-right">
                      {device.latency_ms != null ? `${device.latency_ms} ms` : '—'}
                    </span>

                    {/* Status badge */}
                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                      device.status === 'online'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : device.status === 'slow'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20'
                    }`}>
                      {device.status === 'online' ? 'Online' : device.status === 'slow' ? 'Lento' : 'Offline'}
                    </span>

                    <ChevronRight size={12} className="text-zinc-300 dark:text-slate-700 group-hover:text-emerald-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}



function NetworkGroups({ rows, getSubnetLabel }) {
  return <div className="space-y-2 text-sm">{rows.slice(0, 12).map((row, index) => (
    <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2 dark:bg-slate-950/60 border border-zinc-200/45 dark:border-slate-900" key={index}>
      <span className="font-medium text-xs font-mono">{getSubnetLabel(row.subnet)} · {row.city || 'Sin ciudad'} · {row.branch || 'Sin sucursal'}</span>
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">{row.total}</span>
    </div>
  ))}</div>;
}

function Feed({ rows, kind, devices }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-zinc-500 dark:text-slate-400">
        Sin registros recientes.
      </p>
    );
  }

  const getAnomalyLabel = (type, message) => {
    switch (type) {
      case 'rapid_offline': return '⚠️ Apagado Rápido';
      case 'rapid_reboot': return '⚡ Reinicio Rápido';
      case 'frequent_reboots': return '🔥 Reinicios Frecuentes';
      case 'uptime_anomaly': return '⏳ Uptime Anómalo';
      case 'reboot_signal': 
        if (message?.toLowerCase().includes('hostname')) {
          return '📝 Cambio de Nombre (Hostname)';
        }
        return '🔄 Cambio TTL (Reinicio)';
      default: return '⚠️ Anomalía Detectada';
    }
  };

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        let isOffline = false;
        let isOnline = false;
        let isAnomaly = kind === 'anomaly';

        if (!isAnomaly) {
          isOffline =
            row.title?.toLowerCase().includes('fuera de linea') ||
            row.message?.toLowerCase().includes('offline') ||
            row.title?.toLowerCase().includes('se desconectó') ||
            row.message?.toLowerCase().includes('desconectó');

          isOnline =
            row.title?.toLowerCase().includes('disponible nuevamente') ||
            row.message?.toLowerCase().includes('online') ||
            row.title?.toLowerCase().includes('volvió a estar disponible') ||
            row.message?.toLowerCase().includes('disponible');
        }

        const device = devices?.find(d => d.id === row.device_id);
        const ip = row.ip || device?.ip;
        const hostname = row.hostname || device?.hostname;
        const responsible = row.responsible_user || device?.responsible_user;

        // Custom borders based on kind and severity
        let borderClass = '';
        if (isOffline) borderClass = 'border-l-4 border-l-red-500 pl-2.5';
        else if (isOnline) borderClass = 'border-l-4 border-l-emerald-500 pl-2.5';
        else if (isAnomaly) {
          if (row.severity === 'critical') borderClass = 'border-l-4 border-l-red-500 pl-2.5';
          else if (row.severity === 'warning') borderClass = 'border-l-4 border-l-amber-500 pl-2.5';
          else borderClass = 'border-l-4 border-l-sky-500 pl-2.5';
        }

        // Title text and color
        let titleText = '';
        let titleColorClass = 'text-zinc-800 dark:text-slate-200';
        
        if (isAnomaly) {
          titleText = getAnomalyLabel(row.type, row.message);
          if (row.severity === 'critical') titleColorClass = 'text-red-400 font-bold';
          else if (row.severity === 'warning') titleColorClass = 'text-amber-400 font-semibold';
          else titleColorClass = 'text-sky-400 font-semibold';
        } else {
          titleText = kind === 'alert' ? row.title : row.message;
          if (isOffline) titleColorClass = 'text-red-400';
          else if (isOnline) titleColorClass = 'text-emerald-400';
        }

        const dateVal = row.created_at || row.detected_at || new Date().toISOString();

        return (
          <div
            key={row.id}
            className={`border-b pb-3 last:border-0 dark:border-slate-800 ${borderClass}`}
          >
            <p className={`text-sm ${titleColorClass}`}>
              {titleText}
            </p>
            {isAnomaly && row.message && (
              <p className="text-xs text-zinc-650 dark:text-slate-300 mt-0.5 italic">
                {row.message}
              </p>
            )}
            {(responsible || ip || hostname) && (
              <p className="mt-1 text-xs text-sky-650 dark:text-sky-400 font-medium">
                {responsible || 'Equipo sin asignar'}
                {ip && ` · ${ip}`}
                {hostname && ` · ${hostname}`}
              </p>
            )}
            <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
              {new Date(dateVal).toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }) {
  return <span className={`w-fit rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${statusClass(status)}`}>{status}</span>;
}

function IconButton({ title, onClick, children }) {
  return <button className="icon-button" title={title} onClick={onClick}>{children}</button>;
}

function statusClass(status) {
  return {
    online: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200 border border-emerald-500/10',
    offline: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200 border border-red-500/10',
    slow: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100 border border-amber-500/10'
  }[status] || 'bg-zinc-200 text-zinc-700 dark:bg-slate-800 dark:text-slate-200';
}

function barColor(status) {
  return {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    slow: 'bg-amber-400'
  }[status] || 'bg-zinc-400';
}

function buildChart(events) {
  // Sort events chronologically first
  const sortedEvents = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  const buckets = {};
  for (const event of sortedEvents) {
    const time = new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    buckets[time] ||= { online: 0, offline: 0, otros: 0 };
    
    const msg = (event.message || '').toLowerCase();
    const type = (event.type || '').toLowerCase();
    const isOffline = type.includes('offline') || msg.includes('desconectado') || msg.includes('desconectó');
    const isOnline = type.includes('online') || msg.includes('disponible') || msg.includes('conectado') || msg.includes('disponible nuevamente');
    
    if (isOffline) {
      buckets[time].offline += 1;
    } else if (isOnline) {
      buckets[time].online += 1;
    } else {
      buckets[time].otros += 1;
    }
  }
  
  return Object.entries(buckets).map(([time, counts]) => ({
    time,
    'Conexiones': counts.online,
    'Desconexiones': counts.offline,
    'Otros': counts.otros
  }));
}

function TopologyMapModal({
  isOpen,
  onClose,
  infrastructure = [],
  devices = [],
  setActiveSwitchForPorts
}) {
  const [selectedCity, setSelectedCity] = useState('Todos');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showEndDevices, setShowEndDevices] = useState(false);
  const [printZoom, setPrintZoom] = useState(80);

  if (!isOpen) return null;

  // 1. Filter infrastructure by selected city/group
  const filteredInfra = useMemo(() => {
    if (selectedCity === 'Todos') return infrastructure;
    return infrastructure.filter(item => getInfraGroup(item) === selectedCity);
  }, [infrastructure, selectedCity]);

  // 2. Build tree structure: children map & unique roots
  const { roots, childrenMap } = useMemo(() => {
    const childrenMap = {};
    const roots = [];
    const itemIds = new Set(filteredInfra.map(i => i.id));

    filteredInfra.forEach(item => {
      // If it points to a parent that exists in our current filtered list, it's a child
      if (item.switch_id && itemIds.has(item.switch_id)) {
        if (!childrenMap[item.switch_id]) childrenMap[item.switch_id] = [];
        childrenMap[item.switch_id].push(item);
      } else {
        roots.push(item);
      }
    });

    // Also check if any item's parent is missing in the list (treat as root)
    filteredInfra.forEach(item => {
      if (item.switch_id) {
        const parentExists = filteredInfra.some(p => p.id === item.switch_id);
        if (!parentExists) {
          roots.push(item);
        }
      }
    });

    const uniqueRoots = Array.from(new Set(roots));
    return { roots: uniqueRoots, childrenMap };
  }, [filteredInfra]);

  // Get list of existing city groups for filtering
  const cityGroups = useMemo(() => {
    const groups = new Set(infrastructure.map(getInfraGroup));
    return ['Todos', ...Array.from(groups).sort()];
  }, [infrastructure]);

  // Connected elements details for selected node
  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode) return null;
    const connectedDevs = devices.filter(d => d.switch_id === selectedNode.id);
    const connectedInfras = infrastructure.filter(i => i.switch_id === selectedNode.id);
    
    // Parent connection details
    let parentInfo = null;
    if (selectedNode.switch_id) {
      const parent = infrastructure.find(i => i.id === selectedNode.switch_id);
      if (parent) {
        parentInfo = {
          parent,
          localPort: selectedNode.local_port,
          parentPort: selectedNode.switch_port
        };
      }
    }

    return {
      connectedDevs,
      connectedInfras,
      parentInfo
    };
  }, [selectedNode, devices, infrastructure]);

  const renderIcon = (type) => {
    switch (type) {
      case 'Fortinet': return <Shield size={16} className="text-orange-505 dark:text-orange-500" />;
      case 'Router': return <Server size={16} className="text-violet-505 dark:text-violet-500" />;
      case 'Conversor': return <Cable size={16} className="text-pink-505 dark:text-pink-500" />;
      case 'Switch': return <Network size={16} className="text-sky-505 dark:text-sky-500" />;
      case 'Switch Genérico': return <Network size={16} className="text-amber-500 dark:text-amber-400 animate-pulse" />;
      default: return <Router size={16} className="text-emerald-505 dark:text-emerald-500" />;
    }
  };

  const getBorderColor = (node) => {
    const status = node.status;
    const isSelected = selectedNode && selectedNode.id === node.id;
    if (isSelected) return 'border-sky-500 shadow-sky-500/10';
    if (node.type === 'Switch Genérico') {
      if (status === 'apagado') return 'border-zinc-650/40 hover:border-zinc-500 shadow-zinc-500/5';
      if (status === 'malo') return 'border-red-500/40 hover:border-red-500 shadow-red-500/5';
      return 'border-amber-500/50 hover:border-amber-500 shadow-amber-500/10';
    }
    if (status === 'nuevo' || status === 'online') return 'border-emerald-500/40 hover:border-emerald-500 shadow-emerald-500/5';
    if (status === 'apagado') return 'border-zinc-650/40 hover:border-zinc-500 shadow-zinc-500/5';
    if (status === 'malo') return 'border-red-500/40 hover:border-red-500 shadow-red-500/5';
    return 'border-amber-500/40 hover:border-amber-500 shadow-amber-500/5'; // usado
  };

  const getStatusBadge = (status) => {
    const base = "px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ";
    if (status === 'nuevo' || status === 'online') return base + "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
    if (status === 'apagado') return base + "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20";
    if (status === 'malo') return base + "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
    return base + "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"; // usado
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node) => {
    const children = childrenMap[node.id] || [];
    const connDevs = devices.filter(d => d.switch_id === node.id);
    const hasChildren = children.length > 0 || (showEndDevices && connDevs.length > 0);
    const isSelected = selectedNode && selectedNode.id === node.id;

    return (
      <div key={node.id} className="flex items-center">
        {/* Node Card Container */}
        <div className="relative py-2 flex-shrink-0">
          <div 
            onClick={() => setSelectedNode(node)}
            className={`w-60 p-3.5 bg-slate-950/70 dark:bg-slate-900/90 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${getBorderColor(node)} ${
              isSelected ? 'ring-2 ring-sky-500 scale-[1.03] border-sky-500 z-10' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {renderIcon(node.type)}
                <span className="text-xs font-bold truncate text-slate-100">{node.brand} {node.model}</span>
              </div>
              <span className={getStatusBadge(node.status)}>{node.status}</span>
            </div>

            <div className="text-[10px] space-y-1 font-mono text-slate-400">
              <div className="flex justify-between">
                <span>IP:</span>
                <span className="text-slate-200 font-bold">{node.ip || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Ubic.:</span>
                <span className="text-slate-300 max-w-[120px] truncate" title={node.location}>{node.location || '—'}</span>
              </div>
              {connDevs.length > 0 && (
                <div className="flex justify-between text-sky-400 text-[9px] font-sans pt-1 border-t border-slate-800/60 mt-1">
                  <span>Conexiones:</span>
                  <span className="font-bold">🖥️ {connDevs.length} activos</span>
                </div>
              )}
            </div>

            {/* Display connection label inside card if it's connected to parent */}
            {node.switch_id && node.local_port && (
              <div className="mt-2 text-[9px] bg-sky-500/5 text-cyan-405 border border-cyan-500/10 rounded px-1.5 py-0.5 text-center font-mono flex items-center justify-between">
                <span>Boca: {getPortName(node.type, node.model, node.local_port)}</span>
                <span>➜</span>
              </div>
            )}
          </div>

          {/* Right horizontal connector line leading to children vertical line */}
          {hasChildren && (
            <div className="absolute top-1/2 -right-6 w-6 h-0.5 bg-slate-700/60"></div>
          )}
        </div>

        {/* Children Render Column */}
        {hasChildren && (
          <div className="flex flex-col gap-4 ml-6 relative pl-4 border-l-2 border-slate-700/50 py-3">
            {/* Render Switch/Router children first */}
            {children.map(child => {
              return (
                <div key={child.id} className="relative flex items-center">
                  {/* Left horizontal line connecting child to vertical parent line */}
                  <div className="absolute top-1/2 -left-4 w-4 h-0.5 bg-slate-700/50"></div>
                  {renderTreeNode(child)}
                </div>
              );
            })}

            {/* Render End Devices next if checked */}
            {showEndDevices && connDevs.map(d => {
              const isPrinter = d.device_type === 'Impresora' || (d.hostname || '').toLowerCase().includes('prn') || (d.hostname || '').toLowerCase().includes('imp');
              const isOffline = d.status === 'offline';
              return (
                <div key={d.id} className="relative flex items-center">
                  <div className="absolute top-1/2 -left-4 w-4 h-0.5 bg-slate-700/50"></div>
                  
                  <div className={`w-48 p-2.5 bg-slate-950/50 dark:bg-slate-900/65 rounded-xl border transition duration-150 flex items-center gap-2 shadow-sm ${
                    isOffline ? 'border-slate-800/80 opacity-60' : 'border-emerald-500/30 hover:border-emerald-500/70 shadow-emerald-500/5'
                  }`}>
                    <div className={`p-1.5 rounded flex-shrink-0 relative ${isOffline ? 'bg-slate-900 text-slate-500' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {isPrinter ? <Printer size={12} /> : <Laptop size={12} />}
                      <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${isOffline ? 'bg-red-500' : 'bg-emerald-500 shadow-[0_0_4px_#10b981]'}`}></span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-slate-200 truncate" title={d.hostname}>{d.hostname || 'Sin hostname'}</div>
                      <div className="text-[9px] font-mono text-slate-500 mt-0.5 flex justify-between items-center">
                        <span>{d.ip || 'DHCP'}</span>
                        <span className="bg-slate-800 text-slate-400 px-1 rounded text-[8px] font-semibold">Boca {d.switch_port}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const printTopology = () => {
    // Crear contenedor temporal para la impresión
    const printContainer = document.createElement('div');
    printContainer.id = 'print-topology-area';
    
    const styleEl = document.createElement('style');
    styleEl.id = 'print-topology-style';
    styleEl.innerHTML = `
      @media print {
        body > *:not(#print-topology-area) {
          display: none !important;
        }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
        }
        #print-topology-area {
          display: block !important;
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          padding: 20px;
          box-sizing: border-box;
          zoom: ${printZoom}%;
        }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; color: #1e293b; font-family: sans-serif; }
        p { font-size: 11px; color: #64748b; margin-bottom: 25px; font-family: monospace; }
        .tree-container { display: flex; flex-direction: column; gap: 35px; }
        .tree-node { display: flex; align-items: center; }
        .node-card { width: 220px; border: 1.5px solid #94a3b8; border-radius: 12px; padding: 12px; box-sizing: border-box; background: #f8fafc; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.05); page-break-inside: avoid; break-inside: avoid; }
        .node-title { font-size: 11px; font-weight: bold; margin-bottom: 6px; color: #0f172a; display: flex; justify-content: space-between; align-items: center; font-family: sans-serif; }
        .node-badge { font-size: 8px; border: 1.5px solid #64748b; padding: 1px 5px; border-radius: 4px; text-transform: uppercase; font-weight: 800; color: #334155; background: #f1f5f9; font-family: sans-serif; }
        .node-detail { font-size: 10px; font-family: monospace; color: #475569; margin-top: 3px; display: flex; justify-content: space-between; }
        .node-detail span { font-weight: bold; color: #0f172a; }
        .node-port { margin-top: 6px; font-size: 8px; background: #e2e8f0; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #334155; display: inline-block; }
        .children-column { display: flex; flex-direction: column; gap: 15px; margin-left: 24px; border-left: 2px solid #94a3b8; padding-left: 16px; position: relative; }
        .child-wrapper { display: flex; align-items: center; position: relative; page-break-inside: avoid; break-inside: avoid; }
        .child-line { position: absolute; top: 50%; left: -16px; width: 16px; height: 0; border-top: 2px solid #94a3b8; }
        .parent-line { position: absolute; top: 50%; right: -24px; width: 24px; height: 0; border-top: 2px solid #94a3b8; }
        .device-card { width: 180px; border: 1.5px solid #94a3b8; border-radius: 8px; padding: 8px; background: #fff; font-size: 10px; display: flex; align-items: center; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); page-break-inside: avoid; break-inside: avoid; }
        .device-icon { font-size: 12px; background: #f1f5f9; padding: 3px; border-radius: 4px; }
        .device-port { font-size: 7.5px; background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 0.5px 3.5px; border-radius: 3px; font-family: monospace; font-weight: bold; }
      }
      @media screen {
        #print-topology-area {
          display: none !important;
        }
      }
    `;

    let html = `<h1>Win NetWatch — Reporte de Topología de Red</h1>`;
    html += `<p>Subred: ${selectedCity.toUpperCase()} | Fecha Reporte: ${new Date().toLocaleString()}</p>`;
    html += `<div class="tree-container">`;
    
    const printNodeHtml = (node) => {
      const children = childrenMap[node.id] || [];
      const connDevs = devices.filter(d => d.switch_id === node.id);
      const hasChildren = children.length > 0 || (showEndDevices && connDevs.length > 0);
      
      let nodeHtml = `<div class="tree-node">`;
      
      nodeHtml += `<div style="position:relative;">`;
      nodeHtml += `<div class="node-card">`;
      nodeHtml += `<div class="node-title">${node.brand} ${node.model} <span class="node-badge">${node.status}</span></div>`;
      nodeHtml += `<div class="node-detail">Tipo: <span>${node.type.toUpperCase()}</span></div>`;
      nodeHtml += `<div class="node-detail">IP: <span>${node.ip || '—'}</span></div>`;
      nodeHtml += `<div class="node-detail">Ubicación: <span>${node.location || '—'}</span></div>`;
      if (node.switch_id && node.local_port) {
        nodeHtml += `<div class="node-port">Boca local: ${getPortName(node.type, node.model, node.local_port)}</div>`;
      }
      nodeHtml += `</div>`;
      if (hasChildren) {
        nodeHtml += `<div class="parent-line"></div>`;
      }
      nodeHtml += `</div>`;
      
      if (hasChildren) {
        nodeHtml += `<div class="children-column">`;
        
        children.forEach(child => {
          nodeHtml += `<div class="child-wrapper">`;
          nodeHtml += `<div class="child-line"></div>`;
          nodeHtml += printNodeHtml(child);
          nodeHtml += `</div>`;
        });
        
        if (showEndDevices && connDevs.length > 0) {
          connDevs.forEach(d => {
            const isPrinter = d.device_type === 'Impresora' || (d.hostname || '').toLowerCase().includes('prn') || (d.hostname || '').toLowerCase().includes('imp');
            const isOffline = d.status === 'offline';
            const statusLabel = isOffline ? 'OFFLINE' : 'ONLINE';
            const statusColor = isOffline ? '#ef4444' : '#10b981';
            const cardBg = isOffline ? '#f8fafc' : '#f0fdf4';
            const cardBorder = isOffline ? '#e2e8f0' : '#bbf7d0';
            
            nodeHtml += `<div class="child-wrapper" style="${isOffline ? 'opacity: 0.65;' : ''}">`;
            nodeHtml += `<div class="child-line"></div>`;
            nodeHtml += `<div class="device-card" style="background: ${cardBg}; border-color: ${cardBorder};">`;
            nodeHtml += `<span class="device-icon" style="color: ${statusColor}; border: 1px solid ${isOffline ? '#cbd5e1' : '#86efac'};">${isPrinter ? '🖨️' : '💻'}</span>`;
            nodeHtml += `<div style="flex:1; min-w:0;">`;
            nodeHtml += `<div style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#1e293b; font-family:sans-serif; display:flex; justify-content:space-between; align-items:center;">`;
            nodeHtml += `<span>${d.hostname || 'Sin hostname'}</span>`;
            nodeHtml += `<span style="font-size:7px; color:${statusColor}; font-weight:800; padding:1px 4px; border-radius:3px; background:${isOffline ? '#fee2e2' : '#d1fae5'};">${statusLabel}</span>`;
            nodeHtml += `</div>`;
            nodeHtml += `<div style="color:#64748b; font-size:8px; margin-top:2px; display:flex; justify-content:space-between; align-items:center;">`;
            nodeHtml += `<span>${d.ip || 'DHCP'}</span>`;
            nodeHtml += `<span class="device-port">Boca ${d.switch_port}</span>`;
            nodeHtml += `</div>`;
            nodeHtml += `</div>`;
            nodeHtml += `</div>`;
            nodeHtml += `</div>`;
          });
        }
        
        nodeHtml += `</div>`;
      }
      
      nodeHtml += `</div>`;
      return nodeHtml;
    };
    
    roots.forEach(root => {
      html += printNodeHtml(root);
    });
    
    html += `</div>`;
    
    printContainer.innerHTML = html;
    
    document.body.appendChild(printContainer);
    document.body.appendChild(styleEl);
    
    setTimeout(() => {
      window.print();
      document.body.removeChild(printContainer);
      document.body.removeChild(styleEl);
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-0 md:p-6 text-slate-100">
      <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-none md:rounded-2xl w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900 border-b border-slate-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between flex-shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
              <Network className="text-violet-500 flex-shrink-0" size={20} />
              Diagrama de Flujo / Topología de Red
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 font-medium">
              Mapa jerárquico interactivo de los switches, routers, conversores y módems configurados.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-start md:justify-end">
            {/* Show End Devices Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer text-[11px] sm:text-xs text-slate-350 dark:text-slate-300 select-none bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={showEndDevices}
                onChange={(e) => setShowEndDevices(e.target.checked)}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-slate-955 h-4 w-4"
              />
              <span className="font-semibold">Mostrar PCs/Impresoras</span>
            </label>

            {/* Print Zoom Selector */}
            <div className="flex items-center gap-1.5 flex-shrink-0 bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] sm:text-xs">
              <span className="text-slate-400 font-bold">Escala PDF:</span>
              <select
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] sm:text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-bold"
                value={printZoom}
                onChange={(e) => setPrintZoom(parseInt(e.target.value, 10))}
              >
                <option value="100">100%</option>
                <option value="90">90%</option>
                <option value="80">80%</option>
                <option value="70">70%</option>
                <option value="60">60%</option>
                <option value="50">50%</option>
              </select>
            </div>

            {/* Print PDF Button */}
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-colors flex-shrink-0"
              onClick={printTopology}
              title="Imprimir diagrama de topología actual"
            >
              <Printer size={13} /> PDF
            </button>

            {/* City Selector */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] sm:text-xs text-slate-400 font-bold">Subred:</span>
              <select
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] sm:text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                value={selectedCity}
                onChange={(e) => { setSelectedCity(e.target.value); setSelectedNode(null); }}
              >
                {cityGroups.map(cg => (
                  <option key={cg} value={cg}>{cg}</option>
                ))}
              </select>
            </div>
            
            <button 
              className="text-2xl text-slate-400 hover:text-white font-bold ml-auto md:ml-2 leading-none p-1 flex-shrink-0" 
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Main Work Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* Left Area: Tree Diagram Canvas */}
          <div className="flex-1 overflow-auto p-8 bg-slate-950/60 flex items-start justify-start select-none relative">
            {/* Grid dot background effect */}
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-25 pointer-events-none"></div>

            <div className="min-w-max flex flex-col gap-12 py-4 relative z-10">
              {roots.length > 0 ? (
                roots.map(root => (
                  <div key={root.id} className="flex items-start">
                    {renderTreeNode(root)}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-12 text-slate-500 font-medium">
                  <Network size={40} className="text-slate-700 mb-3 animate-pulse" />
                  <p className="text-sm">No se encontraron dispositivos de red principales para mostrar.</p>
                  <p className="text-xs text-slate-600 mt-1">Asegúrate de agregar switches o conversores en esta subred.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Area: Selected Node Inspector Panel */}
          <div className="w-full md:w-[350px] flex-shrink-0 p-6 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col overflow-y-auto min-h-0">
            {selectedNode ? (
              <div className="space-y-5">
                {/* Node Summary Card */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-300">
                      {renderIcon(selectedNode.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-extrabold text-sm text-white truncate">
                        {selectedNode.brand} {selectedNode.model}
                      </h4>
                      <span className="text-[10px] text-slate-400 capitalize block mt-0.5 font-semibold">{selectedNode.type}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2.5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dirección IP:</span>
                      <span className="font-bold text-slate-200">{selectedNode.ip || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dirección MAC:</span>
                      <span className="text-slate-200">{selectedNode.mac || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ubicación:</span>
                      <span className="text-slate-200">{selectedNode.location || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">N° Serie:</span>
                      <span className="text-slate-200">{selectedNode.serial_number || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Observaciones:</span>
                      <span className="text-slate-300 text-right truncate max-w-[150px]" title={selectedNode.notes}>{selectedNode.notes || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Connection Path details */}
                {selectedNodeDetails.parentInfo && (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3.5 space-y-2 text-xs">
                    <h5 className="font-bold text-cyan-400 flex items-center gap-1.5">
                      <Network size={14} /> Conexión Superior (Padre)
                    </h5>
                    <p className="text-slate-300">
                      Este equipo se conecta desde su puerto <strong className="text-white">{getPortName(selectedNode.type, selectedNode.model, selectedNodeDetails.parentInfo.localPort)}</strong> hacia:
                    </p>
                    <div className="bg-slate-955 p-2 rounded border border-slate-800 font-mono text-[10px] space-y-1">
                      <div>Equipo: <strong className="text-cyan-400">{selectedNodeDetails.parentInfo.parent.brand} {selectedNodeDetails.parentInfo.parent.model}</strong></div>
                      <div>Puerto Padre: <strong className="text-cyan-400">{getPortName(selectedNodeDetails.parentInfo.parent.type, selectedNodeDetails.parentInfo.parent.model, selectedNodeDetails.parentInfo.parentPort)}</strong></div>
                    </div>
                  </div>
                )}

                {/* Connected Infrastructure Downstream (Cascades) */}
                <div className="space-y-2.5">
                  <h5 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">
                    🔌 Enlaces de Red / Cascadas ({selectedNodeDetails.connectedInfras.length})
                  </h5>
                  <div className="max-h-[180px] overflow-y-auto border border-slate-800/80 rounded-xl divide-y divide-slate-800/80">
                    {selectedNodeDetails.connectedInfras.length > 0 ? (
                      selectedNodeDetails.connectedInfras.map(infra => {
                        const portName = getPortName(selectedNode.type, selectedNode.model, infra.switch_port);
                        return (
                          <div key={infra.id} className="p-3 bg-slate-950/20 flex flex-col gap-1 hover:bg-slate-850/20 cursor-pointer transition-colors" onClick={() => setSelectedNode(infra)}>
                            <div className="flex justify-between text-xs font-bold text-slate-200">
                              <span className="truncate max-w-[160px]">{infra.brand} {infra.model}</span>
                              <span className="text-[10px] bg-slate-800 text-sky-400 px-1.5 py-0.5 rounded font-mono">Boca {portName}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-400">
                              <span>IP: {infra.ip || '—'}</span>
                              <span className="capitalize text-slate-300 font-semibold">{infra.type}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-slate-500 text-xs italic">
                        No hay switches o routers secundarios conectados a este puerto.
                      </div>
                    )}
                  </div>
                </div>

                {/* Connected End Devices list */}
                <div className="space-y-2.5">
                  <h5 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">
                    🖥️ Activos Conectados ({selectedNodeDetails.connectedDevs.length})
                  </h5>
                  <div className="max-h-[220px] overflow-y-auto border border-slate-800/80 rounded-xl divide-y divide-slate-800/80">
                    {selectedNodeDetails.connectedDevs.length > 0 ? (
                      selectedNodeDetails.connectedDevs.map(d => (
                        <div key={d.id} className="p-3 bg-slate-950/20 flex flex-col gap-1">
                          <div className="flex justify-between text-xs font-bold text-slate-200">
                            <span className="truncate max-w-[160px]" title={d.hostname}>{d.hostname || 'Sin hostname'}</span>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">Boca #{d.switch_port}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>IP: {d.ip || '—'}</span>
                            <span className="truncate max-w-[120px]" title={d.responsible_user}>{d.responsible_user || 'Sin resp.'}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-slate-500 text-xs italic">
                        No hay equipos terminales (PCs, impresoras) conectados a este puerto.
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <button
                    onClick={() => {
                      setActiveSwitchForPorts(selectedNode);
                      onClose();
                    }}
                    className="w-full button primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 border-0"
                  >
                    <Network size={14} /> Administrar Puertos Físicos
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <Info size={30} className="text-slate-700 mb-2" />
                <p className="text-xs">Selecciona cualquier tarjeta en el diagrama de flujo para ver sus conexiones y administrar sus bocas.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchPortMapModal({
  activeSwitch,
  onClose,
  devices,
  infrastructure = [],
  token,
  user,
  useLocalApi,
  onSaved,
  onOpenDeviceDrawer
}) {
  const [selectedPort, setSelectedPort] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeviceToAssign, setSelectedDeviceToAssign] = useState(null);
  const [selectedTargetPort, setSelectedTargetPort] = useState(1);
  const isAdmin = user?.role === 'Super Administrador' || user?.role === 'Administrador';

  // Reactively fetch the freshest state of activeSwitch from the parent infrastructure list
  const currentActiveSwitch = useMemo(() => {
    return infrastructure.find(i => i.id === activeSwitch.id) || activeSwitch;
  }, [infrastructure, activeSwitch]);

  useEffect(() => {
    setSelectedDeviceToAssign(null);
  }, [selectedPort]);

  useEffect(() => {
    if (selectedDeviceToAssign && selectedDeviceToAssign.isInfra) {
      setSelectedTargetPort(1);
    }
  }, [selectedDeviceToAssign]);

  const destCount = useMemo(() => {
    if (!selectedDeviceToAssign || !selectedDeviceToAssign.isInfra) return 0;
    const isDestFortinet = selectedDeviceToAssign.type === 'Fortinet';
    const isDestCisco2901 = selectedDeviceToAssign.type === 'Router';
    const isDestRaisecom = selectedDeviceToAssign.type === 'Conversor';
    
    if (isDestFortinet) return 11;
    if (isDestCisco2901) return 4;
    if (isDestRaisecom) return 3;
    return selectedDeviceToAssign.ports_count || 24;
  }, [selectedDeviceToAssign]);

  const targetPorts = useMemo(() => {
    if (!selectedDeviceToAssign || !selectedDeviceToAssign.isInfra) return [];
    const isDestFortinet = selectedDeviceToAssign.type === 'Fortinet';
    const isDestCisco2901 = selectedDeviceToAssign.type === 'Router';
    const isDestRaisecom = selectedDeviceToAssign.type === 'Conversor';
    
    let destLabels = [];
    if (isDestFortinet) {
      destLabels = ['Console', 'Wan 2', 'Wan 1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];
    } else if (isDestCisco2901) {
      destLabels = ['Console', 'Aux', 'GE 0/0', 'GE 0/1'];
    } else if (isDestRaisecom) {
      destLabels = ['Optico (Fibra)', 'FastEthernet (LAN)', 'Console'];
    }

    const list = [];
    for (let p = 1; p <= destCount; p++) {
      const label = (isDestFortinet || isDestCisco2901 || isDestRaisecom) ? destLabels[p - 1] : `Boca #${p}`;
      list.push({ value: p, label });
    }
    return list;
  }, [selectedDeviceToAssign, destCount]);

  // Find all connected elements (devices + other infrastructure cascaded here)
  const connectedElements = useMemo(() => {
    // 1. Devices connected to this switch
    const devs = devices.filter(d => d.switch_id === currentActiveSwitch.id)
      .map(d => ({ ...d, isDevice: true, displayPort: parseInt(d.switch_port, 10) }));

    // 2. Child switches connected to this switch (they point to currentActiveSwitch)
    const childInfras = infrastructure.filter(i => i.switch_id === currentActiveSwitch.id)
      .map(i => ({ ...i, isInfra: true, isChild: true, displayPort: parseInt(i.switch_port, 10) }));

    // 3. Parent switch that this currentActiveSwitch is connected to (currentActiveSwitch points to it)
    const parentInfras = [];
    if (currentActiveSwitch.switch_id) {
      const parent = infrastructure.find(i => i.id === currentActiveSwitch.switch_id);
      if (parent) {
        parentInfras.push({
          ...parent,
          isInfra: true,
          isParent: true,
          displayPort: parseInt(currentActiveSwitch.local_port, 10) || 1
        });
      }
    }

    return [...devs, ...childInfras, ...parentInfras];
  }, [devices, infrastructure, currentActiveSwitch.id, currentActiveSwitch.switch_id, currentActiveSwitch.local_port]);

  // Map of port number -> connected element (always use integer keys)
  const portDeviceMap = useMemo(() => {
    const map = {};
    for (const elem of connectedElements) {
      const p = elem.displayPort;
      if (p && p > 0) {
        // Last-write-wins: prefer online or infra elements
        if (!map[p] || elem.status === 'online' || elem.isInfra) {
          map[p] = elem;
        }
      }
    }
    return map;
  }, [connectedElements]);

  const isFortinet = currentActiveSwitch.type === 'Fortinet';
  const isCisco2901 = currentActiveSwitch.type === 'Router';
  const isRaisecom = currentActiveSwitch.type === 'Conversor';

  let fortinetLabels = ['Console', 'Wan 2', 'Wan 1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];
  let fortinetShort = ['CNS', 'W2', 'W1', 'DMZ', 'B', 'A', '5', '4', '3', '2', '1'];

  if (isCisco2901) {
    fortinetLabels = ['Console', 'Aux', 'GE 0/0', 'GE 0/1'];
    fortinetShort = ['CNS', 'AUX', 'GE0', 'GE1'];
  } else if (isRaisecom) {
    fortinetLabels = ['Optico (Fibra)', 'FastEthernet (LAN)', 'Console'];
    fortinetShort = ['OPT', 'FE', 'CNS'];
  }
  
  // Total ports count
  const portsCount = isFortinet ? 11 : (isCisco2901 ? 4 : (isRaisecom ? 3 : (currentActiveSwitch.ports_count || 24)));

  // Search filtered devices and infrastructure that are eligible for binding (restricted strictly to the switch's city)
  const eligibleDevices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const switchCity = (currentActiveSwitch.city || '').trim().toLowerCase();

    const getCityFromIp = (ip) => {
      if (!ip) return '';
      const parts = ip.split('.');
      if (parts.length !== 4) return '';
      const thirdOctet = parseInt(parts[2], 10);
      if (thirdOctet === 100 || thirdOctet === 101 || thirdOctet === 102) return 'antofagasta';
      if (thirdOctet === 110) return 'arica';
      if (thirdOctet === 112) return 'iquique';
      return '';
    };

    // Buscar dispositivos en la misma ciudad (o sin ciudad asignada)
    const devs = devices.filter(d => {
      const ipCity = getCityFromIp(d.ip);
      const devCity = ipCity || (d.city || '').trim().toLowerCase();
      
      // Si tiene ciudad asignada/detectada y no coincide con el switch, se descarta
      if (devCity && devCity !== 'sin ciudad' && devCity !== 'no asignada') {
        if (devCity !== switchCity) return false;
      }
      
      if (d.switch_id === currentActiveSwitch.id && parseInt(d.switch_port, 10) === selectedPort) return false;
      
      const hostname = (d.hostname || '').toLowerCase();
      const ip = (d.ip || '').toLowerCase();
      const responsible = (d.responsible_user || '').toLowerCase();
      const location = (d.location || '').toLowerCase();
      
      return hostname.includes(query) || ip.includes(query) || responsible.includes(query) || location.includes(query);
    }).map(d => ({ ...d, isDevice: true, displayName: d.hostname || d.ip || 'Dispositivo' }));

    // Buscar infraestructura en la misma ciudad (excluyendo el switch activo actual)
    const infras = infrastructure.filter(i => {
      const ipCity = getCityFromIp(i.ip);
      const infraCity = ipCity || (i.city || '').trim().toLowerCase();
      
      if (infraCity && infraCity !== 'sin ciudad' && infraCity !== 'no asignada') {
        if (infraCity !== switchCity) return false;
      }
      
      if (i.id === currentActiveSwitch.id) return false;
      if (i.switch_id === currentActiveSwitch.id && parseInt(i.switch_port, 10) === selectedPort) return false;
      
      const brand = (i.brand || '').toLowerCase();
      const model = (i.model || '').toLowerCase();
      const type = (i.type || '').toLowerCase();
      const ip = (i.ip || '').toLowerCase();
      const location = (i.location || '').toLowerCase();
      
      return brand.includes(query) || model.includes(query) || type.includes(query) || ip.includes(query) || location.includes(query);
    }).map(i => ({ ...i, isInfra: true, displayName: `${i.type}: ${i.brand} ${i.model}` }));

    return [...devs, ...infras];
  }, [devices, infrastructure, searchQuery, currentActiveSwitch.id, selectedPort, currentActiveSwitch.city]);

  async function assignDeviceToPort(item, targetPort = null) {
    if (!selectedPort) return;
    try {
      const isDev = item.isDevice;

      if (isDev) {
        if (useLocalApi) {
          const res = await fetch(`${API_URL}/api/devices/${item.id}`, {
            method: 'PATCH',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              switch_id: currentActiveSwitch.id,
              switch_port: selectedPort,
              city: currentActiveSwitch.city || 'Antofagasta'
            })
          });
          if (!res.ok) throw new Error('Error al actualizar el puerto en la API local.');
        } else {
          // Desconectar al ocupante anterior de dispositivos en ese puerto
          const previousDeviceOccupant = devices.find(d => d.switch_id === currentActiveSwitch.id && parseInt(d.switch_port, 10) === selectedPort);
          if (previousDeviceOccupant && previousDeviceOccupant.id !== item.id) {
            await setDoc(doc(db, 'devices', previousDeviceOccupant.id), {
              ...previousDeviceOccupant,
              switch_id: null,
              switch_port: null
            });
          }
          
          // Desconectar al ocupante anterior de infraestructura en ese puerto
          const previousInfraOccupant = infrastructure.find(i => i.switch_id === currentActiveSwitch.id && parseInt(i.switch_port, 10) === selectedPort);
          if (previousInfraOccupant && previousInfraOccupant.id !== item.id) {
            await setDoc(doc(db, 'infrastructure', previousInfraOccupant.id), {
              ...previousInfraOccupant,
              switch_id: null,
              switch_port: null,
              local_port: null
            });
          }

          // Guardar nueva asociación en Firebase
          await setDoc(doc(db, 'devices', item.id), {
            ...item,
            switch_id: currentActiveSwitch.id,
            switch_port: selectedPort,
            city: currentActiveSwitch.city || 'Antofagasta'
          });
        }
      } else {
        // Es conexión cascada (infraestructura a infraestructura)
        // Usar jerarquía para decidir qué registro actualiza switch_id
        const rank = (s) => {
          if (s.type === 'Fortinet') return 3;
          if (s.type === 'Router') return 3;
          if (s.type === 'Switch') return 2;
          if (s.type === 'Switch Genérico') return 1.5;
          return 1; // Modem / Conversor
        };
        const activeRank = rank(currentActiveSwitch);
        const itemRank = rank(item);

        let targetId, updateBody;
        if (activeRank <= itemRank) {
          targetId = currentActiveSwitch.id;
          updateBody = {
            switch_id: item.id,
            switch_port: targetPort || 1,
            local_port: selectedPort
          };
        } else {
          targetId = item.id;
          updateBody = {
            switch_id: currentActiveSwitch.id,
            switch_port: selectedPort,
            local_port: targetPort || 1
          };
        }

        if (useLocalApi) {
          const res = await fetch(`${API_URL}/api/infrastructure/${targetId}`, {
            method: 'PATCH',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify(updateBody)
          });
          if (!res.ok) throw new Error('Error al actualizar el puerto en la API local.');
        } else {
          // Firebase fallback para infra
          const targetItem = targetId === currentActiveSwitch.id ? currentActiveSwitch : item;
          await setDoc(doc(db, 'infrastructure', targetId), {
            ...targetItem,
            ...updateBody
          });
        }
      }
      setSearchQuery('');
      await onSaved();
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    }
  }

  async function unbindDevice(item) {
    try {
      const isDev = item.isDevice;
      const isParent = item.isParent;
      const endpoint = isDev ? 'devices' : 'infrastructure';
      const targetId = isParent ? currentActiveSwitch.id : item.id;
      const targetEndpoint = isParent ? 'infrastructure' : endpoint;

      if (useLocalApi) {
        const res = await fetch(`${API_URL}/api/${targetEndpoint}/${targetId}`, {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            switch_id: null,
            switch_port: null,
            local_port: null
          })
        });
        if (!res.ok) throw new Error('Error al remover el puerto en la API local.');
      } else {
        if (isParent) {
          await setDoc(doc(db, 'infrastructure', currentActiveSwitch.id), {
            ...currentActiveSwitch,
            switch_id: null,
            switch_port: null,
            local_port: null
          });
        } else if (isDev) {
          await setDoc(doc(db, 'devices', item.id), {
            ...item,
            switch_id: null,
            switch_port: null
          });
        } else {
          await setDoc(doc(db, 'infrastructure', item.id), {
            ...item,
            switch_id: null,
            switch_port: null,
            local_port: null
          });
        }
      }
      await onSaved();
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    }
  }

  const occupiedCount = Object.keys(portDeviceMap).length;
  const freeCount = portsCount - occupiedCount;
  const occupiedPct = Math.round((occupiedCount / portsCount) * 100) || 0;
  const selectedDevice = selectedPort ? portDeviceMap[selectedPort] : null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
      <div className="bg-white dark:bg-slate-900 border-0 md:border border-zinc-200 dark:border-slate-800 shadow-2xl md:rounded-2xl rounded-none w-full h-full md:h-[85vh] md:max-w-5xl flex flex-col overflow-hidden text-zinc-950 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Network className="text-emerald-500" size={22} />
              Mapa de Puertos: {activeSwitch.brand} {activeSwitch.model}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5">
              Ubicación: <strong>{activeSwitch.location}</strong> · N° Serie: <strong>{activeSwitch.serial_number || '—'}</strong> · Capacidad: <strong>{isFortinet ? '11 interfaces' : isCisco2901 ? '4 interfaces' : isRaisecom ? '3 interfaces' : `${portsCount} puertos`}</strong>
            </p>
          </div>
          <button className="text-2xl text-zinc-400 hover:text-zinc-650 dark:hover:text-slate-200 font-bold" onClick={onClose}>×</button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">
          
          {/* Left Panel: Port Grid representing physical switch */}
          <div className="flex-1 p-6 overflow-y-auto bg-zinc-100 dark:bg-slate-950/40 border-b md:border-b-0 md:border-r border-zinc-250 dark:border-slate-800 flex flex-col gap-6 justify-between flex-shrink-0 md:flex-shrink">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase text-zinc-450 dark:text-slate-500 tracking-wider">
                  {isFortinet ? 'VISTA POSTERIOR DEL FIREWALL' : isCisco2901 ? 'VISTA FRONTAL DEL ROUTER' : isRaisecom ? 'VISTA FRONTAL DEL CONVERSOR' : 'VISTA FRONTAL DEL SWITCH'}
                </span>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"></span> Ocupado</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-zinc-400 dark:border-slate-600"></span> Libre</span>
                </div>
              </div>

              {/* The "Switch Bezel" */}
              <div className="bg-zinc-800 dark:bg-slate-900 border-4 border-zinc-700 dark:border-slate-850 p-4 rounded-xl shadow-inner max-w-4xl mx-auto">
                <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono mb-3">
                  <span>{activeSwitch.brand.toUpperCase()} {isFortinet ? 'FIREWALL NETWORKING' : isCisco2901 ? 'ROUTER SYSTEM' : isRaisecom ? 'MEDIA CONVERTER' : 'NETWORKING SYSTEM'}</span>
                  <span className="flex items-center gap-1">
                    SYS OK <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </span>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-3.5">
                  {Array.from({ length: portsCount }, (_, i) => {
                    const portNum = i + 1;
                    const dev = portDeviceMap[portNum];
                    const isSelected = selectedPort === portNum;
                    const label = (isFortinet || isCisco2901 || isRaisecom) ? fortinetShort[i] : portNum;
                    const fullName = getPortName(activeSwitch.type, activeSwitch.model, portNum);
                    const labelFontSize = (isFortinet || isCisco2901 || isRaisecom) && label.length > 2 ? 'text-[7.5px]' : 'text-[10px]';
                    return (
                      <div
                        key={portNum}
                        onClick={() => setSelectedPort(portNum)}
                        title={fullName}
                        className={`relative aspect-square rounded border-2 flex flex-col items-center justify-center transition-all duration-150 ${
                          dev
                            ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                            : 'border-zinc-650 dark:border-slate-800 border-dashed text-zinc-400 dark:text-slate-650 bg-zinc-900/30'
                        } ${
                          isSelected
                            ? 'ring-2 ring-sky-500 ring-offset-2 ring-offset-zinc-800 border-sky-500 scale-[1.08] z-10'
                            : 'hover:border-zinc-500 dark:hover:border-slate-600 hover:scale-105'
                        } cursor-pointer`}
                      >
                        <span className={`font-bold font-mono leading-none mb-1 text-zinc-450 dark:text-slate-500 ${labelFontSize}`}>{label}</span>
                        {dev ? (
                          <>
                            <Cable size={14} className="text-emerald-500" />
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] absolute top-1 right-1"></span>
                          </>
                        ) : (
                          isAdmin ? <Plus size={10} className="text-zinc-600 dark:text-slate-700" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 dark:bg-slate-700 block mx-auto mt-0.5"></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-zinc-200 dark:border-slate-800 pt-4 text-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-slate-500 block">Capacidad</span>
                <span className="text-lg font-extrabold">{isFortinet ? '11 interfaces' : isCisco2901 ? '4 interfaces' : isRaisecom ? '3 interfaces' : `${portsCount} bocas`}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-slate-500 block">Ocupados</span>
                <span className="text-lg font-extrabold text-emerald-500">{occupiedCount} ({occupiedPct}%)</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-slate-500 block">Disponibles</span>
                <span className="text-lg font-extrabold text-zinc-500 dark:text-slate-400">{freeCount}</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Selected Port Details & Search */}
          <div className="w-full md:w-[380px] flex-shrink-0 p-6 overflow-y-auto bg-white dark:bg-slate-900 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-slate-800 flex flex-col min-h-0">
            {selectedPort ? (
              <div className="flex-1 flex flex-col justify-between min-h-0">
                <div className="space-y-5">
                  <div className="bg-zinc-50 dark:bg-slate-950/40 p-4 rounded-xl border border-zinc-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-455 dark:text-slate-550">Puerto seleccionado</span>
                      <h4 className="text-xl font-black text-zinc-900 dark:text-white">
                        {isFortinet || isCisco2901 || isRaisecom ? `INTERFAZ: ${getPortName(activeSwitch.type, activeSwitch.model, selectedPort).toUpperCase()}` : `BOCA #${selectedPort}`}
                      </h4>
                    </div>
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                      selectedDevice
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-zinc-100 text-zinc-650 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {selectedDevice ? 'Ocupado' : 'Disponible'}
                    </span>
                  </div>

                  {selectedDevice ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-zinc-250 dark:border-slate-800 p-4 space-y-3.5 bg-zinc-50/50 dark:bg-slate-950/20">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                            {selectedDevice.isInfra ? <Server size={20} /> : <Laptop size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-extrabold text-sm text-zinc-950 dark:text-white truncate">
                              {selectedDevice.isInfra ? `${selectedDevice.brand} ${selectedDevice.model}` : (selectedDevice.hostname || 'Sin Hostname')}
                            </h5>
                            <p className="text-xs text-zinc-500 dark:text-slate-400 font-mono mt-0.5">{selectedDevice.ip || 'Sin IP'}</p>
                          </div>
                        </div>

                        <div className="border-t border-zinc-200 dark:border-slate-850 pt-3 space-y-2.5 text-xs">
                          {selectedDevice.isInfra ? (
                            <>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Tipo:</span>
                                <span className="font-bold text-zinc-800 dark:text-slate-200 capitalize">{selectedDevice.type}</span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Enlace de Red:</span>
                                <span className="font-bold text-zinc-900 dark:text-cyan-400 bg-cyan-500/5 px-2 py-0.5 rounded border border-cyan-500/10">
                                  {selectedDevice.isParent
                                    ? `Va a Interfaz ${getPortName(selectedDevice.type, selectedDevice.model, activeSwitch.switch_port)} de este ${selectedDevice.type}`
                                    : `Viene de Interfaz ${getPortName(selectedDevice.type, selectedDevice.model, selectedDevice.local_port)} de este ${selectedDevice.type}`
                                  }
                                </span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">N° Serie:</span>
                                <span className="font-mono font-bold text-zinc-800 dark:text-slate-200">{selectedDevice.serial_number || '—'}</span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Dirección MAC:</span>
                                <span className="font-mono text-zinc-800 dark:text-slate-200">{selectedDevice.mac || '—'}</span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Observación:</span>
                                <span className="font-bold text-zinc-850 dark:text-amber-300 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 max-w-[200px] truncate" title={selectedDevice.notes}>
                                  {selectedDevice.notes || '—'}
                                </span>
                              </p>
                            </>
                          ) : (
                            <>
                              {selectedDevice.responsible_user && (
                                <p className="flex justify-between">
                                  <span className="text-zinc-455 dark:text-slate-550">Responsable:</span>
                                  <span className="font-bold text-zinc-800 dark:text-slate-200">{selectedDevice.responsible_user}</span>
                                </p>
                              )}
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Ubicación física:</span>
                                <span className="font-bold text-zinc-800 dark:text-slate-200">{selectedDevice.location || '—'}</span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Sistema Operativo:</span>
                                <span className="font-mono text-zinc-800 dark:text-slate-200 truncate max-w-[180px]" title={selectedDevice.os}>
                                  {selectedDevice.os || '—'}
                                </span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-zinc-455 dark:text-slate-550">Observación:</span>
                                <span className="font-bold text-zinc-800 dark:text-slate-200 max-w-[200px] truncate" title={selectedDevice.notes}>
                                  {selectedDevice.notes || '—'}
                                </span>
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        {!selectedDevice.isInfra && (
                          <button
                            onClick={() => {
                              onOpenDeviceDrawer(selectedDevice);
                              onClose();
                            }}
                            className="button secondary py-2.5 text-xs font-bold w-full justify-center"
                          >
                            Ver Ficha Completa
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              const displayName = selectedDevice.isInfra ? `${selectedDevice.type} ${selectedDevice.brand} ${selectedDevice.model}` : (selectedDevice.hostname || selectedDevice.ip);
                              const lblBoca = isFortinet ? fortinetLabels[selectedPort - 1] : `Boca #${selectedPort}`;
                              if (confirm(`¿Desconectar el elemento "${displayName}" de la ${lblBoca}?`)) {
                                unbindDevice(selectedDevice);
                              }
                            }}
                            className="button py-2.5 text-xs font-bold text-red-500 border-red-200 dark:border-red-950/40 hover:border-red-500 hover:bg-red-500/5 justify-center w-full"
                          >
                            <Trash2 size={14} className="mr-1.5" /> Desconectar Puerto
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {isAdmin ? (
                        selectedDeviceToAssign ? (
                          <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block tracking-wider mb-1">Confirmar Asociación</span>
                              <h5 className="font-extrabold text-sm text-zinc-950 dark:text-white truncate" title={selectedDeviceToAssign.displayName}>
                                {selectedDeviceToAssign.displayName}
                              </h5>
                              <p className="text-xs text-zinc-500 dark:text-slate-400 font-mono mt-0.5">{selectedDeviceToAssign.ip || 'Sin IP'}</p>
                              
                              {selectedDeviceToAssign.isInfra && (
                                <div className="mt-3.5 space-y-1.5">
                                  <label className="text-[10px] uppercase font-bold text-zinc-405 dark:text-slate-500 block">
                                    Conectar al Puerto de {selectedDeviceToAssign.brand} {selectedDeviceToAssign.model}:
                                  </label>
                                  <select
                                    className="input text-xs w-full py-1.5 px-2 bg-zinc-950 border-zinc-800 text-white rounded-lg focus:ring-1 focus:ring-emerald-500"
                                    value={selectedTargetPort}
                                    onChange={(e) => setSelectedTargetPort(Number(e.target.value))}
                                  >
                                    {targetPorts.map(tp => (
                                      <option key={tp.value} value={tp.value}>{tp.label}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {!selectedDeviceToAssign.isInfra && selectedDeviceToAssign.responsible_user && (
                                <p className="text-[11px] text-zinc-450 dark:text-slate-550 mt-1">
                                  Responsable: <strong>{selectedDeviceToAssign.responsible_user}</strong>
                                </p>
                              )}
                              {selectedDeviceToAssign.switch_id && (
                                <p className="text-[10px] text-amber-500 font-semibold mt-1">
                                  ⚠️ Se moverá desde su puerto actual.
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setSelectedDeviceToAssign(null)}
                                className="button secondary py-2 px-3 text-xs flex-1 justify-center"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={async () => {
                                  await assignDeviceToPort(selectedDeviceToAssign, selectedTargetPort);
                                  setSelectedDeviceToAssign(null);
                                }}
                                className="button bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2 px-3 text-xs flex-1 justify-center rounded-lg shadow-sm"
                              >
                                Asociar a {isFortinet ? fortinetLabels[selectedPort - 1] : `Boca #${selectedPort}`}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="text-xs font-bold text-zinc-405 dark:text-slate-555 block mb-1">ASOCIAR EQUIPO A ESTE PUERTO</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Buscar por hostname, IP, marca o modelo..."
                                  className="input text-xs w-full pl-9 pr-4 py-2"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Search className="absolute left-3 top-2.5 text-zinc-455 dark:text-slate-550" size={14} />
                              </div>
                            </div>

                            <div className="max-h-[35vh] overflow-y-auto border border-zinc-200 dark:border-slate-800 rounded-xl divide-y divide-zinc-150 dark:divide-slate-800/60 bg-zinc-50/20">
                              {eligibleDevices.length > 0 ? (
                                eligibleDevices.map(dev => (
                                  <div
                                    key={dev.id}
                                    onClick={() => setSelectedDeviceToAssign(dev)}
                                    className="p-3 text-left hover:bg-zinc-50 dark:hover:bg-slate-855/30 cursor-pointer transition-colors duration-155"
                                  >
                                    <div className="flex justify-between items-start">
                                      <span className="font-bold text-xs truncate max-w-[170px] text-zinc-950 dark:text-white" title={dev.displayName}>
                                        {dev.displayName}
                                      </span>
                                      <span className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">{dev.ip || '—'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] text-zinc-450 dark:text-slate-550 mt-1">
                                      <span>{dev.isInfra ? `Infraestructura: ${dev.type}` : (dev.responsible_user || 'Sin responsable')}</span>
                                      {dev.switch_id && (
                                        <span className="text-[9px] bg-amber-500/10 text-amber-500 rounded px-1 font-semibold">
                                          Reubicar
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : searchQuery.trim() ? (
                                <div className="p-4 text-center text-xs text-zinc-500 dark:text-slate-400">
                                  No se encontraron equipos ni módems coincidentes.
                                </div>
                              ) : (
                                <div className="p-4 text-center text-xs text-zinc-555 dark:text-slate-400">
                                  Ingresa un término de búsqueda para ver equipos y módems disponibles.
                                </div>
                              )}
                            </div>
                          </>
                        )
                      ) : (
                        <div className="p-4 text-center text-xs text-zinc-555 dark:text-slate-400 font-medium">
                          Modo de solo lectura. No tienes permisos para asociar equipos a este puerto.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-zinc-400 dark:text-slate-550 mt-4 leading-normal bg-zinc-50 dark:bg-slate-950/20 p-3 rounded-lg border border-zinc-200/50 dark:border-slate-850">
                  <span className="font-bold text-zinc-500 dark:text-slate-450 block mb-0.5">💡 Consejo NetWatch</span>
                  Si el equipo ya estaba conectado a otro switch o puerto, se desvinculará de su puerto anterior de manera automática al asignarlo aquí.
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-6 space-y-4">
                <div className="p-4 rounded-full bg-zinc-100 dark:bg-slate-800 text-zinc-455 dark:text-slate-500">
                  <Info size={36} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 font-sans">Ningún Puerto Seleccionado</h4>
                  <p className="text-xs text-zinc-555 dark:text-slate-400 max-w-xs mt-1 leading-relaxed">
                    Haz clic sobre cualquier boca del switch a la izquierda para inspeccionar sus detalles, desvincular el equipo o buscar uno nuevo para asignarle.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

// ============================================================
// EmployeeModalDialog Component
// ============================================================
function EmployeeModalDialog({
  employeeModal,
  setEmployeeModal,
  existingCities = [],
  existingDepartments = [],
  devices = [],
  employees = [],
  token,
  useLocalApi,
  saveEmployee,
  unlinkDevice,
  linkDevice,
  setSelected
}) {
  const [form, setForm] = useState(employeeModal.form);
  const [showDeviceLinkSelector, setShowDeviceLinkSelector] = useState(false);
  const [deviceLinkSearch, setDeviceLinkSearch] = useState('');

  // Custom states for selects + manual entries
  const [cityType, setCityType] = useState(form.city && !existingCities.includes(form.city) ? 'Otro' : (form.city || ''));
  const [deptType, setDeptType] = useState(form.department && !existingDepartments.includes(form.department) ? 'Otro' : (form.department || ''));

  return (
    <div className={`fixed inset-0 ${employeeModal.mode === 'create' ? 'z-[60]' : 'z-50'} flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4`}>
      <div className="w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-xl rounded-none sm:rounded-2xl border-0 sm:border border-zinc-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-zinc-950 dark:text-slate-100 overflow-hidden flex flex-col transition-all duration-300">
        {employeeModal.mode === 'view' ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 pb-4">
              {/* Banner Profile */}
              <div className="relative">
                <div className="h-16 xs:h-20 bg-gradient-to-r from-emerald-500 to-teal-600"></div>
                <div className="absolute left-4 xs:left-6 -bottom-6">
                  {form.image_url ? (
                    <img
                      src={form.image_url}
                      alt={form.full_name}
                      className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-900 object-cover shadow-lg"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-900 bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                      {getInitials(form.full_name)}
                    </div>
                  )}
                </div>
                <div className="absolute right-4 top-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
                    form.active
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-500/30'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${form.active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    {form.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              {/* Employee Details Grid */}
              <div className="pt-4 xs:pt-6 px-4 xs:px-6">
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-zinc-950 dark:text-white leading-tight">{form.full_name}</h2>
                  {form.email ? (
                    <a
                      href={`mailto:${form.email}`}
                      className="text-xs text-zinc-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:underline font-medium transition-colors"
                      title="Enviar correo"
                    >
                      {form.email}
                    </a>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-slate-400 font-medium">Sin correo registrado</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 bg-zinc-50 dark:bg-slate-950 p-2.5 xs:p-3 rounded-xl border border-zinc-200 dark:border-slate-800">
                  <div>
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Teléfono</span>
                    {form.phone ? (() => {
                      const digits = form.phone.replace(/\D/g, '');
                      const waNum = digits.length === 9 && digits.startsWith('9') ? '56' + digits : digits;
                      return (
                        <a
                          href={`whatsapp://send?phone=${waNum}`}
                          className="text-emerald-500 hover:text-emerald-400 hover:underline text-xs font-semibold block"
                          title="Escribir o llamar por WhatsApp"
                        >
                          {form.phone}
                        </a>
                      );
                    })() : (
                      <span className="text-xs font-medium text-zinc-500 dark:text-slate-400">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Cargo</span>
                    <span className="text-xs font-medium">{form.job_title || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Lugar de Trabajo</span>
                    <span className="text-xs font-medium">{form.workplace || form.status || 'Presencial'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Departamento</span>
                    <span className="text-xs font-medium">{form.department || '—'}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Ciudad</span>
                    <span className="text-xs font-medium">{form.city || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] xs:text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Sistemas Autorizados</span>
                    <span className="text-xs font-medium">{form.authorized_systems || '—'}</span>
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-3 mt-1 pt-2 border-t border-zinc-200/50 dark:border-slate-800/50">
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Conexión VPN</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        form.vpn_active
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {form.vpn_active ? 'VPN Conectada' : 'Sin VPN'}
                      </span>
                      {form.vpn_active && form.vpn_type && (
                        <span className="text-[11px] text-zinc-500 dark:text-slate-400">({form.vpn_type})</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Assigned Devices */}
              <div className="px-4 xs:px-6 pb-4 xs:pb-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Laptop size={14} className="text-emerald-500" />
                    Equipos Asignados ({devices.filter(d => d.employee_id === form.id).length})
                  </h3>
                </div>
                
                <div className="border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-slate-950/20">
                  {devices.filter(d => d.employee_id === form.id).length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500 dark:text-slate-500 font-medium">
                      Este empleado no tiene equipos asignados en el inventario.
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-zinc-100 dark:bg-slate-900 border-b border-zinc-200 dark:border-slate-800 text-zinc-500 dark:text-slate-400 font-semibold">
                            <th className="py-2 px-3">Equipo</th>
                            <th className="py-2 px-3">IP</th>
                            <th className="py-2 px-3">Estado</th>
                            <th className="py-2 px-3 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {devices.filter(d => d.employee_id === form.id).map(dev => (
                            <tr key={dev.id} className="border-b border-zinc-100 dark:border-slate-800/40 hover:bg-zinc-100/50 dark:hover:bg-slate-900/30">
                              <td className="py-2 px-3 font-semibold text-zinc-800 dark:text-slate-200">
                                <button
                                  type="button"
                                  onClick={() => setSelected(dev)}
                                  className="text-emerald-600 dark:text-emerald-400 hover:underline text-left font-bold"
                                >
                                  {dev.hostname || 'Sin nombre'}
                                </button>
                              </td>
                              <td className="py-2 px-3 font-mono text-zinc-500 dark:text-slate-400">{dev.ip}</td>
                              <td className="py-2 px-3"><StatusPill status={dev.status} /></td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => unlinkDevice(dev.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-500/10 px-2 py-0.5 rounded transition duration-200 font-bold"
                                >
                                  Desvincular
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                
                {/* Assign existing device selector */}
                <div className="mt-3 relative">
                  {!showDeviceLinkSelector ? (
                    <button
                      type="button"
                      className="input text-left py-2 px-3 text-xs w-full flex justify-between items-center bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-800 rounded-lg text-zinc-700 dark:text-slate-355 font-semibold"
                      onClick={() => {
                        setShowDeviceLinkSelector(true);
                        setDeviceLinkSearch('');
                      }}
                    >
                      <span>+ Vincular/Asignar Equipo disponible...</span>
                      <span className="text-zinc-400 text-[10px]">▼</span>
                    </button>
                  ) : (
                    <div className="border border-zinc-200 dark:border-slate-800 rounded-xl p-2.5 bg-zinc-50 dark:bg-slate-955/40 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Buscar por IP, hostname, marca..."
                          className="input py-1 px-2 text-xs flex-1"
                          value={deviceLinkSearch}
                          onChange={(e) => setDeviceLinkSearch(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="button secondary py-1.5 px-2.5 text-xs font-bold"
                          onClick={() => setShowDeviceLinkSelector(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                      <div className="max-h-32 overflow-y-auto divide-y divide-zinc-200/50 dark:divide-slate-800/50 text-[11px] border border-zinc-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                        {devices
                          .filter(d => !d.employee_id)
                          .filter(d => {
                            const q = deviceLinkSearch.toLowerCase();
                            return (
                              (d.hostname || '').toLowerCase().includes(q) ||
                              (d.ip || '').toLowerCase().includes(q) ||
                              (d.brand || '').toLowerCase().includes(q) ||
                              (d.model || '').toLowerCase().includes(q)
                            );
                          })
                          .map(dev => (
                            <button
                              key={dev.id}
                              type="button"
                              className="w-full text-left p-2 hover:bg-zinc-50 dark:hover:bg-slate-800/40 font-semibold block text-zinc-900 dark:text-slate-100"
                              onClick={() => {
                                linkDevice(dev.id, form.id);
                                setShowDeviceLinkSelector(false);
                                setDeviceLinkSearch('');
                              }}
                            >
                              <span className="font-bold">{dev.hostname || 'Sin nombre'}</span> ({dev.ip}) - {dev.brand} {dev.model}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-zinc-50 dark:bg-slate-900/50 px-4 xs:px-6 py-3 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800 flex-shrink-0">
              <button
                className="button secondary py-1.5 px-3 text-xs"
                onClick={() => setEmployeeModal(null)}
              >
                Cerrar
              </button>
              <button
                className="button primary py-1.5 px-3 text-xs flex items-center gap-1.5"
                onClick={() => setEmployeeModal({ mode: 'edit', form: employeeModal.form })}
              >
                <Users size={14} /> Editar Datos
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-bold text-zinc-955 dark:text-white flex items-center gap-2 leading-tight">
                <User className="text-emerald-500" size={20} />
                {employeeModal.mode === 'create' ? 'Agregar Nuevo Empleado' : 'Editar Información Empleado'}
              </h3>
              <button className="text-2xl text-zinc-400 hover:text-zinc-655 dark:hover:text-slate-200" onClick={() => setEmployeeModal(null)}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 xs:p-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Nombre Completo *</span>
                <input
                  className="input"
                  value={form.full_name || ''}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="ej. Juan Pérez"
                />
              </label>

              <label className="block">
                <span className="label">Correo Electrónico</span>
                <input
                  className="input"
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ej. jperez@empresa.com"
                />
              </label>

              <label className="block bg-zinc-50 dark:bg-slate-955 p-3 rounded-lg border border-dashed border-zinc-300 dark:border-slate-800 sm:col-span-2">
                <span className="label mb-2 flex items-center gap-1.5">
                  <Upload size={14} className="text-emerald-500" />
                  Foto de Perfil (Subir archivo o pegar URL)
                </span>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {form.image_url ? (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
                      <img src={form.image_url} alt="Vista previa" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, image_url: '' })}
                        className="absolute inset-0 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-[10px] font-bold transition duration-150"
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-101 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-slate-500">
                      <User size={24} />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="text-xs text-zinc-650 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400 file:cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setForm({ ...form, image_url: reader.result });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <input
                      className="input text-xs py-1"
                      placeholder="O pega una URL directa de imagen..."
                      value={form.image_url || ''}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    />
                  </div>
                </div>
              </label>

              <label className="block">
                <span className="label">Departamento</span>
                <select
                  className="input"
                  value={deptType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDeptType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, department: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar Departamento --</option>
                  {existingDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {deptType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="Escribe el departamento..."
                    value={form.department || ''}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                )}
              </label>

              <label className="block">
                <span className="label">Ciudad</span>
                <select
                  className="input"
                  value={cityType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCityType(val);
                    if (val !== 'Otro') {
                      setForm({ ...form, city: val });
                    }
                  }}
                >
                  <option value="">-- Seleccionar Ciudad --</option>
                  {existingCities.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Otro">Otro (Escribir manual)...</option>
                </select>
                {cityType === 'Otro' && (
                  <input
                    className="input mt-2 animate-in fade-in duration-200"
                    placeholder="Escribe la ciudad..."
                    value={form.city || ''}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                )}
              </label>

              <label className="block">
                <span className="label">Sucursal</span>
                <input
                  className="input"
                  value={form.branch || ''}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="ej. Centro / Sucursal Sur"
                />
              </label>

              <label className="block">
                <span className="label">Teléfono</span>
                <input
                  className="input"
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="ej. +56912345678"
                />
              </label>

              <label className="block">
                <span className="label">Lugar de Trabajo</span>
                <select
                  className="input"
                  value={form.workplace || form.status || 'Presencial'}
                  onChange={(e) => setForm({ ...form, workplace: e.target.value, status: e.target.value })}
                >
                  <option value="Presencial">Presencial</option>
                  <option value="Teletrabajo">Teletrabajo / Remoto</option>
                  <option value="Hibrido">Híbrido</option>
                </select>
              </label>

              <label className="block">
                <span className="label">Cargo (Responsabilidad)</span>
                <input
                  className="input"
                  value={form.job_title || ''}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder="ej. Ejecutivo de Ventas / TI"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="label">Sistemas Autorizados / Aplicaciones</span>
                <input
                  className="input"
                  value={form.authorized_systems || ''}
                  onChange={(e) => setForm({ ...form, authorized_systems: e.target.value })}
                  placeholder="ej. Milenium, CRM Ventas, ERP Contabilidad"
                />
              </label>

              <label className="block">
                <span className="label">Tipo VPN</span>
                <select
                  className="input"
                  value={form.vpn_type || 'Agencia'}
                  onChange={(e) => setForm({ ...form, vpn_type: e.target.value })}
                >
                  <option value="Agencia">Agencia</option>
                  <option value="RDP">RDP</option>
                  <option value="Milenium">Milenium</option>
                </select>
              </label>

              <div className="flex flex-col gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.vpn_active || false}
                    onChange={(e) => setForm({ ...form, vpn_active: e.target.checked })}
                    className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                  />
                  <span className="text-sm font-semibold">Tiene VPN Activa</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active || false}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                  />
                  <span className="text-sm font-semibold">Empleado Activo</span>
                </label>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-slate-900/50 px-6 py-4 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800 flex-shrink-0">
              <button
                className="button secondary py-1.5 px-3.5 text-xs font-bold"
                onClick={() => {
                  if (employeeModal.mode === 'edit') {
                    setEmployeeModal({ mode: 'view', form: employeeModal.form });
                  } else {
                    setEmployeeModal(null);
                  }
                }}
              >
                Cancelar
              </button>
              <button
                className="button primary py-1.5 px-3.5 text-xs font-bold"
                onClick={() => saveEmployee(form)}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
