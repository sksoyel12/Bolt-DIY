declare module '@remix-run/node' {
  interface AppLoadContext {
    cloudflare?: Record<string, unknown>;
  }
}
export {};
