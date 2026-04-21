import { Suspense, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import {
  GuestEntryPage,
  LoginPage,
  PrivacyPolicyPage,
  RegisterPage,
  SettingsPage,
  TermsAndConditionsPage,
  VerifyEmailPage,
} from './routes/lazyPages';
import { HomeOrLanding } from './routes/HomeOrLanding';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RegisteredOnlyRoute } from './routes/RegisteredOnlyRoute';
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NavigationBridge />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path={ROUTES.home} element={<HomeOrLanding />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<RegisteredOnlyRoute />}>
              <Route path={ROUTES.settings} element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.guest} element={<GuestEntryPage />} />
          <Route path={ROUTES.register} element={<RegisterPage />} />
          <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={ROUTES.privacy} element={<PrivacyPolicyPage />} />
          <Route path={ROUTES.terms} element={<TermsAndConditionsPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}
