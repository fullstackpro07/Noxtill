import { IsString } from 'class-validator';

/** Manually registering a tag in the catalog (kind is always `manual` — `rule_based` tags are only
 * ever created by `CrmJobsProcessor.runTagRules`, never through this endpoint). */
export class CreateCustomerTagDto {
  @IsString()
  name!: string;
}
