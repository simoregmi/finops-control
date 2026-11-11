export type ServiceErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "DUPLICATE_KEY"
  | "VERSION_CONFLICT"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_STATE"
  | "PENDING_REQUEST_EXISTS"
  | "ALREADY_RESOLVED"
  | "STALE_REQUEST"
  | "SELF_APPROVAL_FORBIDDEN";

const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  DUPLICATE_KEY: 409,
  VERSION_CONFLICT: 409,
  CONFIRMATION_REQUIRED: 428,
  INVALID_STATE: 422,
  PENDING_REQUEST_EXISTS: 409,
  ALREADY_RESOLVED: 409,
  STALE_REQUEST: 409,
  SELF_APPROVAL_FORBIDDEN: 403,
};

export interface FieldIssue {
  path: string;
  message: string;
}

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: FieldIssue[],
  ) {
    super(message);
    this.name = "ServiceError";
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}
