import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty({
    example: 'alice@example.com',
    maxLength: 255,
    description: 'Trimmed and lower-cased before it is stored. Must be unique.',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'Alice', minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @ApiProperty({ example: 'Anderson', minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;
}
