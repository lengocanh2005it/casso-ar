import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'casso_flow_authorizations' })
@Index(['organizationId'])
export class CassoFlowAuthorizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  businessId: string | null;

  @Column('text')
  encryptedApiKey: string;

  @Column('text')
  encryptedSecureToken: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
