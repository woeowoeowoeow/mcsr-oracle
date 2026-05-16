import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Bracket from './pages/Bracket';
import Matchup from './pages/Matchup';
import Leaderboard from './pages/Leaderboard';
import AuthCallback from './pages/AuthCallback';
import Admin from './pages/Admin';
import './index.css';

function Analytics() {
  const location = useLocation();

  useEffect(() => {
    if (window.goatcounter) {
      window.goatcounter.count({
        path: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
}

function App() {
  return (
    <Router>
      <Analytics />
      <div style={{ minHeight: '100vh', background: '#0d0d0d' }}>
        <Routes>
          <Route path="/" element={<Bracket />} />
          <Route path="/matchup/:id" element={<Matchup />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;