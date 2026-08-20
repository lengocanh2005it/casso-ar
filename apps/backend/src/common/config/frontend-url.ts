export function buildFrontendUrl(path: string): string {
  return `${process.env.CORS_ORIGIN ?? 'http://localhost:5173'}${path}`;
}
