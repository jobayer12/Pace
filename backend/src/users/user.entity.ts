import { ApiProperty } from '@nestjs/swagger';

/**
 * Declared as a class rather than an interface so it can carry the OpenAPI
 * schema metadata; it is never instantiated (knexnest hydrates plain objects
 * that match this shape structurally).
 */
export class User {
  @ApiProperty({
    type: String,
    example: '1',
    description:
      'Primary key. This is a bigint, which exceeds Number.MAX_SAFE_INTEGER, so it is serialised as a string. Clients must not parse it as a JSON number.',
  })
  // `id` is a bigint, which exceeds Number.MAX_SAFE_INTEGER, so pg returns it
  // as a string and we keep it as one all the way out to the JSON response.
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
  // timestamptz comes back as a Date; Date#toJSON serialises it as an
  // ISO-8601 UTC string, which is the wire format above.
  createdAt!: Date;
}
