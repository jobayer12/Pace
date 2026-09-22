import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 1, description: 'Current page, 1-based.' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Page size actually applied.' })
  limit!: number;

  @ApiProperty({ example: 25, description: 'Total rows matching the query.' })
  total!: number;

  @ApiProperty({ example: 2, description: 'Total pages; 0 when there are no rows.' })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
