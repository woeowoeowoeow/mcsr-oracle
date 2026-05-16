import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const BetPanel = ({ matchup, user, onBetPlaced }) => {
  const [side, setSide] = useState('a');
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [betType, setBetType] = useState('winner');
  const [predictedOutcome, setPredictedOutcome] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (matchup.status === 'settled') {
    return (
      <div style={{ padding: '1.5rem', border: '1px solid #222', borderRadius: '6px', background: '#161616' }}>
        <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.8rem' }}>RESULT</div>
        <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          🏆 {matchup.winner.toUpperCase()} WINS
        </div>
        <div style={{ fontSize: '0.75rem', color: '#555' }}>
          {matchup.player_a.toUpperCase()} vs {matchup.player_b.toUpperCase()}
        </div>
      </div>
    );
  }

  if (matchup.status === 'closed') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #222', borderRadius: '6px', color: '#555' }}>
        BETTING CLOSED
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #222', borderRadius: '6px', color: '#555' }}>
        VERIFY YOUR USERNAME ABOVE TO PLACE BETS
      </div>
    );
  }

  const currentOdds = side === 'a' ? matchup.odds_a : matchup.odds_b;
  const isExactResult = betType === 'exact_result';

  const getOutcomeOdds = (label) => {
    const outcome = matchup.breakdown.find(o => o.label === label);
    if (!outcome) return 0;
    return 1 / ((outcome.prob || 0.001) * 0.95);
  };

  const potentialPayout = isExactResult && predictedOutcome
    ? amount * getOutcomeOdds(predictedOutcome)
    : amount * currentOdds;

  const handlePlaceBet = async () => {
    if (amount < 10) return alert("Min bet is 10");
    if (amount > user.balance) return alert("Insufficient balance");
    if (isExactResult && !predictedOutcome) return alert("Select an exact result");

    setLoading(true);
    try {
      const token = localStorage.getItem('mcsr_token');
      await axios.post(`${API_BASE}/bets`, {
        matchup_id: matchup.id,
        side,
        amount: Number(amount),
        bet_type: betType,
        predicted_outcome: isExactResult ? predictedOutcome : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfirmed(true);
      onBetPlaced();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to place bet");
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #2a6644', borderRadius: '6px', background: '#161616' }}>
        <div style={{ color: '#4ade80', fontSize: '1.1rem', marginBottom: '0.5rem' }}>BET PLACED ✓</div>
        <div style={{ fontSize: '0.8rem', color: '#888' }}>
          {amount} COINS ON {isExactResult ? predictedOutcome.toUpperCase() : (side === 'a' ? matchup.player_a : matchup.player_b).toUpperCase()}
        </div>
      </div>
    );
  }

  function multColor(mult) {
    if (mult >= 5) return '#4ade80';
    if (mult >= 3) return '#86efac';
    if (mult >= 2) return '#a3a3a3';
    return '#555';
  }

  return (
    <div style={{ background: '#161616', padding: '1.5rem', borderRadius: '6px', border: '1px solid #222' }}>
      <div style={{ marginBottom: '1rem', borderBottom: '1px solid #1e1e1e', paddingBottom: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.75rem' }}>{matchup.player_a.toUpperCase()}</span>
          <span style={{ fontSize: '0.8rem', color: multColor(matchup.odds_a), fontWeight: matchup.odds_a >= 5 ? 'bold' : 'normal' }}>
            {(matchup.bo5_a * 100).toFixed(1)}%  <span style={{ fontSize: '0.65rem' }}>({matchup.odds_a.toFixed(1)}x)</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem' }}>{matchup.player_b.toUpperCase()}</span>
          <span style={{ fontSize: '0.8rem', color: multColor(matchup.odds_b), fontWeight: matchup.odds_b >= 5 ? 'bold' : 'normal' }}>
            {(matchup.bo5_b * 100).toFixed(1)}%  <span style={{ fontSize: '0.65rem' }}>({matchup.odds_b.toFixed(1)}x)</span>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setBetType('winner')}
          style={{
            flex: 1, padding: '6px', fontSize: '0.65rem',
            background: betType === 'winner' ? '#2a6644' : 'transparent',
            color: '#eee', border: '1px solid #333',
            cursor: 'pointer', borderRadius: '4px'
          }}
        >WINNER</button>
        <button
          onClick={() => setBetType('exact_result')}
          style={{
            flex: 1, padding: '6px', fontSize: '0.65rem',
            background: betType === 'exact_result' ? '#2a6644' : 'transparent',
            color: '#eee', border: '1px solid #333',
            cursor: 'pointer', borderRadius: '4px'
          }}
        >EXACT RESULT</button>
      </div>

      <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '1rem' }}>
        {isExactResult ? 'PICK THE EXACT SERIES SCORE' : 'PLACE YOUR BET'}
      </div>

      {isExactResult ? (
        <div style={{ marginBottom: '1.5rem' }}>
          {matchup.breakdown.map((outcome, i) => {
            const odds = getOutcomeOdds(outcome.label);
            const isSelected = predictedOutcome === outcome.label;
            return (
              <div
                key={i}
                onClick={() => {
                  setPredictedOutcome(outcome.label);
                  const isA = outcome.label.startsWith(matchup.player_a);
                  setSide(isA ? 'a' : 'b');
                }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', marginBottom: '4px',
                  background: isSelected ? '#1e2a22' : 'transparent',
                  border: isSelected ? '1px solid #4ade80' : '1px solid #222',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem'
                }}
              >
                <span style={{ color: isSelected ? '#4ade80' : '#ccc' }}>{outcome.label.toUpperCase()}</span>
                <span style={{ color: isSelected ? '#4ade80' : '#888' }}>
                  {(outcome.prob * 100).toFixed(1)}% — {odds.toFixed(2)}x
                </span>
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setSide('a')}
          style={{
            flex: 1, padding: '12px', background: 'transparent', color: '#eee',
            border: side === 'a' ? '1px solid #4ade80' : '1px solid #222',
            cursor: 'pointer', borderRadius: '4px'
          }}
        >
          {matchup.player_a.toUpperCase()}
          <span style={{ fontSize: '0.6rem', color: matchup.odds_a >= 2 ? '#a3a3a3' : '#555', fontWeight: matchup.odds_a >= 5 ? 'bold' : 'normal', marginLeft: '4px' }}>
            {matchup.odds_a.toFixed(1)}x
          </span>
        </button>
        <button
          onClick={() => setSide('b')}
          style={{
            flex: 1, padding: '12px', background: 'transparent', color: '#eee',
            border: side === 'b' ? '1px solid #4ade80' : '1px solid #222',
            cursor: 'pointer', borderRadius: '4px'
          }}
        >
          {matchup.player_b.toUpperCase()}
          <span style={{ fontSize: '0.6rem', color: matchup.odds_b >= 2 ? '#a3a3a3' : '#555', fontWeight: matchup.odds_b >= 5 ? 'bold' : 'normal', marginLeft: '4px' }}>
            {matchup.odds_b.toFixed(1)}x
          </span>
        </button>
      </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.7rem', color: '#555', display: 'block', marginBottom: '0.5rem' }}>AMOUNT (MIN 10)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          min={10}
          max={user?.balance || 0}
          style={{
            width: '100%', background: '#0d0d0d', border: '1px solid #222', color: '#4ade80',
            padding: '12px', borderRadius: '4px', fontSize: '1.1rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#888' }}>
        <span>POTENTIAL PAYOUT:</span>
        <span style={{ color: '#4ade80' }}>{potentialPayout.toFixed(0)} COINS</span>
      </div>

      <button
        onClick={handlePlaceBet}
        disabled={loading}
        style={{
          width: '100%',
          padding: '14px',
          background: '#2a6644',
          color: '#eee',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {loading ? 'PROCESSING...' : 'PLACE BET'}
      </button>
    </div>
  );
};

export default BetPanel;
