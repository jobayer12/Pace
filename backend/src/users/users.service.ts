import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResult } from '../common/dto/paginated.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { User } from './user.entity';
import { UsersRepository } from './users.repository';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    const normalised = email.trim().toLowerCase();
    const user = await this.usersRepository.findByEmail(normalised);
    if (!user) {
      throw new NotFoundException(`User with email ${normalised} not found`);
    }
    return user;
  }

  async list({ page, limit }: ListUsersQueryDto): Promise<PaginatedResult<User>> {
    const offset = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.usersRepository.findPage(limit, offset),
      this.usersRepository.count(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async create(dto: CreateUserDto): Promise<User> {
    try {
      return await this.usersRepository.insert({
        email: dto.email,
        first_name: dto.firstName,
        last_name: dto.lastName,
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException(`A user with email ${dto.email} already exists`);
      }
      throw error;
    }
  }
}
