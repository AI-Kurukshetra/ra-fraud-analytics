export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { success: true, data, meta };
}

export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}
