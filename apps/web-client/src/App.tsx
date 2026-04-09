import { Suspense, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import {
  HomePage,
  LoginPage,
  RegisterPage,
  SettingsPage,
  VerifyEmailPage,
} from './routes/lazyPages';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RouteFallback } from './routes/RouteFallback';
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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path={ROUTES.home} element={<HomePage />} />
            <Route path={ROUTES.settings} element={<SettingsPage />} />
          </Route>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.register} element={<RegisterPage />} />
          <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
