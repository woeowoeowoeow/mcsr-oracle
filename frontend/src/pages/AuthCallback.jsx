import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const AuthCallback = () => {
  const [params] = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      localStorage.setItem('mcsr_token', token);
    }
    window.location.href = '/';
  }, [params]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#555' }}>
      Logging in...
    </div>
  );
};

export default AuthCallback;
