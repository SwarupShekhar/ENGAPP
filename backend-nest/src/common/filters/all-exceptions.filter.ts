import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
            exception instanceof HttpException
                ? exception.getResponse()
                : {
                    statusCode: status,
                    message: exception.message || 'Internal server error',
                };

        // Logging the error
        const errorLog = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            message: exception.message || (typeof message === 'object' ? (message as any).message : message),
            responseBody: message, // Capture full response body including debug info
            stack: exception.stack,
        };

        this.logger.error(
            `${request.method} ${request.url} ${status} - ${exception.message}`,
            exception.stack,
        );

        // Write to a persistent log file in the project root
        try {
            const logFilePath = path.join(process.cwd(), 'error.log');
            fs.appendFileSync(logFilePath, JSON.stringify(errorLog) + '\n');
        } catch (e) {
            this.logger.error('Failed to write to error.log file', e.stack);
        }

        response.status(status).json(message);
    }
}
