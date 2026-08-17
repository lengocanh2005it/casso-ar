export function assertNotProduction(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new Error('Dev seed script refuses to run with NODE_ENV=production.');
  }
}
