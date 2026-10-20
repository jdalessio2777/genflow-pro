import { QueryClient, MutationCache } from '@tanstack/react-query';

// Feel Phase 3 (speed) — cache policy.
//
// - staleTime: a list or record fetched in the last 30 s is shown straight
//   from the cache when you come back to it (no refetch, no spinner).
//   Older data is still shown at once and refreshed in the background.
// - refetchOnWindowFocus: returning to the app (visibilitychange → visible)
//   refreshes whatever is on screen if it's older than staleTime (F-15:
//   a job rescheduled by the office shows up without navigating away).
// - Any successful write marks EVERY cached query stale (markAllStale, called
//   from the Supabase fetch wrapper and the MutationCache below). Queries on
//   screen keep their own explicit invalidations; everything else refetches
//   the next time it's shown. So a save is never followed by stale data on
//   another screen, even where a mutation forgot to invalidate a key —
//   the guarantee the old staleTime 0 gave, without refetching on every visit.
export const LIST_STALE_MS = 30_000;

let queryClientRef = null;

export function markAllStale() {
  // refetchType 'none': mark only — don't refetch on-screen queries here
  // (their mutation's own invalidation does that), so a save never causes
  // a burst of requests for the screen you're on.
  queryClientRef?.invalidateQueries({ refetchType: 'none' });
}

export const queryClientInstance = new QueryClient({
	mutationCache: new MutationCache({
		onSuccess: () => markAllStale(),
	}),
	defaultOptions: {
		queries: {
			staleTime: LIST_STALE_MS,
			refetchOnWindowFocus: true,
			retry: 1,
		},
	},
});
queryClientRef = queryClientInstance;

// Server routes (/api/*: payments, the completion email) also write to the
// database (payment state, send flags). A successful POST to one marks the
// cache stale the same way a direct Supabase write does.
export function installApiWriteTracking(win = typeof window !== 'undefined' ? window : null) {
	if (!win?.fetch || win.fetch.__gfTracked) return;
	const orig = win.fetch.bind(win);
	const tracked = async (input, init) => {
		const res = await orig(input, init);
		try {
			const url = typeof input === 'string' ? input : input?.url || '';
			const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
			if (res.ok && method !== 'GET' && method !== 'HEAD' && /^\/api\/|\/\/[^/]+\/api\//.test(url) && !/refresh-google-token/.test(url)) markAllStale();
		} catch { /* bookkeeping only */ }
		return res;
	};
	tracked.__gfTracked = true;
	win.fetch = tracked;
}
