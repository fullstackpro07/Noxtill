import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkflowVariable,
  WorkflowVariableEnvironment,
  WorkflowVariableScope,
  WorkflowVariableType,
} from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import {
  CreateWorkflowVariableDto,
  ListWorkflowVariablesDto,
  UpdateWorkflowVariableDto,
} from './dto/workflow-variable.dto';
import { WORKFLOW_VARIABLE_ERROR_CODES } from './workflows.constants';

const BUSINESS_SCOPE_KEY = '*';
const MAX_VARIABLES_PER_BUSINESS = 500;
const MAX_SERIALIZED_VALUE_LENGTH = 65_536;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_VALUES = 5_000;
const FORBIDDEN_JSON_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);
const SECRET_REFERENCE_PATTERN = /^env:[A-Z][A-Z0-9_]{0,127}$/;

type SafeWorkflowVariable = Omit<WorkflowVariable, 'secretReference'> & {
  scopeId: string | null;
  secretReferenceConfigured: boolean;
};

@Injectable()
export class WorkflowVariablesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string, query: ListWorkflowVariablesDto) {
    const where: Prisma.WorkflowVariableWhereInput = {
      businessId,
      environment: query.environment,
      scope: query.scope,
      ...(query.scopeId ? { scopeKey: query.scopeId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.tenantPrisma.client.workflowVariable.findMany({
        where,
        orderBy: [
          { environment: 'asc' },
          { scope: 'asc' },
          { name: 'asc' },
          { id: 'asc' },
        ],
        take: 500,
      }),
      this.tenantPrisma.client.workflowVariable.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toSafeVariable(row)),
      total,
      hasMore: total > rows.length,
    };
  }

  async create(
    businessId: string,
    userId: string,
    dto: CreateWorkflowVariableDto,
  ) {
    const total = await this.tenantPrisma.client.workflowVariable.count({
      where: { businessId },
    });
    if (total >= MAX_VARIABLES_PER_BUSINESS) {
      throw new AppException(
        WORKFLOW_VARIABLE_ERROR_CODES.LIMIT_REACHED,
        `A business can have at most ${MAX_VARIABLES_PER_BUSINESS} workflow variables.`,
        HttpStatus.CONFLICT,
      );
    }

    const scopeKey = await this.resolveScopeKey(
      businessId,
      dto.scope,
      dto.scopeId,
    );
    const environment =
      dto.environment ?? WorkflowVariableEnvironment.production;
    const value = this.resolveValue(dto.valueType, dto.value, dto.secretReference);

    try {
      const row = await this.tenantPrisma.client.workflowVariable.create({
        data: {
          businessId,
          scope: dto.scope,
          scopeKey,
          environment,
          name: dto.name,
          valueType: dto.valueType,
          value: value.value,
          secretReference: value.secretReference,
          description: dto.description?.trim() || null,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      return this.toSafeVariable(row);
    } catch (error) {
      this.throwForDatabaseError(error);
      throw error;
    }
  }

  async update(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateWorkflowVariableDto,
  ) {
    const existing = await this.tenantPrisma.client.workflowVariable.findFirst({
      where: { id, businessId },
    });
    if (!existing) this.notFound();

    const scope = dto.scope ?? existing.scope;
    const scopeId = this.getTargetScopeId(existing, scope, dto.scopeId);
    const scopeKey = await this.resolveScopeKey(businessId, scope, scopeId);
    const environment = dto.environment ?? existing.environment;
    const name = dto.name ?? existing.name;
    const valueType = dto.valueType ?? existing.valueType;
    const hasValue = Object.prototype.hasOwnProperty.call(dto, 'value');
    const value = this.resolveValue(
      valueType,
      hasValue ? dto.value : existing.value,
      valueType === WorkflowVariableType.secret_reference
        ? dto.secretReference ?? existing.secretReference ?? undefined
        : dto.secretReference,
      hasValue,
    );

    try {
      const result = await this.tenantPrisma.client.workflowVariable.updateMany({
        where: { id, businessId },
        data: {
          scope,
          scopeKey,
          environment,
          name,
          valueType,
          value: value.value,
          secretReference: value.secretReference,
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() || null }),
          updatedByUserId: userId,
        },
      });
      if (result.count !== 1) this.notFound();
      const updated = await this.tenantPrisma.client.workflowVariable.findFirst({
        where: { id, businessId },
      });
      if (!updated) this.notFound();
      return this.toSafeVariable(updated);
    } catch (error) {
      this.throwForDatabaseError(error);
      throw error;
    }
  }

  async remove(businessId: string, id: string) {
    const result = await this.tenantPrisma.client.workflowVariable.deleteMany({
      where: { id, businessId },
    });
    if (result.count !== 1) this.notFound();
    return { deleted: true };
  }

  private getTargetScopeId(
    existing: WorkflowVariable,
    targetScope: WorkflowVariableScope,
    requestedScopeId?: string | null,
  ): string | undefined {
    if (requestedScopeId !== undefined) return requestedScopeId || undefined;
    if (targetScope === existing.scope && targetScope !== 'business') {
      return existing.scopeKey;
    }
    return undefined;
  }

  private async resolveScopeKey(
    businessId: string,
    scope: WorkflowVariableScope,
    scopeId?: string | null,
  ): Promise<string> {
    if (scope === WorkflowVariableScope.business) {
      if (scopeId) this.invalidScope('Business variables do not take a scope ID.');
      return BUSINESS_SCOPE_KEY;
    }
    if (!scopeId?.trim()) {
      this.invalidScope('Choose the workflow or branch that owns this variable.');
    }

    if (scope === WorkflowVariableScope.workflow) {
      const workflow =
        await this.tenantPrisma.client.workflow.findFirst({
          where: { id: scopeId, businessId },
          select: { id: true },
        });
      if (!workflow) {
        this.invalidScope('The selected workflow does not belong to this business.');
      }
      return workflow.id;
    }

    const currentBusiness =
      await this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { parentId: true },
      });
    if (!currentBusiness) this.invalidScope('The current business was not found.');
    const rootId = currentBusiness.parentId ?? businessId;
    const branch = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopeId, parentId: rootId, active: true },
      select: { id: true },
    });
    if (!branch) {
      this.invalidScope('The selected active branch does not belong to this business group.');
    }
    return branch.id;
  }

  private resolveValue(
    type: WorkflowVariableType,
    input: unknown,
    secretReference?: string,
    hasInput = input !== undefined,
  ): {
    value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    secretReference: string | null;
  } {
    if (type === WorkflowVariableType.secret_reference) {
      if (
        hasInput ||
        !secretReference ||
        !SECRET_REFERENCE_PATTERN.test(secretReference)
      ) {
        this.invalidValue(
          'Secret variables must contain an env:VARIABLE_NAME reference only. Do not enter a secret value.',
        );
      }
      return { value: Prisma.DbNull, secretReference };
    }
    if (secretReference !== undefined) {
      this.invalidValue('Only secret-reference variables can contain a secret reference.');
    }
    if (!hasInput) this.invalidValue('Enter a value for this variable.');

    const validType =
      (type === WorkflowVariableType.string && typeof input === 'string') ||
      (type === WorkflowVariableType.number &&
        typeof input === 'number' &&
        Number.isFinite(input)) ||
      (type === WorkflowVariableType.boolean && typeof input === 'boolean') ||
      (type === WorkflowVariableType.json &&
        typeof input === 'object' &&
        input !== null);
    if (!validType) {
      this.invalidValue(`Value does not match the ${type} variable type.`);
    }

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(input);
    } catch {
      this.invalidValue('Variable value must be valid JSON data.');
    }
    if (!serialized || serialized.length > MAX_SERIALIZED_VALUE_LENGTH) {
      this.invalidValue(
        `Variable values must be ${MAX_SERIALIZED_VALUE_LENGTH} characters or fewer.`,
      );
    }
    if (type === WorkflowVariableType.json) {
      this.validateJsonObject(input);
    }
    return {
      value: input as Prisma.InputJsonValue,
      secretReference: null,
    };
  }

  private validateJsonObject(input: unknown) {
    const stack: Array<{ value: unknown; depth: number }> = [
      { value: input, depth: 0 },
    ];
    let valueCount = 0;
    while (stack.length > 0) {
      const current = stack.pop()!;
      valueCount += 1;
      if (
        current.depth > MAX_JSON_DEPTH ||
        valueCount > MAX_JSON_VALUES
      ) {
        this.invalidValue('JSON values may be at most 16 levels deep and contain 5000 values.');
      }
      if (Array.isArray(current.value)) {
        for (const value of current.value) {
          stack.push({ value, depth: current.depth + 1 });
        }
      } else if (
        typeof current.value === 'object' &&
        current.value !== null
      ) {
        for (const [key, value] of Object.entries(current.value)) {
          if (FORBIDDEN_JSON_KEYS.has(key)) {
            this.invalidValue(`JSON key "${key}" is not allowed.`);
          }
          stack.push({ value, depth: current.depth + 1 });
        }
      }
    }
  }

  private toSafeVariable(row: WorkflowVariable): SafeWorkflowVariable {
    const { secretReference, ...safe } = row;
    return {
      ...safe,
      scopeId: row.scope === WorkflowVariableScope.business ? null : row.scopeKey,
      secretReferenceConfigured: secretReference !== null,
    };
  }

  private throwForDatabaseError(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppException(
        WORKFLOW_VARIABLE_ERROR_CODES.DUPLICATE,
        'A variable with this name already exists in the selected scope and environment.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private notFound(): never {
    throw new AppException(
      WORKFLOW_VARIABLE_ERROR_CODES.NOT_FOUND,
      'Workflow variable not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private invalidValue(message: string): never {
    throw new AppException(
      WORKFLOW_VARIABLE_ERROR_CODES.INVALID_VALUE,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  private invalidScope(message: string): never {
    throw new AppException(
      WORKFLOW_VARIABLE_ERROR_CODES.INVALID_SCOPE,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
