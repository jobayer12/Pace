import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResult, PaginationMeta } from '../../common/dto/paginated.dto';
import { User } from '../user.entity';

export class PaginatedUsersResponse implements PaginatedResult<User> {
  @ApiProperty({ type: [User] })
  data!: User[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
