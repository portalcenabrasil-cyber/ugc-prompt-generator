import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Users from './pages/Users';
import Costs from './pages/Costs';
import { getToken, redirectToLogin } from './api/client';

export default function App() {
  // Guard de autenticação — redireciona para login se não houver token
  useEffect(() => {
    if (!getToken()) redirectToLogin();
  }, []);

  return (
    <BrowserRouter basename="/admin">
      <Layout>
        <Routes>
          <Route path="/"      element={<Dashboard />} />
          <Route path="/sales" element={<Sales />}     />
          <Route path="/users" element={<Users />}     />
          <Route path="/costs" element={<Costs />}     />
          <Route path="*"      element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
