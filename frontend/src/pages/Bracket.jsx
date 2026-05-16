import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import MatchupCard from "../components/MatchupCard";
import UserBar from "../components/UserBar";
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const LiveTicker = () => {
  const [bets, setBets] = useState([]);
  const tickerRef = useRef(null);

  useEffect(() => {
    const fetchBets = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/bets/recent?limit=30`);
        setBets(resp.data);
      } catch {}
    };
    fetchBets();
    const interval = setInterval(fetchBets, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!bets.length) return null;

  const items = bets.map(b =>
    `${b.username || '???'} +${b.amount} ${b.side === 'a' ? b.matchup?.player_a : b.matchup?.player_b}`
  );

  return (
    <div style={{
      overflow: 'hidden', whiteSpace: 'nowrap',
      border: '1px solid #222', borderRadius: '4px',
      padding: '6px 0', marginBottom: '1.5rem',
      background: '#161616', fontSize: '0.7rem', color: '#888'
    }}>
      <div ref={tickerRef} style={{
        display: 'inline-block',
        animation: 'ticker 40s linear infinite',
        paddingLeft: '100%'
      }}>
        {items.join('  •  ')}  •  {items.join('  •  ')}
      </div>
    </div>
  );
};

function toOdds(prob) {
  if (prob <= 0) return 100;
  return Math.round((1 / (prob * 0.95)) * 100) / 100;
}

const Bracket = () => {
  const [matchups, setMatchups] = useState([]);
  const [userBets, setUserBets] = useState([]);
  const [stats, setStats] = useState({ totalBets: 0, totalCoins: 0 });

  useEffect(() => {
    const q = query(collection(db, "matchups"), orderBy("created_at", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const mData = snapshot.docs.map(doc => {
        const data = doc.data();
        const p = data.current_prob_a || data.base_prob_a;
        const bo5_a = p**3 + 3*(p**3)*(1-p) + 6*(p**3)*((1-p)**2);
        return {
          id: doc.id, ...data, bo5_a,
          odds_a: toOdds(p),
          odds_b: toOdds(1 - p),
        };
      });
      setMatchups(mData);

      const active = mData.filter(m => m.status === 'open' || m.status === 'closed');
      const totalBets = active.length;
      const totalCoins = active.reduce((sum, m) => sum + (m.money_a || 0) + (m.money_b || 0), 0);
      setStats({ totalBets, totalCoins });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const savedUserId = localStorage.getItem('mcsr_user_id');
    const token = localStorage.getItem('mcsr_token');
    if (!savedUserId || !token) return;
    const fetchBets = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/bets/${savedUserId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUserBets(resp.data);
      } catch {}
    };
    fetchBets();
    const interval = setInterval(fetchBets, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1rem' }}>
      <UserBar />
      <LiveTicker />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#555', letterSpacing: '1px', marginBottom: '0.5rem' }}>SEASON 10 PLAYOFFS</div>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>ACTIVE MATCHUPS</h2>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#555' }}>
          <div>{stats.totalBets} ACTIVE BETS</div>
          <div>{stats.totalCoins.toLocaleString()} COINS IN PLAY</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {matchups.map(m => <MatchupCard key={m.id} matchup={m} userBets={userBets} />)}
      </div>
    </div>
  );
};

export default Bracket;
