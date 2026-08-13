import { ErrorCode } from '../errors/error-code';
import {
  ApiErrorResponse,
  errorResponseSchema,
} from './api-error-response.decorator';

describe('errorResponseSchema', () => {
  it('builds the standard error envelope for an error code', () => {
    const schema = errorResponseSchema(ErrorCode.RECEIVABLE_NOT_FOUND);

    expect(schema).toEqual({
      type: 'object',
      required: ['statusCode', 'errorCode', 'message'],
      properties: {
        statusCode: { type: 'number', example: 404 },
        errorCode: { type: 'string', example: ErrorCode.RECEIVABLE_NOT_FOUND },
        message: { type: 'string' },
        details: {},
      },
    });
  });
});

describe('ApiErrorResponse', () => {
  it('attaches one @ApiResponse per unique HTTP status', () => {
    class TestController {
      @ApiErrorResponse(
        ErrorCode.NOT_FOUND,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RECEIVABLE_NOT_FOUND,
      )
      run() {}
    }

    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      TestController.prototype.run,
    );

    expect(Object.keys(responses).sort()).toEqual(['400', '404']);
    expect(responses['400'].schema.properties.errorCode.example).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(responses['404'].schema.properties.errorCode.example).toBe(
      ErrorCode.RECEIVABLE_NOT_FOUND,
    );
  });

  it('supports zero error codes (no-op)', () => {
    class TestController {
      @ApiErrorResponse()
      run() {}
    }

    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      TestController.prototype.run,
    );
    expect(responses).toBeUndefined();
  });
});
