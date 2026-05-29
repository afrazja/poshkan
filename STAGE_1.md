# Poshkan Stage 1

Stage 1 is the foundation for AI-controlled paper trading.

At this stage:

- Paper trades are routed through a backend broker endpoint instead of only changing browser state.
- The backend verifies the signed-in Supabase user session.
- The backend fetches the current market quote before executing a paper buy or sell.
- The backend updates Supabase `accounts`, `positions`, and `trades`.
- The existing UI uses the same paper broker endpoint that a future Claude assistant should use.
- If the user is not signed in, the app can still use local-only paper trading as a fallback.

Stage 1 does not include Claude chat, autonomous trading rules, AI settings, or AI action logs yet.
