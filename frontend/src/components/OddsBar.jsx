import React from 'react';

const OddsBar = ({ moneyA, moneyB }) => {
  const total = moneyA + moneyB;
  const pctA = total > 0 ? (moneyA / total) * 100 : 50;
  const pctB = total > 0 ? (moneyB / total) * 100 : 50;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.4rem' }}>BETTING MARKET</div>
      <div style={{
        height: '8px',
        width: '100%',
        display: 'flex',
        background: '#1e1e1e',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{ width: `${pctA}%`, background: '#2a6644', transition: 'width 0.5s ease' }} />
        <div style={{ width: `${pctB}%`, background: '#333', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.7rem' }}>
        <span>{pctA.toFixed(0)}% ON A</span>
        <span>{pctB.toFixed(0)}% ON B</span>
      </div>
      <div style={{ fontSize: '0.65rem', color: '#444', textAlign: 'center', marginTop: '0.3rem' }}>
        {total.toLocaleString()} COINS WAGERED
      </div>
    </div>
  );
};

export default OddsBar;
