import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
