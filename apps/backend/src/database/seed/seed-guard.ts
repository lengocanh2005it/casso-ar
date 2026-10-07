const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertNotProduction(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new Error('Dev seed script refuses to run with NODE_ENV=production.');
  }
}

export function assertLocalDatabaseHost(host: string | undefined): void {
  if (!host || !LOCAL_DATABASE_HOSTS.has(host.trim().toLowerCase())) {
    throw new Error(
      'Payment-history demo seed requires a local database host.',
    );
  }
}
