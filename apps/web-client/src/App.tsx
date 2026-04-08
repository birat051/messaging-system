import { ThemeToggle } from './components/ThemeToggle';
import { ThemeProvider } from './theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              Messaging
            </h1>
            <p className="text-muted mt-1 text-sm">
              web-client — Vite, React, TypeScript, Tailwind
            </p>
          </div>
          <ThemeToggle />
        </header>
        <main className="rounded-card border-border bg-surface shadow-card border p-6">
          <p className="text-foreground">
            Semantic tokens: <code className="text-accent">background</code>,{' '}
            <code className="text-accent">surface</code>,{' '}
            <code className="text-accent">accent</code> — switch theme with the
            control above.
          </p>
        </main>
      </div>
    </ThemeProvider>
  );
}
