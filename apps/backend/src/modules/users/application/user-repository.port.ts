import type { EntityManager } from 'typeorm';
import type { User } from '../domain/user';

export interface IUserRepository {
  findById(id: string, manager?: EntityManager): Promise<User | null>;
  findByEmail(email: string, manager?: EntityManager): Promise<User | null>;
  save(user: User, manager?: EntityManager): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
