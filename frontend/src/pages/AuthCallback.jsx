import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthCallback = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('mcsr_token', token);
    }
    navigate('/');
  }, []);
  return <div style={{ color: '#e0e0e0', padding: '2rem' }}>Logging in...</div>;
};

export default AuthCallback;
