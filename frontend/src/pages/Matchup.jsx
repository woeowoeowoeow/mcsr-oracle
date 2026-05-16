import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, orderBy as fbOrderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import UserBar, { Avatar } from "../components/UserBar";
import OddsBar from "../components/OddsBar";
import BetPanel from "../components/BetPanel";
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const LiveBetFeed = ({ matchupId }) => {
  const [bets, setBets] = useState([]);

  useEffect(() => {
    const fetchBets = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/matchups/${matchupId}/bets?limit=10`);
        setBets(resp.data);
      } catch {}
    };
    fetchBets();
    const interval = setInterval(fetchBets, 10000);
    return () => clearInterval(interval);
  }, [matchupId]);

  if (!bets.length) return null;

  return (
    <div style={{ marginTop: '2rem', border: '1px solid #222', borderRadius: '6px', padding: '1rem' }}>
      <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.8rem' }}>RECENT BETS</div>
      {bets.slice(0, 10).map((b, i) => (
        <div key={b.id || i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 0', fontSize: '0.7rem', borderBottom: i < Math.min(bets.length, 10) - 1 ? '1px solid #1a1a1a' : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Avatar uuid={b.mcsr_uuid} size={16} username={b.username} />
            <span style={{ color: '#888' }}>{b.username || '???'}</span>
          </div>
          <span style={{ color: '#4ade80' }}>+{b.amount} COINS</span>
        </div>
      ))}
    </div>
  );
};

const getFavColor = (prob) => {
  if (prob > 70) return '#4ade80';
  if (prob > 55) return '#86efac';
  return '#e0e0e0';
};

const Matchup = () => {
  const { id } = useParams();
  const [matchup, setMatchup] = useState(null);
  const [user, setUser] = useState(null);
  const [userBetOnMatchup, setUserBetOnMatchup] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matchups", id), async (docSnap) => {
      if (docSnap.exists()) {
        const resp = await axios.get(`${API_BASE}/matchups/${id}`);
        setMatchup(resp.data);
      }
    });

    const savedUserId = localStorage.getItem('mcsr_user_id');
    if (savedUserId) {
      const unsubUser = onSnapshot(doc(db, "users", savedUserId), (d) => {
        if (d.exists()) setUser({ id: d.id, ...d.data() });
      });
      const unsubBet = onSnapshot(
        query(collection(db, "bets"), where("user_id", "==", savedUserId), where("matchup_id", "==", id), fbOrderBy("created_at", "desc"), limit(1)),
        (snap) => {
          if (!snap.empty) setUserBetOnMatchup({ id: snap.docs[0].id, ...snap.docs[0].data() });
          else setUserBetOnMatchup(null);
        }
      );
      return () => { unsub(); unsubUser(); unsubBet(); };
    }
    return () => unsub();
  }, [id]);

  if (!matchup) return <div style={{ padding: '2rem', color: '#555' }}>LOADING...</div>;

  const isSettled = matchup.status === 'settled';
  const winProbA = matchup.bo5_a * 100;
  const winProbB = matchup.bo5_b * 100;
  const colorA = getFavColor(winProbA);
  const colorB = getFavColor(winProbB);

  function multColor(mult) {
    if (mult >= 5) return '#4ade80';
    if (mult >= 3) return '#86efac';
    if (mult >= 2) return '#a3a3a3';
    return '#555';
  }

  const OddsTag = ({ odds }) => (
    <span style={{ fontSize: '0.85rem', color: multColor(odds), marginLeft: '10px', fontWeight: odds >= 5 ? 'bold' : 'normal' }}>
      {odds.toFixed(1)}x
    </span>
  );

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1rem' }}>
      <UserBar />

      <Link to="/" style={{ fontSize: '0.7rem', color: '#555', marginBottom: '1rem', display: 'block' }}>← BACK TO BRACKET</Link>

      {isSettled && (
        <div style={{
          background: '#1a221a', border: '1px solid #2a6644', borderRadius: '6px',
          padding: '1rem', marginBottom: '1.5rem', textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '4px' }}>FINAL RESULT</div>
          <div style={{ fontSize: '1.5rem', color: '#4ade80' }}>
            🏆 {matchup.winner.toUpperCase()} WINS
          </div>
          {userBetOnMatchup && (
            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: userBetOnMatchup.payout > 0 ? '#4ade80' : '#f87171' }}>
              {userBetOnMatchup.payout > 0
                ? `YOU WON ${userBetOnMatchup.payout.toFixed(0)} COINS`
                : 'YOU LOST THIS BET'}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '3rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.3rem' }}>
            <Avatar uuid={matchup.uuid_a} size={32} username={matchup.player_a} />
            <h1 style={{ fontSize: '2rem', margin: 0, color: isSettled && matchup.winner === matchup.player_a ? '#4ade80' : colorA }}>
              {matchup.player_a}
              {!isSettled && <OddsTag odds={matchup.odds_a} />}
              {isSettled && matchup.winner !== matchup.player_a && <span style={{ color: '#f87171', marginLeft: '8px' }}>✗</span>}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.3rem' }}>
            <Avatar uuid={matchup.uuid_b} size={32} username={matchup.player_b} />
            <h1 style={{ fontSize: '2rem', margin: 0, color: isSettled && matchup.winner === matchup.player_b ? '#4ade80' : colorB }}>
              {matchup.player_b}
              {!isSettled && <OddsTag odds={matchup.odds_b} />}
              {isSettled && matchup.winner !== matchup.player_b && <span style={{ color: '#f87171', marginLeft: '8px' }}>✗</span>}
            </h1>
          </div>
          <div style={{ color: '#555', fontSize: '0.8rem', marginBottom: '2rem' }}>SEASON 10 PLAYOFFS</div>

          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '1rem' }}>SERIES BREAKDOWN (BO5)</div>
            {matchup.breakdown.map((row, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span>{row.label.toUpperCase()}</span>
                  <span style={{ color: i === 0 ? '#4ade80' : '#888' }}>{(row.prob * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: '4px', background: '#1e1e1e', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${row.prob * 100}%`,
                    background: i === 0 ? '#4ade80' : '#2a6644',
                    transition: 'width 1s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <OddsBar moneyA={matchup.money_a} moneyB={matchup.money_b} />
          <BetPanel matchup={matchup} user={user} onBetPlaced={() => {}} />

          <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #222', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.7rem', color: '#555', marginBottom: '0.5rem' }}>GAME ODDS</div>
            <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: colorA }}>{matchup.player_a.toUpperCase()}</span>
              <span style={{ color: multColor(matchup.odds_a), fontWeight: matchup.odds_a >= 5 ? 'bold' : 'normal' }}>{matchup.odds_a.toFixed(2)}x</span>
            </div>
            <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: colorB }}>{matchup.player_b.toUpperCase()}</span>
              <span style={{ color: multColor(matchup.odds_b), fontWeight: matchup.odds_b >= 5 ? 'bold' : 'normal' }}>{matchup.odds_b.toFixed(2)}x</span>
            </div>
          </div>

          {userBetOnMatchup && !isSettled && (
            <div style={{ marginTop: '1rem', padding: '0.8rem', border: '1px solid #2a6644', borderRadius: '6px', background: '#161616' }}>
              <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '4px' }}>YOUR BET</div>
              <div style={{ fontSize: '0.85rem', color: '#4ade80' }}>
                {userBetOnMatchup.amount} COINS ON {userBetOnMatchup.side === 'a' ? matchup.player_a : matchup.player_b}
              </div>
            </div>
          )}

          <LiveBetFeed matchupId={id} />
        </div>
      </div>
    </div>
  );
};

export default Matchup;
