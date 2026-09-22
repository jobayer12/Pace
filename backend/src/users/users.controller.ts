import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/dto/api-error.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponse } from './dto/paginated-users.response';
import { User } from './user.entity';
import { UsersService } from './users.service';

// bigint ids exceed Number.MAX_SAFE_INTEGER, so they are validated as digit
// strings and passed through to the query untouched.
const ID_PATTERN = /^\d+$/;

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List users (paginated)',
    description: 'Ordered by id ascending. Page size is capped at 100.',
  })
  @ApiOkResponse({ type: Array<User> })
  @ApiBadRequestResponse({
    description: 'page or limit outside the allowed range.',
    type: ApiErrorResponse,
  })
  list(@Query() query: ListUsersQueryDto): Promise<Array<User>> {
    return this.usersService.list(query);
  }

  @Get('email/:email')
  @ApiOperation({
    summary: 'Get a user by email',
    description: 'Case-insensitive: the value is lower-cased before the lookup.',
  })
  @ApiParam({ name: 'email', example: 'alice@example.com' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'No user with that email.', type: ApiErrorResponse })
  findByEmail(@Param('email') email: string): Promise<User> {
    return this.usersService.findByEmail(email);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({
    name: 'id',
    type: String,
    example: '1',
    description: 'Positive integer. A string, because the column is a bigint.',
  })
  @ApiOkResponse({ type: User })
  @ApiBadRequestResponse({ description: 'id is not a positive integer.', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'No user with that id.', type: ApiErrorResponse })
  findById(@Param('id') id: string): Promise<User> {
    if (!ID_PATTERN.test(id)) {
      throw new BadRequestException('id must be a positive integer');
    }
    return this.usersService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ type: User })
  @ApiBadRequestResponse({
    description: 'Validation failed, or the body carried unknown properties.',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({ description: 'That email is already taken.', type: ApiErrorResponse })
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }
}
