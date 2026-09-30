import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { PreviewWorkflowDataMappingDto } from './dto/preview-workflow-data-mapping.dto';
import { previewWorkflowDataMapping } from './workflow-data-mapper.util';

@Injectable()
export class WorkflowDataMapperService {
  preview(dto: PreviewWorkflowDataMappingDto) {
    let serializedSource: string;
    try {
      serializedSource = JSON.stringify(dto.source);
    } catch {
      throw new AppException(
        'workflow.data_mapper_invalid_source',
        'Source must be valid JSON data.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (serializedSource.length > 65_536) {
      throw new AppException(
        'workflow.data_mapper_source_too_large',
        'Source data must be 65536 characters or fewer.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return previewWorkflowDataMapping(dto.source, dto.mappings);
  }
}
