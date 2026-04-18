import { useAuth } from '../common/hooks/useAuth';
import { HomePage, LandingPage } from './lazyPages';

/** **`/`** — **`HomePage`** when signed in; public **`LandingPage`** otherwise. */
export function HomeOrLanding() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <HomePage />;
  }
  return <LandingPage />;
}
