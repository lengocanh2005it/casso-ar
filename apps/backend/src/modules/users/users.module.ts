import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_REPOSITORY } from './application/user-repository.port';
import { TypeOrmUserRepository } from './infrastructure/typeorm-user.repository';
import { UserOrmEntity } from './infrastructure/user.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  providers: [{ provide: USER_REPOSITORY, useClass: TypeOrmUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
