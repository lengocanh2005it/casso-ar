import { lookup } from 'node:dns/promises';
import { NodeDnsSmtpHostResolver } from './node-dns-smtp-host-resolver';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

describe('NodeDnsSmtpHostResolver', () => {
  it('returns every address from the DNS lookup', async () => {
    jest.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2001:db8::1', family: 6 },
    ] as any);

    await expect(
      new NodeDnsSmtpHostResolver().resolve('smtp.example.com'),
    ).resolves.toEqual(['93.184.216.34', '2001:db8::1']);
    expect(lookup).toHaveBeenCalledWith('smtp.example.com', {
      all: true,
      verbatim: true,
    });
  });
});
