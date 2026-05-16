import React, { useState, useEffect } from 'react';
import axios from 'axios';
import UserBar, { Avatar } from "../components/UserBar";
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const Leaderboard = () => {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/leaderboard`).then(resp => setUsers(resp.data));

    const savedUserId = localStorage.getItem('mcsr_user_id');
    if (savedUserId) {
      setCurrentUserId(savedUserId);
      const unsub = onSnapshot(doc(db, "users", savedUserId), () => {
        axios.get(`${API_BASE}/leaderboard`).then(resp => setUsers(resp.data));
      });
      return () => unsub();
    }
  }, []);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1rem' }}>
      <UserBar />
      <Link to="/" style={{ fontSize: '0.7rem', color: '#555', marginBottom: '1rem', display: 'block' }}>← BACK TO BRACKET</Link>
      <h2 style={{ marginBottom: '2rem' }}>LEADERBOARD</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ color: '#555', fontSize: '0.75rem', borderBottom: '1px solid #222' }}>
            <th style={{ padding: '12px' }}>#</th>
            <th style={{ padding: '12px' }}>USERNAME</th>
            <th style={{ padding: '12px', textAlign: 'right' }}>BALANCE</th>
            <th style={{ padding: '12px', textAlign: 'center' }}>W/L</th>
            <th style={{ padding: '12px', textAlign: 'right' }}>ROI</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => {
            const totalBets = u.wins + u.losses;
            return (
              <tr key={i} style={{
                borderBottom: '1px solid #161616',
                background: 'transparent',
                borderLeft: u.id === currentUserId ? '3px solid #4ade80' : '3px solid transparent'
              }}>
                <td style={{ padding: '12px', color: '#555' }}>#{i + 1}</td>
                <td style={{ padding: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Avatar uuid={u.mcsr_uuid} size={24} username={u.username} />
                  {u.username.toUpperCase()}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#4ade80' }}>{u.balance.toLocaleString()}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: totalBets > 0 ? '#888' : '#555' }}>
                  {totalBets > 0 ? `${u.wins}W ${u.losses}L` : '—'}
                </td>
                <td style={{
                  padding: '12px', textAlign: 'right',
                  color: u.roi > 0 ? '#4ade80' : (u.roi < 0 ? '#f87171' : '#555')
                }}>
                  {totalBets > 0 ? `${u.roi > 0 ? '+' : ''}${u.roi}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Leaderboard;
