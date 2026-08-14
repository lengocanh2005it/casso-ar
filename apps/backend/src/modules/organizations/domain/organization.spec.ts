import { Organization } from './organization';

function buildOrganization(
  overrides: Partial<Organization> = {},
): Organization {
  return new Organization({
    id: 'org-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('Organization', () => {
  it('lock() sets status to LOCKED', () => {
    const org = buildOrganization();
    expect(org.lock().status).toBe('LOCKED');
  });

  it('unlock() sets status to ACTIVE', () => {
    const org = buildOrganization({ status: 'LOCKED' });
    expect(org.unlock().status).toBe('ACTIVE');
  });

  it('lock() on an already-LOCKED organization is a no-op (still LOCKED)', () => {
    const org = buildOrganization({ status: 'LOCKED' });
    expect(org.lock().status).toBe('LOCKED');
  });
});
