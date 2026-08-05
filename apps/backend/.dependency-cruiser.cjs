/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'application-no-nestjs-jwt',
      comment:
        'application/ use cases must not depend on a concrete JWT signing library — define a port (see ITokenSigner in modules/auth/application/token-signer.port.ts) and implement the adapter in infrastructure/.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application/' },
      // Unanchored on purpose: pnpm resolves nested deps through
      // node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/..., not a flat
      // node_modules/<pkg>. Anchoring this with `^` breaks the match.
      to: { path: 'node_modules/@nestjs/jwt' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
