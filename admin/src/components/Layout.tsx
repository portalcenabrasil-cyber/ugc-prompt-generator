import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Users, DollarSign, LogOut, Sun, Moon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const nav = [
  { to: '/',      icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales', icon: TrendingUp,      label: 'Vendas'    },
  { to: '/users', icon: Users,           label: 'Usuários'  },
  { to: '/costs', icon: DollarSign,      label: 'Custos'    },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('admin_theme') as 'dark' | 'light' | null;
    const initial = saved ?? 'dark';
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('admin_theme', next);
  }

  function handleLogout() {
    localStorage.removeItem('ugc_token');
    window.location.href = '/';
  }

  return (
    <div className="admin-app">
      {/* Sidebar */}
      <aside className="side">
        <div className="side-logo">U</div>

        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            className={({ isActive }) => `side-item${isActive ? ' active' : ''}`}
          >
            <Icon strokeWidth={1.8} />
          </NavLink>
        ))}

        <div className="side-bottom">
          <button
            className="side-item"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun strokeWidth={1.8} /> : <Moon strokeWidth={1.8} />}
          </button>
          <button
            className="side-item"
            title="Sair"
            onClick={handleLogout}
          >
            <LogOut strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, background: 'var(--m-bg)' }}>
        {children}
      </main>
    </div>
  );
}
