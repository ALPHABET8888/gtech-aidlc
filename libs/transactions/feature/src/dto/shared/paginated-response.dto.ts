export class PaginationMeta {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
}

export class PaginatedResponseDto<T> {
  data!: T[];
  meta!: PaginationMeta;

  static create<T>(data: T[], total: number, page: number, limit: number): PaginatedResponseDto<T> {
    const response = new PaginatedResponseDto<T>();
    response.data = data;
    response.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
    return response;
  }
}
