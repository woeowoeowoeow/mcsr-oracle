import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

let rateLimitCallback = null;

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 429 && rateLimitCallback) {
      rateLimitCallback();
    }
    return Promise.reject(error);
  }
);

const Avatar = ({ uuid, size = 24, username = '' }) => {
  const [failed, setFailed] = useState(false);
  if (!uuid || failed) {
    const initial = username ? username[0].toUpperCase() : '?';
    return (
      <span style={{
        width: size, height: size, borderRadius: '4px', marginRight: '6px',
        background: '#1e1e1e', display: 'inline-block', verticalAlign: 'middle',
        lineHeight: `${size}px`, textAlign: 'center', fontSize: `${Math.round(size * 0.45)}px`,
        color: '#555', fontWeight: 'bold', overflow: 'hidden'
      }}>{initial}</span>
    );
  }
  return (
    <img
      src={`https://visage.surgeplay.com/face/${size}/${uuid}`}
      alt=""
      style={{ width: size, height: size, borderRadius: '4px', marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }}
      onError={() => setFailed(true)}
    />
  );
};

const RateLimitBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    rateLimitCallback = () => {
      setVisible(true);
      setTimeout(() => setVisible(false), 10000);
    };
    return () => { rateLimitCallback = null; };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      background: '#2a1a1a', border: '1px solid #664444', borderRadius: '4px',
      padding: '8px 16px', marginBottom: '1rem', fontSize: '0.75rem', color: '#f87171',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span>API rate limited — please try again in a few minutes</span>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
    </div>
  );
};

const DiscordIcon = ({ fill = '#5865f2' }) => (
  <svg viewBox="0 0 127.14 96.36" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
    <path fill={fill} d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
  </svg>
);

const UserBar = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSec, setRefreshSec] = useState(0);
  const [initialising, setInitialising] = useState(true);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [mcsrUsername, setMcsrUsername] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const refreshTimer = useRef(null);
  const menuRef = useRef(null);
  const linkRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('mcsr_token');
    if (!token) {
      setInitialising(false);
      return;
    }
    axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(resp => {
      const userData = resp.data;
      localStorage.setItem('mcsr_user_id', userData.id);
      setUser(userData);
    }).catch(() => {
      localStorage.removeItem('mcsr_token');
      localStorage.removeItem('mcsr_user_id');
    }).finally(() => setInitialising(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const unsub = onSnapshot(doc(db, "users", userId), (d) => {
      if (d.exists()) {
        setUser(prev => prev ? { ...prev, ...d.data() } : prev);
      }
    });
    return () => unsub();
  }, [user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!showLinkForm) return;
    const handler = (e) => {
      if (linkRef.current && !linkRef.current.contains(e.target)) {
        setShowLinkForm(false);
        setLinkError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLinkForm]);

  const handleLinkMcsr = async (e) => {
    e.preventDefault();
    if (!mcsrUsername.trim()) return;
    setLinking(true);
    setLinkError('');
    try {
      const token = localStorage.getItem('mcsr_token');
      await axios.post(`${API_BASE}/auth/link-mcsr`, { mcsr_username: mcsrUsername.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowLinkForm(false);
      setMcsrUsername('');
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Failed to link account');
    } finally {
      setLinking(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mcsr_token');
    localStorage.removeItem('mcsr_user_id');
    setUser(null);
    setMenuOpen(false);
  };

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setRefreshSec(0);
    refreshTimer.current = setInterval(() => {
      setRefreshSec(s => s + 1);
    }, 1000);
    try {
      const token = localStorage.getItem('mcsr_token');
      const resp = await axios.get(`${API_BASE}/users/${user.id}/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(prev => prev ? { ...prev, balance: resp.data.balance } : prev);
    } catch {}
    clearInterval(refreshTimer.current);
    setRefreshing(false);
  }, [user]);

  if (initialising) return null;

  const displayName = user?.mcsr_username || user?.discord_username || '';
  const hasMcsr = !!user?.mcsr_username;

  return (
    <div>
      <RateLimitBanner />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 0', borderBottom: '1px solid #222', marginBottom: '2rem'
      }}>
        <Link to="/" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>MCSR ORACLE</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/leaderboard" style={{ fontSize: '0.7rem', color: '#555' }}>LEADERBOARD</Link>
          {user ? (
            <div style={{ textAlign: 'right', position: 'relative' }} ref={menuRef}>
              <div style={{ color: '#555', fontSize: '0.7rem' }}>LOGGED IN AS</div>
              <div
                onClick={() => setMenuOpen(o => !o)}
                style={{ color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
              >
                <DiscordIcon />
                {displayName.toUpperCase()}
              </div>
              <div style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                {!hasMcsr ? (
                  <span onClick={() => setShowLinkForm(true)} style={{ color: '#fbbf24', fontSize: '0.65rem', cursor: 'pointer', textDecoration: 'underline' }}>LINK MCSR ACCOUNT</span>
                ) : refreshing ? (
                  <span style={{ color: '#555', fontSize: '0.8rem' }}>LOADING {refreshSec}s</span>
                ) : (
                  <>
                    <span>{user.balance.toLocaleString()} COINS</span>
                    <button onClick={handleRefresh} style={{
                      background: 'none', border: '1px solid #333', borderRadius: '3px',
                      color: '#888', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px', lineHeight: '1'
                    }}>↻</button>
                  </>
                )}
              </div>
              {showLinkForm && (
                <div ref={linkRef} style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  background: '#161616', border: '1px solid #333', borderRadius: '4px',
                  padding: '12px', zIndex: 100, minWidth: '220px'
                }}>
                  <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '6px' }}>LINK YOUR MCSR ACCOUNT</div>
                  <form onSubmit={handleLinkMcsr}>
                    <input type="text" placeholder="MCSR USERNAME" value={mcsrUsername}
                      onChange={(e) => setMcsrUsername(e.target.value)}
                      style={{ width: '100%', background: '#0d0d0d', border: '1px solid #222', color: '#eee', padding: '6px 8px', fontFamily: 'monospace', borderRadius: '4px', fontSize: '0.7rem', marginBottom: '6px', boxSizing: 'border-box' }}
                    />
                    <button type="submit" disabled={linking} style={{ width: '100%', background: '#fbbf24', color: '#0d0d0d', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>
                      {linking ? 'LINKING...' : 'LINK'}
                    </button>
                  </form>
                  {linkError && <div style={{ fontSize: '0.65rem', color: '#f87171', marginTop: '6px' }}>{linkError}</div>}
                </div>
              )}
              {menuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  background: '#161616', border: '1px solid #333', borderRadius: '4px',
                  padding: '4px 0', zIndex: 100, minWidth: '120px'
                }}>
                  <button onClick={handleLogout} style={{
                    display: 'block', width: '100%', background: 'none', border: 'none',
                    color: '#f87171', cursor: 'pointer', padding: '8px 16px', fontSize: '0.75rem', textAlign: 'left'
                  }}>LOG OUT</button>
                </div>
              )}
            </div>
          ) : (
            <a
              href={`${API_BASE}/auth/discord/login`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#5865f2', color: '#fff', border: 'none', borderRadius: '4px',
                padding: '8px 16px', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'none'
              }}
            >
              <DiscordIcon fill="#fff" />
              LOGIN WITH DISCORD
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export { Avatar };
export default UserBar;
