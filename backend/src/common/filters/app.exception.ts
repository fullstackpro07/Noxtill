import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this whenever a typed `{code, message}` error is needed beyond what
 * class-validator produces. The global HttpExceptionFilter renders it as
 * `{error:{code,message,fields?}}` per the API conventions (BE-013).
 */
export class AppException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
