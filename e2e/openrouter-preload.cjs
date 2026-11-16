// Test process only: redirect the fixed OpenRouter connection to the fake AI.
// Refuse real OpenRouter traffic if the test fixture is not configured.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'openrouter.ai') {
    const port = process.env.FAKE_AI_PORT;
    if (!port) throw new Error('FAKE_AI_PORT is required for OpenRouter browser tests');
    return originalFetch(new URL(`/v1${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, `http://127.0.0.1:${port}`), init);
  }
  return originalFetch(input, init);
};
