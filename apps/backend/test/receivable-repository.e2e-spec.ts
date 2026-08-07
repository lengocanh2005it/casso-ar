import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from '../src/modules/receivables/infrastructure/typeorm-receivable.repository';

describe('TypeOrmReceivableRepository.findOpenTopNByOrganization (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repo: TypeOrmReceivableRepository;

  const organizationId = '00000000-0000-0000-0000-0000000000e1';
  const referenceDate = new Date('2026-08-15T00:00:00.000Z');

  const ids = {
    farPast: randomUUID(),
    nearPast: randomUUID(),
    exact: randomUUID(),
    nearFuture: randomUUID(),
    farFuture: randomUUID(),
  };

  function receivable(id: string, dueDate: Date) {
    return {
      id,
      organizationId,
      customerId: '00000000-0000-0000-0000-0000000000e2',
      invoiceId: null,
      originalAmount: 1_000_000,
      paidAmount: 0,
      dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [ReceivableOrmEntity],
          synchronize: true,
          retryAttempts: 0,
        }),
        TypeOrmModule.forFeature([ReceivableOrmEntity]),
      ],
      providers: [TypeOrmReceivableRepository, TenantContextService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    repo = moduleRef.get(TypeOrmReceivableRepository);

    await dataSource
      .getRepository(ReceivableOrmEntity)
      .save([
        receivable(ids.farPast, new Date('2026-01-01T00:00:00.000Z')),
        receivable(ids.nearPast, new Date('2026-08-12T00:00:00.000Z')),
        receivable(ids.exact, referenceDate),
        receivable(ids.nearFuture, new Date('2026-08-20T00:00:00.000Z')),
        receivable(ids.farFuture, new Date('2027-01-01T00:00:00.000Z')),
      ]);
  }, 60_000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('orders by closeness to the reference date, not by earliest dueDate', async () => {
    const rows = await repo.findOpenTopNByOrganization(
      organizationId,
      3,
      referenceDate,
    );

    expect(rows.map((row) => row.id)).toEqual([
      ids.exact,
      ids.nearPast,
      ids.nearFuture,
    ]);
  });
});
