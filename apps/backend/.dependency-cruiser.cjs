/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-outer-layers',
      comment: 'domain/ must not depend on application/, infrastructure/, or presentation/.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/domain/',
        pathNot: '\\.spec\\.ts$',
      },
      to: { path: '^src/modules/[^/]+/(application|infrastructure|presentation)/' },
    },
    {
      name: 'application-no-outer-layers',
      comment: 'application/ must not depend on infrastructure/ or presentation/.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/application/',
        pathNot: '\\.spec\\.ts$',
      },
      to: { path: '^src/modules/[^/]+/(infrastructure|presentation)/' },
    },
    {
      name: 'presentation-no-infrastructure',
      comment: 'presentation/ must not depend on infrastructure/.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/presentation/',
        pathNot: '\\.spec\\.ts$',
      },
      to: { path: '^src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'application-no-nestjs-jwt',
      comment:
        'application/ use cases must not depend on a concrete JWT signing library — define a port (see ITokenSigner in modules/auth/application/token-signer.port.ts) and implement the adapter in infrastructure/.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/application/',
        pathNot: '\\.spec\\.ts$',
      },
      // Unanchored on purpose: pnpm resolves nested deps through
      // node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/..., not a flat
      // node_modules/<pkg>. Anchoring this with `^` breaks the match. The
      // trailing slash keeps the match anchored to the package boundary so
      // it doesn't also catch an unrelated `@nestjs/jwt-*` sibling package.
      to: { path: 'node_modules/@nestjs/jwt/' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
