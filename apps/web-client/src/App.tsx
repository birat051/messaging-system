import { useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ROUTES } from './routes/paths';
import { setNavigateHandler } from './routes/navigation';

function NavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigateHandler(navigate);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <>
      <NavigationBridge />
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
        </Route>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.register} element={<RegisterPage />} />
        <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
      </Routes>
    </>
  );
}
