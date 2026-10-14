import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { OnboardingDraft } from '../onboarding.derive';

const SCREENS = ['step2', 'step3', 'step4', 'step5'] as const;

export class SaveDraftDto {
  @IsObject()
  draft!: OnboardingDraft;

  @IsOptional()
  @IsIn(SCREENS)
  screen?: (typeof SCREENS)[number];
}

export class ScreenDto {
  @IsIn(SCREENS)
  screen!: (typeof SCREENS)[number];
}

export class ImproveDescriptionDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  businessType?: string;
}

export class ModulesDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  modules!: string[];
}
