import { IsEnum } from 'class-validator';

export enum JOStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export class UpdateJoStatusDto {
  @IsEnum(JOStatus)
  status!: JOStatus;
}
