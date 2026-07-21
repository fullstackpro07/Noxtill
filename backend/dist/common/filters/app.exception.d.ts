import { HttpException, HttpStatus } from '@nestjs/common';
export declare class AppException extends HttpException {
    constructor(code: string, message: string, status?: HttpStatus);
}
