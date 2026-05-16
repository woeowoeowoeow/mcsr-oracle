import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from './UserBar';

function multColor(mult) {
  if (mult >= 5) return '#4ade80';
  if (mult >= 3) return '#86efac';
  if (mult >= 2) return '#a3a3a3';
  return '#555';
}

const MatchupCard = ({ matchup, userBets = [] }) => {
  const navigate = useNavigate();

  const winProbA = matchup.bo5_a * 100;
  const winProbB = (1 - matchup.bo5_a) * 100;
  const isSettled = matchup.status === 'settled';
  const isClosed = matchup.status === 'closed';
  const isOpen = matchup.status === 'open';
  const userHasBet = userBets.some(b => b.matchup_id === matchup.id);
  const oddsA = matchup.odds_a || 0;
  const oddsB = matchup.odds_b || 0;

  const getFavColor = (prob) => {
    if (prob > 70) return '#4ade80';
    if (prob > 55) return '#86efac';
    return '#e0e0e0';
  };
  const colorA = getFavColor(winProbA);
  const colorB = getFavColor(winProbB);

  const OddsTag = ({ odds }) => (
    <span style={{
      fontSize: '0.6rem',
      color: multColor(odds),
      fontWeight: odds >= 5 ? 'bold' : 'normal',
      marginLeft: '6px'
    }}>
      {odds.toFixed(1)}x
    </span>
  );

  return (
    <div
      onClick={() => navigate(`/matchup/${matchup.id}`)}
      style={{
        background: '#161616',
        border: userHasBet ? '1px solid #2a6644' : '1px solid #222',
        borderLeft: userHasBet ? '4px solid #4ade80' : '1px solid #222',
        borderRadius: '6px',
        padding: '1rem',
        cursor: 'pointer',
        transition: 'border-color 0.2s, border-left 0.2s',
        marginBottom: '1rem',
        position: 'relative'
      }}
      onMouseEnter={(e) => { if (!userHasBet) e.currentTarget.style.borderColor = '#444'; }}
      onMouseLeave={(e) => { if (!userHasBet) e.currentTarget.style.borderColor = '#222'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
        <span style={{
          fontSize: '0.55rem',
          color: isSettled ? '#888' : (isOpen ? '#4ade80' : '#888'),
          background: isOpen ? 'transparent' : '#1e1e1e',
          border: isOpen ? '1px solid #2a6644' : '1px solid #333',
          borderRadius: '3px',
          padding: '1px 6px',
          letterSpacing: '1px'
        }}>
          {isSettled ? 'FINAL' : (isClosed ? 'CLOSED' : 'BETTING OPEN')}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#555' }}>
          {matchup.money_a + matchup.money_b > 0
            ? `${(matchup.money_a + matchup.money_b).toLocaleString()} COINS`
            : ''}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <span style={{ fontWeight: 'bold', color: isSettled && matchup.winner === matchup.player_a ? '#4ade80' : colorA }}>
          {isSettled && matchup.winner === matchup.player_a ? '🏆 ' : ''}
          <Avatar uuid={matchup.uuid_a} size={18} username={matchup.player_a} />
          {matchup.player_a.toUpperCase()}
          {!isSettled && <OddsTag odds={oddsA} />}
          {isSettled && matchup.winner !== matchup.player_a ? ' ✗' : ''}
        </span>
        <span style={{
          color: isSettled && matchup.winner === matchup.player_a ? '#4ade80' : (isSettled ? '#888' : colorA)
        }}>
          {winProbA.toFixed(1)}%
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <span style={{ fontWeight: 'bold', color: isSettled && matchup.winner === matchup.player_b ? '#4ade80' : colorB }}>
          {isSettled && matchup.winner === matchup.player_b ? '🏆 ' : ''}
          <Avatar uuid={matchup.uuid_b} size={18} username={matchup.player_b} />
          {matchup.player_b.toUpperCase()}
          {!isSettled && <OddsTag odds={oddsB} />}
          {isSettled && matchup.winner !== matchup.player_b ? ' ✗' : ''}
        </span>
        <span style={{
          color: isSettled && matchup.winner === matchup.player_b ? '#4ade80' : (isSettled ? '#888' : colorB)
        }}>
          {winProbB.toFixed(1)}%
        </span>
      </div>

      {!isSettled && (
        <div style={{ fontSize: '0.65rem', color: '#555', borderTop: '1px solid #1e1e1e', paddingTop: '0.5rem', textAlign: 'center' }}>
          CLICK FOR DETAILS + BETTING
        </div>
      )}
    </div>
  );
};

export default MatchupCard;
