import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IUserRepository } from '../application/user-repository.port';
import { User } from '../domain/user';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: Repository<UserOrmEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<User | null> {
    const row = await (manager
      ? manager.getRepository(UserOrmEntity)
      : this.repo
    ).findOne({ where: { id } });
    return row ? new User(row) : null;
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const row = await (manager
      ? manager.getRepository(UserOrmEntity)
      : this.repo
    ).findOne({ where: { email } });
    return row ? new User(row) : null;
  }

  async save(user: User, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(UserOrmEntity) : this.repo).save(
      user,
    );
  }
}
