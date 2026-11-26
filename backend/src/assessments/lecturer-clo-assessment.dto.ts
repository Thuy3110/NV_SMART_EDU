import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LecturerCloRateDto {
  @IsInt()
  @Min(1)
  courseId!: number;

  @IsInt()
  @Min(1)
  cloId!: number;

  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  attainmentRate!: number | null;
}

export class CourseCloRateDto {
  @IsOptional()
  @IsInt()
  courseId?: number;

  @IsInt()
  @Min(1)
  cloId!: number;

  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  attainmentRate!: number | null;
}

export class StudentCloScoreInputDto {
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @IsInt()
  @Min(1)
  cloId!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10)
  score!: number;
}

export class SaveLecturerCloAssessmentsDto {
  @IsInt()
  @Min(1)
  majorId!: number;

  @IsInt()
  @Min(1900)
  academicYear!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LecturerCloRateDto)
  @ArrayUnique(
    (item: LecturerCloRateDto) =>
      `${item?.courseId ?? ''}:${item?.cloId ?? ''}`,
  )
  assessments!: LecturerCloRateDto[];
}

export class SaveCourseCloAssessmentsDto {
  @IsInt()
  @Min(1)
  courseId!: number;

  @IsInt()
  @Min(1900)
  academicYear!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseCloRateDto)
  @ArrayUnique((item: CourseCloRateDto) => `${item?.cloId ?? ''}`)
  assessments!: CourseCloRateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentCloScoreInputDto)
  @ArrayUnique(
    (item: StudentCloScoreInputDto) =>
      `${typeof item?.studentCode === 'string' ? item.studentCode.trim().toUpperCase() : ''}:${item?.cloId ?? ''}`,
  )
  studentScores?: StudentCloScoreInputDto[];
}

export class AssignLecturerCoursesDto {
  @IsInt()
  @Min(1)
  userId!: number;

  @IsArray()
  @IsInt({ each: true })
  courseIds!: number[];

  @IsOptional()
  @IsInt()
  @Min(1900)
  academicYear?: number;
}
