/**
 * Shown while lazy route chunks load (**`React.Suspense`** in **`App.tsx`**).
 */
export function RouteFallback() {
  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1 items-center justify-center">
      <p className="text-muted text-sm">Loading…</p>
    </div>
  );
}
