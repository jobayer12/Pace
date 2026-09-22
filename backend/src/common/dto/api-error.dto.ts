import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponse {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    description:
      'A single message, or an array of messages when request validation produced more than one failure.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'User with id 999999 not found',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error!: string;
}
