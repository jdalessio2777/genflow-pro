// B6: shown by AuthGate while a signed-in user's staff check is pending (first
// sign-in on this device only) or after it failed. A failed check never signs
// anyone out — it offers Retry (and a manual Sign out).
export default function StaffCheckScreen({ status, error, onRetry, onSignOut }) {
  if (status !== 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background" data-testid="staff-check-pending">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6" data-testid="staff-check-error">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t confirm your access</h1>
        <p className="text-sm text-muted-foreground">
          GenFlow couldn&apos;t reach the server to check your account. You&apos;re still signed in. Check your connection and try again.
        </p>
        {error && <p className="text-xs text-muted-foreground/80">{error}</p>}
        <button
          type="button"
          onClick={onRetry}
          className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-transform"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[44px] rounded-xl text-sm text-muted-foreground active:opacity-60"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
