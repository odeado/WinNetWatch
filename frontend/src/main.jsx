import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Bell, Boxes, Building2, Cable, CheckCircle2, Clock3, Download,
  FileDown, Laptop, Moon, Network, Play, RefreshCw, Search, Shield, Sun,
  TerminalSquare, Users, WifiOff, User, Plus, Trash2, Cpu, Eye, LogOut, Upload, Info,
  Briefcase, MapPin, Lock, UserPlus, Edit3, ToggleLeft, ToggleRight
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import './styles.css';
import { db, auth } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

const API_URL = import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost')
  ? import.meta.env.VITE_API_URL
  : `${window.location.protocol}//${window.location.hostname}:8080`;
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  if (!token) {
    return <Login onLogin={(session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('user', JSON.stringify(session.user));
      setToken(session.token);
      setUser(session.user);
    }} />;
  }

  return <Dashboard token={token} user={user} theme={theme} setTheme={setTheme} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@local');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    
    try {
      // 1. Try Firebase Authentication first
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;
      onLogin({
        token: await fbUser.getIdToken(),
        user: { email: fbUser.email, role: 'Administrador', full_name: 'Administrador Local' }
      });
    } catch (fbErr) {
      console.warn('Firebase Auth failed, falling back to local Postgres login:', fbErr);
      
      // 2. Fallback to local Express API
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

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

function Dashboard({ token, user, theme, setTheme }) {
  const [toasts, setToasts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeModal, setEmployeeModal] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ q: '', status: '' });
  
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
  const [useLocalApi, setUseLocalApi] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [deviceModal, setDeviceModal] = useState(null);
  const [inventoryTab, setInventoryTab] = useState('Todos');
  const [appUsers, setAppUsers] = useState([]);
  const [appRoles, setAppRoles] = useState([]);
  const [userModal, setUserModal] = useState(null);
  const [userFilter, setUserFilter] = useState('');

  // Infrastructure inventory states
  const [infrastructure, setInfrastructure] = useState([]);
  const [infraModal, setInfraModal] = useState(null);
  const [infraFilter, setInfraFilter] = useState('');

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
    return devices.filter(dev => {
      const text = `
        ${dev.hostname || ''}
        ${dev.ip || ''}
        ${dev.brand || ''}
        ${dev.model || ''}
        ${dev.responsible_user || ''}
        ${dev.location || ''}
      `.toLowerCase();
      return text.includes(deviceFilter.toLowerCase());
    });
  }, [devices, deviceFilter]);

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

      const partsA = parseIp(a.ip);
      const partsB = parseIp(b.ip);
      for (let i = 0; i < 4; i++) {
        if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
      }
      return 0;
    });
  }, [devices, filter, getSubnetLabel]);

  // Toast Helper
  const triggerToast = (text, type) => {
    const toastId = Date.now();
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

    let unsubDevices, unsubEmployees, unsubSubnets, unsubDepts, unsubCities, unsubEvents, unsubAlerts, unsubInfra;

    const handleFirebaseError = (err) => {
      console.warn('Firestore subscription failed, switching to local API polling:', err);
      setUseLocalApi(true);
      if (unsubDevices) unsubDevices();
      if (unsubEmployees) unsubEmployees();
      if (unsubSubnets) unsubSubnets();
      if (unsubDepts) unsubDepts();
      if (unsubCities) unsubCities();
      if (unsubEvents) unsubEvents();
      if (unsubAlerts) unsubAlerts();
      if (unsubInfra) unsubInfra();
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
                triggerToast(`🔴 ${dev.hostname || dev.ip} se desconectó`, 'offline');
              } else if (dev.status === 'online') {
                playNotificationSound('online');
                triggerToast(`🟢 ${dev.hostname || dev.ip} volvió a estar disponible`, 'online');
              }
            }
          });
        }

        const nextRef = {};
        list.forEach(d => { nextRef[d.id] = { status: d.status }; });
        prevDevicesRef.current = nextRef;

        setDevices(list);

        setDeviceModal(prev => {
          if (prev && prev.form?.id) {
            const updated = list.find(d => d.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });

        setSelected(prev => {
          if (prev && prev.id) {
            const updated = list.find(d => d.id === prev.id);
            return updated || null;
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
          if (prev && prev.form?.id) {
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
      if (devRes.ok) {
        const list = await devRes.json();
        setDevices(list);
        
        if (Object.keys(prevDevicesRef.current).length > 0) {
          list.forEach(dev => {
            const prev = prevDevicesRef.current[dev.id];
            if (prev && prev.status !== dev.status) {
              if (dev.status === 'offline') {
                playNotificationSound('offline');
                triggerToast(`🔴 ${dev.hostname || dev.ip} se desconectó`, 'offline');
              } else if (dev.status === 'online') {
                playNotificationSound('online');
                triggerToast(`🟢 ${dev.hostname || dev.ip} volvió a estar disponible`, 'online');
              }
            }
          });
        }
        const nextRef = {};
        list.forEach(d => { nextRef[d.id] = { status: d.status }; });
        prevDevicesRef.current = nextRef;

        setDeviceModal(prev => {
          if (prev && prev.form?.id) {
            const updated = list.find(d => d.id === prev.form.id);
            if (updated) return { ...prev, form: updated };
          }
          return prev;
        });

        setSelected(prev => {
          if (prev && prev.id) {
            const updated = list.find(d => d.id === prev.id);
            return updated || null;
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
          if (prev && prev.form?.id) {
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
      }

      // 7. Fetch infrastructure
      const infraRes = await fetch(`${API_URL}/api/infrastructure`, { headers });
      if (infraRes.ok) setInfrastructure(await infraRes.json());
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
        active: form.active !== undefined ? form.active : true
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
        if (!response.ok) throw new Error('Failed to save employee via local API');
        
        setEmployeeModal(null);
        triggerToast('Empleado guardado correctamente', 'success');
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
        }
      }

      // Calculate subnet client-side
      const ipParts = (finalForm.ip || '').split('.');
      const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24` : 'unknown';

      const payload = {
        hostname: finalForm.hostname || '',
        ip: finalForm.ip,
        mac: finalForm.mac || '',
        os: finalForm.os || '',
        status: finalForm.status || 'unknown',
        rdp_available: finalForm.rdp_available || false,
        latency_ms: finalForm.latency_ms || null,
        subnet,
        city: finalForm.city || '',
        branch: finalForm.branch || '',
        department: finalForm.department || '',
        responsible_user: finalForm.responsible_user || '',
        phone: finalForm.phone || '',
        email: finalForm.email || '',
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
        last_seen: finalForm.last_seen || new Date().toISOString()
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
        if (!response.ok) throw new Error('Failed to save device via local API');
        
        setDeviceModal(null);
        setSelected(null);
        triggerToast('Equipo guardado con éxito', 'success');
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
      alert('Error al guardar equipo: ' + err.message);
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
        triggerToast('Equipo eliminado con éxito', 'success');
        return;
      }
      await deleteDoc(doc(db, 'devices', id));
      setDeviceModal(null);
      setSelected(null);
      triggerToast('Equipo eliminado con éxito', 'success');
    } catch (err) {
      console.error('Error deleting device:', err);
      alert('Error al eliminar equipo: ' + err.message);
    }
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
    } catch (err) {
      alert('Error de conexión al guardar usuario');
    }
  }

  async function deleteAppUser(id) {
    if (!confirm('¿Eliminar este usuario del sistema? Esta acción es irreversible.')) return;
    try {
      const response = await fetch(`${API_URL}/api/settings/users/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error();
      triggerToast('Usuario eliminado', 'success');
      loadAppUsers();
    } catch (err) {
      alert('Error al eliminar usuario');
    }
  }

  async function toggleAppUser(id, currentActive) {
    try {
      const response = await fetch(`${API_URL}/api/settings/users/${id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      if (!response.ok) throw new Error();
      triggerToast(currentActive ? 'Usuario desactivado' : 'Usuario activado', 'success');
      loadAppUsers();
    } catch (err) {
      alert('Error al cambiar estado de usuario');
    }
  }

  // Infrastructure CRUD functions
  async function saveInfrastructure(form) {
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
        notes: form.notes || ''
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
      alert('Error al guardar elemento de infraestructura');
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

  const chartData = useMemo(() => buildChart(events), [events]);

  const downloadDevicesCSV = () => {
    const headers = ['Hostname', 'IP', 'MAC', 'OS', 'Status', 'RDP Habilitado', 'Responsable', 'City', 'Branch', 'Department', 'Brand', 'Model', 'Serial Number', 'Location'];
    const rows = devices.map(d => [
      d.hostname || '',
      d.ip || '',
      d.mac || '',
      d.os || '',
      d.status || 'unknown',
      d.rdp_available ? 'SI' : 'NO',
      d.responsible_user || '',
      d.city || '',
      d.branch || '',
      d.department || '',
      d.brand || '',
      d.model || '',
      d.serial_number || '',
      d.location || ''
    ]);
    
    // Build CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${String(val).replaceAll('"', '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'inventario_equipos.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    triggerToast('Listado exportado como CSV', 'success');
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-slate-950 dark:text-slate-100 font-sans transition-colors duration-300">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex flex-col md:flex-row md:items-center justify-between px-4 py-3 gap-3 max-w-7xl">
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
              <IconButton title="Ejecutar escaneo" onClick={() => executeRemoteAction(null, 'scan')}><RefreshCw size={18} /></IconButton>
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
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <Stats summary={summary} />

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              <Panel title="Mapa de estado de red" icon={<Boxes size={18} />}>
                <SubnetMap rows={bySubnet} getSubnetLabel={getSubnetLabel} />
              </Panel>
              <Panel title="Tendencia histórica" icon={<Activity size={18} />}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis dataKey="time" stroke="currentColor" opacity={0.5} fontSize={10} />
                      <YAxis allowDecimals={false} stroke="currentColor" opacity={0.5} fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <Area type="monotone" dataKey="Conexiones" stroke="#10b981" fill="url(#colorOnline)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Desconexiones" stroke="#ef4444" fill="url(#colorOffline)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <Panel title="Equipos" icon={<Laptop size={18} />}>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                  <input className="input pl-10" placeholder="Buscar por nombre, IP, responsable, ubicación..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
                </div>
                <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                  <option value="">Todos</option>
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
            <Panel title="Vista jerarquica" icon={<Building2 size={18} />}>
               <NetworkGroups rows={networkMap} getSubnetLabel={getSubnetLabel} />
            </Panel>
          </aside>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xl text-zinc-950 dark:text-slate-100">
            <div className="mb-6 flex flex-wrap border-b border-zinc-200 dark:border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none">
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
                    <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                    <input
                      className="input pl-10"
                      placeholder="Buscar empleado por nombre, email, dpto, ciudad..."
                      value={employeeFilter}
                      onChange={(e) => setEmployeeFilter(e.target.value)}
                    />
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
                                <td className="py-3 px-4 text-zinc-500 dark:text-slate-400">{emp.email || '—'}</td>
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
                                <td className="py-3 px-4 font-mono text-xs">{emp.phone || '—'}</td>
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
                                      ? 'bg-green-100 text-green-850 dark:bg-green-500/10 dark:text-green-300'
                                      : 'bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-300'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${emp.active ? 'bg-green-500' : 'bg-red-500'}`}></span>
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

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                    <input
                      className="input pl-10"
                      placeholder="Buscar equipo por hostname, IP, marca, modelo, ubicación..."
                      value={deviceFilter}
                      onChange={(e) => setDeviceFilter(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => setDeviceModal({ mode: 'create', form: { ip: '', hostname: '', mac: '', os: '', city: '', branch: '', department: '', responsible_user: '', job_title: '', phone: '', email: '', notes: '', brand: '', model: '', serial_number: '', asset_status: 'active', critical: false, managed: false, tags: [], cpu: '', ram: '', storage: '', gpu: '', motherboard: '', image_url: '', device_type: 'PC', location: 'Matta', employee_id: null } })}
                    className="button primary flex items-center gap-1.5"
                  >
                    <Plus size={16} /> Registrar Equipo Manual
                  </button>
                </div>

                <div className="overflow-hidden border border-zinc-200 dark:border-slate-800 rounded-xl shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-semibold">
                          <th className="py-3.5 px-4">Equipo (Hostname)</th>
                          <th className="py-3.5 px-4">Dirección IP</th>
                          <th className="py-3.5 px-4">Categoría</th>
                          <th className="py-3.5 px-4">Responsable</th>
                          <th className="py-3.5 px-4">Ubicación / Sala</th>
                          <th className="py-3.5 px-4">Estado Red</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdminDevicesByTab.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="py-8 text-center text-zinc-500 dark:text-slate-400">
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
                                className={rowClass}
                              >
                                <td className="py-3 px-4 font-semibold">
                                  <div className="flex items-center gap-2.5">
                                    {dev.image_url ? (
                                      <img src={dev.image_url} alt={dev.hostname} className="w-8 h-8 rounded object-cover border border-zinc-200 dark:border-slate-700 flex-shrink-0" />
                                    ) : (
                                      <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 text-zinc-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
                                        <Laptop size={16} />
                                      </div>
                                    )}
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span>{dev.hostname || 'Equipo sin nombre'}</span>
                                        {dev.critical && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-950 tracking-wider">CRÍTICO</span>}
                                      </div>
                                      <span className="text-xs text-zinc-400 dark:text-slate-400 block font-normal">{dev.brand} {dev.model}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-zinc-550 dark:text-slate-350 font-mono">{dev.ip}</td>
                                <td className="py-3 px-4">
                                  <span className="rounded bg-slate-100 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 px-2 py-0.5 text-xs font-semibold">
                                    {dev.device_type || 'PC'}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-zinc-800 dark:text-slate-200">{dev.responsible_user || 'Sin asignar'}</div>
                                  {dev.email && <span className="text-xs text-zinc-400 dark:text-slate-500 block font-normal">{dev.email}</span>}
                                </td>
                                <td className="py-3 px-4 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                  <div className="flex flex-col gap-1">
                                    <span>{dev.location || 'Matta'}</span>
                                    {isRemote && (
                                      <span className="inline-block self-start rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-350 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide border border-sky-200 dark:border-sky-800/50 shadow-sm">
                                        VPN / Teletrabajo
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
                    <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                    <input
                      className="input pl-10"
                      placeholder="Buscar usuario por nombre o correo..."
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                    />
                  </div>
                  <button
                    className="button primary text-xs flex items-center gap-2 px-4 py-2.5 font-bold rounded-xl"
                    onClick={() => setUserModal({ mode: 'create', form: { email: '', password: '', full_name: '', role_id: appRoles[0]?.id || '' } })}
                  >
                    <UserPlus size={16} /> Nuevo Usuario
                  </button>
                </div>

                <div className="border border-zinc-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
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
                                  onClick={() => setUserModal({ mode: 'edit', form: { id: u.id, email: u.email, full_name: u.full_name, role_id: u.role_id, active: u.active, password: '' } })}
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
                            {appRoles.map((r) => (
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
                    <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                    <input
                      className="input pl-10"
                      placeholder="Buscar switch o monitor..."
                      value={infraFilter}
                      onChange={(e) => setInfraFilter(e.target.value)}
                    />
                  </div>
                  <button
                    className="button primary text-xs flex items-center gap-2 px-4 py-2.5 font-bold rounded-xl"
                    onClick={() => setInfraModal({ mode: 'create', form: { type: 'Switch', brand: '', model: '', serial_number: '', ports_count: 24, location: 'Matta', status: 'nuevo', acquired_at: new Date().toISOString().split('T')[0], notes: '' } })}
                  >
                    <Plus size={16} /> Agregar Infraestructura
                  </button>
                </div>

                <div className="overflow-hidden border border-zinc-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-slate-900">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50 text-zinc-500 dark:text-slate-400 font-semibold">
                          <th className="py-3.5 px-4">Tipo</th>
                          <th className="py-3.5 px-4">Marca / Modelo</th>
                          <th className="py-3.5 px-4">N° Serie</th>
                          <th className="py-3.5 px-4">Bocas / Puertos</th>
                          <th className="py-3.5 px-4">Ubicación</th>
                          <th className="py-3.5 px-4">Estado</th>
                          <th className="py-3.5 px-4">Fecha Ingreso</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {infrastructure.filter(i => {
                          const query = infraFilter.toLowerCase();
                          return (i.brand || '').toLowerCase().includes(query) || (i.model || '').toLowerCase().includes(query) || (i.serial_number || '').toLowerCase().includes(query) || (i.location || '').toLowerCase().includes(query);
                        }).length === 0 ? (
                          <tr>
                            <td colSpan="8" className="py-8 text-center text-zinc-500 dark:text-slate-400 font-semibold">
                              No se encontraron elementos de infraestructura.
                            </td>
                          </tr>
                        ) : (
                          infrastructure.filter(i => {
                            const query = infraFilter.toLowerCase();
                            return (i.brand || '').toLowerCase().includes(query) || (i.model || '').toLowerCase().includes(query) || (i.serial_number || '').toLowerCase().includes(query) || (i.location || '').toLowerCase().includes(query);
                          }).map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-zinc-100 dark:border-slate-800/50 hover:bg-zinc-50/50 dark:hover:bg-slate-800/30 transition duration-150 cursor-pointer"
                              onClick={() => setInfraModal({ mode: 'edit', form: item })}
                            >
                              <td className="py-3 px-4 font-semibold text-zinc-950 dark:text-white">
                                {item.type}
                              </td>
                              <td className="py-3 px-4 font-semibold">
                                {item.brand} {item.model}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs">
                                {item.serial_number || '—'}
                              </td>
                              <td className="py-3 px-4">
                                {item.type === 'Switch' ? `${item.ports_count || 0} Bocas` : '—'}
                              </td>
                              <td className="py-3 px-4">
                                {item.location}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  item.status === 'nuevo'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                                    : 'bg-zinc-100 text-zinc-800 dark:bg-slate-800 dark:text-slate-350'
                                }`}>
                                  {item.status === 'nuevo' ? 'Nuevo' : 'Usado'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs font-mono">
                                {item.acquired_at ? new Date(item.acquired_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-2">
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
                          ))
                        )}
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
                              <option value="Switch">Switch</option>
                              <option value="Monitor">Monitor</option>
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
                          {infraModal.form.type === 'Switch' && (
                            <div>
                              <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Bocas / Puertos</label>
                              <input
                                className="input w-full"
                                type="number"
                                placeholder="ej. 24, 48"
                                value={infraModal.form.ports_count || ''}
                                onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, ports_count: parseInt(e.target.value, 10) || 0 } })}
                              />
                            </div>
                          )}
                          <div className={infraModal.form.type !== 'Switch' ? 'col-span-2' : ''}>
                            <label className="text-xs font-bold text-zinc-500 dark:text-slate-400 block mb-1">Fecha Ingreso</label>
                            <input
                              className="input w-full"
                              type="date"
                              value={infraModal.form.acquired_at ? infraModal.form.acquired_at.split('T')[0] : ''}
                              onChange={(e) => setInfraModal({ ...infraModal, form: { ...infraModal.form, acquired_at: e.target.value } })}
                            />
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
                          <button type="button" className="button secondary" onClick={() => setInfraModal(null)}>Cancelar</button>
                          <button type="submit" className="button primary flex items-center gap-1.5">
                            <Plus size={14} />
                            {infraModal.mode === 'create' ? 'Agregar Elemento' : 'Guardar Cambios'}
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
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 font-semibold text-white pointer-events-auto border-l-4 ${
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
          device={selected}
          employees={employees}
          token={token}
          onClose={() => setSelected(null)}
          onSaved={loadData}
          onConnectRdp={() => connectRdp(selected)}
          existingCities={existingCities}
          existingDepartments={existingDepartments}
          useLocalApi={useLocalApi}
        />
      )}

      {/* Employee Modal (Ficha de Empleado) */}
      {employeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-zinc-950 dark:text-slate-100 overflow-hidden transition-all duration-300">
            {employeeModal.mode === 'view' ? (
              <div className="space-y-6">
                {/* Banner Profile */}
                <div className="relative">
                  <div className="h-24 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-2xl"></div>
                  <div className="absolute left-6 -bottom-8">
                    {employeeModal.form.image_url ? (
                      <img
                        src={employeeModal.form.image_url}
                        alt={employeeModal.form.full_name}
                        className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-900 object-cover shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-900 bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                        {getInitials(employeeModal.form.full_name)}
                      </div>
                    )}
                  </div>
                  <div className="absolute right-4 top-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
                      employeeModal.form.active
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${employeeModal.form.active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      {employeeModal.form.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>

                {/* Employee Details Grid */}
                <div className="pt-6 px-6">
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-zinc-950 dark:text-white leading-tight">{employeeModal.form.full_name}</h2>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 font-medium">{employeeModal.form.email || 'Sin correo registrado'}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 bg-zinc-50 dark:bg-slate-950 p-3 rounded-xl border border-zinc-200 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Teléfono</span>
                      <span className="text-xs font-medium">{employeeModal.form.phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Lugar de Trabajo</span>
                      <span className="text-xs font-medium">{employeeModal.form.workplace || employeeModal.form.status || 'Presencial'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Departamento</span>
                      <span className="text-xs font-medium">{employeeModal.form.department || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Ciudad</span>
                      <span className="text-xs font-medium">{employeeModal.form.city || '—'}</span>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-3 mt-1 pt-2 border-t border-zinc-200/50 dark:border-slate-800/50">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-500 uppercase block tracking-wider">Conexión VPN</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          employeeModal.form.vpn_active
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-200 text-zinc-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {employeeModal.form.vpn_active ? 'VPN Conectada' : 'Sin VPN'}
                        </span>
                        {employeeModal.form.vpn_active && employeeModal.form.vpn_type && (
                          <span className="text-[11px] text-zinc-500 dark:text-slate-400">({employeeModal.form.vpn_type})</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assigned Devices */}
                <div className="px-6 pb-6">
                  <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2 flex items-center gap-1.5">
                    <Laptop size={14} className="text-emerald-500" />
                    Equipos Asignados ({devices.filter(d => d.employee_id === employeeModal.form.id).length})
                  </h3>
                  
                  <div className="border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-slate-950/20">
                    {devices.filter(d => d.employee_id === employeeModal.form.id).length === 0 ? (
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
                            {devices.filter(d => d.employee_id === employeeModal.form.id).map(dev => (
                              <tr key={dev.id} className="border-b border-zinc-100 dark:border-slate-800/40 hover:bg-zinc-100/50 dark:hover:bg-slate-900/30">
                                <td className="py-2 px-3 font-semibold text-zinc-800 dark:text-slate-200">{dev.hostname || 'Sin nombre'}</td>
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
                </div>

                {/* Modal Actions */}
                <div className="bg-zinc-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800">
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
              <div>
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                    <User className="text-emerald-500" size={20} />
                    {employeeModal.mode === 'create' ? 'Agregar Nuevo Empleado' : 'Editar Información Empleado'}
                  </h3>
                  <button className="text-2xl text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-200" onClick={() => setEmployeeModal(null)}>×</button>
                </div>

                <div className="p-6 grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-2">
                  <label className="block">
                    <span className="label">Nombre Completo *</span>
                    <input
                      className="input"
                      value={employeeModal.form.full_name || ''}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, full_name: e.target.value }
                        })
                      }
                      placeholder="ej. Juan Pérez"
                    />
                  </label>

                  <label className="block">
                    <span className="label">Correo Electrónico</span>
                    <input
                      className="input"
                      type="email"
                      value={employeeModal.form.email || ''}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, email: e.target.value }
                        })
                      }
                      placeholder="ej. jperez@empresa.com"
                    />
                  </label>

                  <label className="block bg-zinc-50 dark:bg-slate-950 p-3 rounded-lg border border-dashed border-zinc-300 dark:border-slate-800 sm:col-span-2">
                    <span className="label mb-2 flex items-center gap-1.5">
                      <Upload size={14} className="text-emerald-500" />
                      Foto de Perfil (Subir archivo o pegar URL)
                    </span>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {employeeModal.form.image_url ? (
                        <div className="relative w-16 h-16 rounded-full overflow-hidden border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
                          <img src={employeeModal.form.image_url} alt="Vista previa" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setEmployeeModal(prev => ({ ...prev, form: { ...prev.form, image_url: '' } }))}
                            className="absolute inset-0 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-[10px] font-bold transition duration-150"
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-slate-500">
                          <User size={24} />
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
                              setEmployeeModal(prev => ({
                                ...prev,
                                form: { ...prev.form, image_url: reader.result }
                              }));
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <input
                          className="input text-xs py-1"
                          placeholder="O pega una URL directa de imagen..."
                          value={employeeModal.form.image_url || ''}
                          onChange={(e) => setEmployeeModal(prev => ({ ...prev, form: { ...prev.form, image_url: e.target.value } }))}
                        />
                      </div>
                    </div>
                  </label>

                  <label className="block">
                    <span className="label">Departamento</span>
                    <input
                      className="input"
                      list="departments-list"
                      value={employeeModal.form.department || ''}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, department: e.target.value }
                        })
                      }
                      placeholder="ej. Finanzas / TI"
                    />
                  </label>

                  <label className="block">
                    <span className="label">Ciudad</span>
                    <input
                      className="input"
                      list="cities-list"
                      value={employeeModal.form.city || ''}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, city: e.target.value }
                        })
                      }
                      placeholder="ej. Santiago / Antofagasta"
                    />
                  </label>

                  <label className="block">
                    <span className="label">Teléfono</span>
                    <input
                      className="input"
                      value={employeeModal.form.phone || ''}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, phone: e.target.value }
                        })
                      }
                      placeholder="ej. +56912345678"
                    />
                  </label>

                  <label className="block">
                    <span className="label">Lugar de Trabajo</span>
                    <select
                      className="input"
                      value={employeeModal.form.workplace || employeeModal.form.status || 'Presencial'}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, workplace: e.target.value, status: e.target.value }
                        })
                      }
                    >
                      <option value="Presencial">Presencial</option>
                      <option value="Teletrabajo">Teletrabajo / Remoto</option>
                      <option value="Hibrido">Híbrido</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="label">Tipo VPN</span>
                    <select
                      className="input"
                      value={employeeModal.form.vpn_type || 'Agencia'}
                      onChange={(e) =>
                        setEmployeeModal({
                          ...employeeModal,
                          form: { ...employeeModal.form, vpn_type: e.target.value }
                        })
                      }
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
                        checked={employeeModal.form.vpn_active || false}
                        onChange={(e) =>
                          setEmployeeModal({
                            ...employeeModal,
                            form: { ...employeeModal.form, vpn_active: e.target.checked }
                          })
                        }
                        className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                      />
                      <span className="text-sm font-semibold">Tiene VPN Activa</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={employeeModal.form.active || false}
                        onChange={(e) =>
                          setEmployeeModal({
                            ...employeeModal,
                            form: { ...employeeModal.form, active: e.target.checked }
                          })
                        }
                        className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-800 h-4 w-4"
                      />
                      <span className="text-sm font-semibold">Empleado Activo</span>
                    </label>
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-slate-900/50 px-6 py-4 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800">
                  <button
                    className="button secondary"
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
                    className="button primary"
                    onClick={() => saveEmployee(employeeModal.form)}
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
        />
      )}

      {/* Datalists suggestion elements */}
      <datalist id="cities-list">
        {existingCities.map(c => <option key={c} value={c} />)}
      </datalist>
      <datalist id="departments-list">
        {existingDepartments.map(d => <option key={d} value={d} />)}
      </datalist>
    </main>
  );
}

// Sub-component for DeviceModalDialog (creation/editing manually) to keep code structured
function DeviceModalDialog({ deviceModal, setDeviceModal, employees, saveDevice, existingCities, existingDepartments }) {
  const [form, setForm] = useState(deviceModal.form);
  
  // Locations management
  const predefinedLocations = ['Matta', 'Diario', 'Casa'];
  const isCustomLocation = form.location && !predefinedLocations.includes(form.location);
  const [locationType, setLocationType] = useState(isCustomLocation ? 'Otro' : (form.location || 'Matta'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-zinc-900 dark:text-slate-100 overflow-hidden my-8 transition-all duration-300">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-slate-800 flex items-center justify-between">
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

        <div className="p-6 grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-2">
          <label className="block">
            <span className="label">Dirección IP *</span>
            <input
              className="input"
              disabled={deviceModal.mode === 'edit'}
              value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
              placeholder="ej. 172.30.100.15"
            />
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
              onChange={(e) => setForm({ ...form, mac: e.target.value })}
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
            <span className="label">Responsable Asignado</span>
            <select
              className="input"
              value={form.employee_id || ''}
              onChange={(e) => {
                const selectedId = e.target.value;
                const employee = employees.find(emp => String(emp.id) === String(selectedId));
                if (!employee) {
                  setForm({
                    ...form,
                    employee_id: null,
                    responsible_user: '',
                    email: '',
                    department: '',
                    city: '',
                    phone: ''
                  });
                } else {
                  setForm({
                    ...form,
                    employee_id: employee.id,
                    responsible_user: employee.full_name,
                    email: employee.email || '',
                    department: employee.department || '',
                    city: employee.city || '',
                    phone: employee.phone || ''
                  });
                }
              }}
            >
              <option value="">Sin responsable</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Correo Electrónico</span>
            <input
              className="input"
              type="email"
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
            <input
              className="input"
              list="cities-list"
              value={form.city || ''}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
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
            <input
              className="input"
              list="departments-list"
              value={form.department || ''}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
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
                <input
                  className="input"
                  value={form.cpu || ''}
                  onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                  placeholder="ej. Intel Core i5-12400"
                />
              </label>
              <label className="block">
                <span className="label">Memoria RAM</span>
                <input
                  className="input"
                  value={form.ram || ''}
                  onChange={(e) => setForm({ ...form, ram: e.target.value })}
                  placeholder="ej. 16GB DDR4"
                />
              </label>
              <label className="block">
                <span className="label">Almacenamiento (Disco)</span>
                <input
                  className="input"
                  value={form.storage || ''}
                  onChange={(e) => setForm({ ...form, storage: e.target.value })}
                  placeholder="ej. 512GB SSD NVMe"
                />
              </label>
              <label className="block">
                <span className="label">Tarjeta de Video (GPU)</span>
                <input
                  className="input"
                  value={form.gpu || ''}
                  onChange={(e) => setForm({ ...form, gpu: e.target.value })}
                  placeholder="ej. NVIDIA GTX 1650"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Placa Madre (Motherboard)</span>
                <input
                  className="input"
                  value={form.motherboard || ''}
                  onChange={(e) => setForm({ ...form, motherboard: e.target.value })}
                  placeholder="ej. Gigabyte H610M"
                />
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

          <label className="block sm:col-span-2">
            <span className="label">Observaciones</span>
            <textarea
              className="input min-h-20"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="bg-zinc-50 dark:bg-slate-900/50 px-6 py-4 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800">
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

function Panel({ title, icon, children }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-slate-200 uppercase tracking-wider border-b border-zinc-100 dark:border-slate-800/80 pb-2">{icon}{title}</div>
      {children}
    </section>
  );
}

function DeviceCard({ device, onOpen, onConnectRdp, getSubnetLabel }) {
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
          <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">
            {device.responsible_user || 'Sin responsable'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-slate-400 font-mono mt-0.5">
            {device.ip}
          </p>
          <p className="text-xs text-zinc-400 dark:text-slate-500 font-semibold truncate mt-1">
            {device.hostname || 'Equipo sin nombre'}
          </p>
        </button>
        {device.managed && <span className="rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border border-sky-500/20 shadow-sm">Admin</span>}
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

function DeviceDrawer({ device, employees, token, onClose, onSaved, onConnectRdp, existingCities, existingDepartments, useLocalApi }) {
  const [form, setForm] = useState(device);

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
      await onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving device from drawer:', err);
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
        phone: ''
      }));
    } else {
      setForm(prev => ({
        ...prev,
        employee_id: emp.id,
        responsible_user: emp.full_name,
        email: emp.email || '',
        department: emp.department || '',
        city: emp.city || '',
        phone: emp.phone || ''
      }));
    }
  };

  const predefinedLocations = ['Matta', 'Diario', 'Casa'];
  const isCustomLocation = form.location && !predefinedLocations.includes(form.location);
  const [locationType, setLocationType] = useState(isCustomLocation ? 'Otro' : (form.location || 'Matta'));

  return (
    <div className="fixed inset-0 z-20 bg-slate-950/65 backdrop-blur-sm flex justify-end">
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900 border-l border-zinc-200 dark:border-slate-800 transition-all duration-300">
        <div className="flex items-start justify-between border-b border-zinc-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-950 dark:text-white">
              <Laptop className="text-emerald-500" size={22} />
              {form.hostname || form.ip}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1 font-mono">{form.ip} · {form.mac || 'MAC no detectada'} · {form.os || 'SO no identificado'}</p>
          </div>
          <button className="text-2xl text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-200 font-semibold" onClick={onClose}>×</button>
        </div>

        {/* Device Image Section */}
        <div className="mt-4 bg-zinc-50 dark:bg-slate-900 p-4 rounded-xl border border-zinc-200 dark:border-slate-800">
          <h4 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Foto del Equipo</h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {form.image_url ? (
              <div className="relative w-32 h-20 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex-shrink-0">
                <img src={form.image_url} alt="Equipo" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image_url: '' })}
                  className="absolute inset-0 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-xs font-bold transition duration-150"
                >
                  Cambiar / Eliminar
                </button>
              </div>
            ) : (
              <div className="w-32 h-20 rounded bg-zinc-100 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-slate-500">
                <Laptop size={32} />
              </div>
            )}
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
          </div>
        </div>

        {/* Remote Actions */}
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Acciones Remotas</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800" onClick={onConnectRdp}><Cable size={16} className="text-sky-500" /> RDP</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800" onClick={() => action('wake-on-lan')}><Play size={16} className="text-emerald-500" /> WOL</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800" onClick={() => action('restart')}><RefreshCw size={16} className="text-amber-500" /> Reinicio</button>
            <button className="button hover:bg-zinc-50 dark:hover:bg-slate-800" onClick={() => action('powershell')}><TerminalSquare size={16} className="text-indigo-500" /> Script</button>
          </div>
        </div>

        {/* General details */}
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-3 pb-1 border-b border-zinc-200 dark:border-slate-800">Detalles de Asignación y Ubicación</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Responsable</span>
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
              <span className="label">Cargo</span>
              <input className="input" value={form.job_title || ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Departamento</span>
              <input className="input" list="departments-list" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Ciudad</span>
              <input className="input" list="cities-list" value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
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
              <input className="input" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Estado Activo</span>
              <select className="input" value={form.asset_status || 'active'} onChange={(e) => setForm({ ...form, asset_status: e.target.value })}>
                <option value="active">Activo</option>
                <option value="retired">Retirado / De baja</option>
                <option value="maintenance">Mantenimiento</option>
              </select>
            </label>
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
              <input className="input" value={form.cpu || ''} onChange={(e) => setForm({ ...form, cpu: e.target.value })} placeholder="ej. Intel i7-13700 / Ryzen 7 7700" />
            </label>
            <label className="block">
              <span className="label">Memoria RAM</span>
              <input className="input" value={form.ram || ''} onChange={(e) => setForm({ ...form, ram: e.target.value })} placeholder="ej. 16GB DDR5 4800MHz" />
            </label>
            <label className="block">
              <span className="label">Almacenamiento</span>
              <input className="input" value={form.storage || ''} onChange={(e) => setForm({ ...form, storage: e.target.value })} placeholder="ej. 1TB NVMe SSD" />
            </label>
            <label className="block">
              <span className="label">Tarjeta de Video (GPU)</span>
              <input className="input" value={form.gpu || ''} onChange={(e) => setForm({ ...form, gpu: e.target.value })} placeholder="ej. NVIDIA RTX 4060 / Intel Iris Xe" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Placa Madre (Motherboard)</span>
              <input className="input" value={form.motherboard || ''} onChange={(e) => setForm({ ...form, motherboard: e.target.value })} placeholder="ej. ASUS Prime B760M-A" />
            </label>
          </div>
        </div>

        {/* Notes */}
        <label className="mt-6 block">
          <h3 className="text-xs font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider mb-2">Observaciones</h3>
          <textarea className="input min-h-24" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-2 border-t border-zinc-200 dark:border-slate-800 pt-4 pb-6">
          <button className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" onClick={save}>Guardar Cambios</button>
        </div>
      </aside>
    </div>
  );
}

function SubnetMap({ rows, getSubnetLabel }) {
  const grouped = rows.reduce((acc, row) => {
    acc[row.subnet] ||= [];
    acc[row.subnet].push(row);
    return acc;
  }, {});
  return <div className="grid gap-3 md:grid-cols-2">{Object.entries(grouped).map(([subnet, stats]) => (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-slate-800" key={subnet}>
      <div className="mb-2 font-bold text-xs uppercase tracking-wide text-zinc-600 dark:text-slate-400">{getSubnetLabel(subnet)}</div>
      <div className="flex h-3 overflow-hidden rounded bg-zinc-200 dark:bg-slate-800">
        {stats.map((row) => <div key={row.status} className={barColor(row.status)} style={{ width: `${Math.max(row.total * 8, 10)}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-slate-400">
        {stats.map((row) => <span key={row.status} className="font-semibold">{row.status}: {row.total}</span>)}
      </div>
    </div>
  ))}</div>;
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

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const isOffline =
          row.title?.toLowerCase().includes('fuera de linea') ||
          row.message?.toLowerCase().includes('offline') ||
          row.title?.toLowerCase().includes('se desconectó') ||
          row.message?.toLowerCase().includes('desconectó');

        const isOnline =
          row.title?.toLowerCase().includes('disponible nuevamente') ||
          row.message?.toLowerCase().includes('online') ||
          row.title?.toLowerCase().includes('volvió a estar disponible') ||
          row.message?.toLowerCase().includes('disponible');

        const device = devices?.find(d => d.id === row.device_id);
        const ip = row.ip || device?.ip;
        const hostname = row.hostname || device?.hostname;
        const responsible = row.responsible_user || device?.responsible_user;

        return (
          <div
            key={row.id}
            className={`
              border-b pb-3 last:border-0
              dark:border-slate-800
              ${
                isOffline
                  ? 'border-l-4 border-l-red-500 pl-2.5'
                  : isOnline
                  ? 'border-l-4 border-l-emerald-500 pl-2.5'
                  : ''
              }
            `}
          >
            <p
              className={`
                text-sm font-semibold
                ${
                  isOffline
                    ? 'text-red-400'
                    : isOnline
                    ? 'text-emerald-400'
                    : 'text-zinc-800 dark:text-slate-200'
                }
              `}
            >
              {kind === 'alert' ? row.title : row.message}
            </p>
            {(responsible || ip || hostname) && (
              <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 font-medium">
                {responsible || 'Equipo sin asignar'}
                {ip && ` · ${ip}`}
                {hostname && ` · ${hostname}`}
              </p>
            )}
            <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
              {new Date(row.created_at).toLocaleString()}
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

createRoot(document.getElementById('root')).render(<App />);
