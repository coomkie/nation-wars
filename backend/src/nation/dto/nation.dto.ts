import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  flagUrl?: string;
}

export class UpdateNationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  flagUrl?: string;
}
