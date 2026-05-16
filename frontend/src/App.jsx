import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Bracket from './pages/Bracket';
import Matchup from './pages/Matchup';
import Leaderboard from './pages/Leaderboard';
import AuthCallback from './pages/AuthCallback';
import './index.css';

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#0d0d0d' }}>
        <Routes>
          <Route path="/" element={<Bracket />} />
          <Route path="/matchup/:id" element={<Matchup />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;