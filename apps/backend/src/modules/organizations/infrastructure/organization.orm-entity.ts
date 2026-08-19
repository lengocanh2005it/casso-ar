import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED';

  @Column({ type: 'varchar', default: '' })
  taxCode: string;

  @Column({ type: 'boolean', default: false })
  taxCodeMatched: boolean;

  @Column({ type: 'varchar', nullable: true })
  taxCodeLookupName: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
