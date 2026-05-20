import { IsUUID } from 'class-validator';

export class CreateCnReturnDto {
  @IsUUID()
  refGrReturnTxId!: string;

  @IsUUID()
  clearingId!: string;
}
