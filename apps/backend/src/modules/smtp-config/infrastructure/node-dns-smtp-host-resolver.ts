import { lookup } from 'node:dns/promises';
import { Injectable } from '@nestjs/common';
import type { ISmtpHostResolver } from '../application/smtp-host-resolver.port';

@Injectable()
export class NodeDnsSmtpHostResolver implements ISmtpHostResolver {
  async resolve(host: string): Promise<readonly string[]> {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.map(({ address }) => address);
  }
}
