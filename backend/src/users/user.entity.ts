import { ApiProperty } from '@nestjs/swagger';

export class User {
  @ApiProperty({
    type: String,
    example: '1',
    description:
      'Primary key. This is a bigint, which exceeds Number.MAX_SAFE_INTEGER, so it is serialised as a string. Clients must not parse it as a JSON number.',
  })
  id!: string;

  @ApiProperty({ example: 'alice@example.com', maxLength: 255 })
  email!: string;

  @ApiProperty({ example: 'Alice', maxLength: 255 })
  firstName!: string;

  @ApiProperty({ example: 'Anderson', maxLength: 255 })
  lastName!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-21T17:04:39.859Z',
    description: 'Creation timestamp in UTC (ISO-8601).',
  })
  createdAt!: Date;
}
