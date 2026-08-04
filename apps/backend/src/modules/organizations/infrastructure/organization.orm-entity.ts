import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationOrmEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column()
  name: string;

  @Column()
  createdAt: Date;
}
