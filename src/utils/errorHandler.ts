import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL, IMMUNIZATION_SERVER_IIS_FHIR_URL, IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL } from '../config';

export interface ErrorInfo {
  message: string;
  details?: string;
  code?: string;
}

export function getErrorMessage(err: any, endpoint: string, serverType: 'local' | 'immunization' | 'tefca' = 'local'): ErrorInfo {
  const serverUrl = serverType === 'local' ? IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL :
                   serverType === 'immunization' ? IMMUNIZATION_SERVER_IIS_FHIR_URL :
                   IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL;

  // Connection errors
  if (err.code === 'ECONNREFUSED') {
    return {
      message: 'Cannot connect to FHIR server',
      details: `The FHIR server at ${serverUrl} is not responding. Please check if the server is running.`,
      code: 'ECONNREFUSED'
    };
  }

  if (err.code === 'ENOTFOUND') {
    return {
      message: 'FHIR server not found',
      details: `Cannot resolve the hostname for ${serverUrl}. Please check your network connection and server configuration.`,
      code: 'ENOTFOUND'
    };
  }

  if (err.code === 'ETIMEDOUT') {
    return {
      message: 'Connection to FHIR server timed out',
      details: `The request to ${endpoint} timed out. The server may be overloaded or experiencing issues.`,
      code: 'ETIMEDOUT'
    };
  }

  if (err.code === 'ECONNRESET') {
    return {
      message: 'Connection to FHIR server was reset',
      details: `The connection to ${serverUrl} was unexpectedly closed. Please try again.`,
      code: 'ECONNRESET'
    };
  }

  if (err.code === 'ENETUNREACH') {
    return {
      message: 'Network unreachable',
      details: `Cannot reach the network. Please check your internet connection.`,
      code: 'ENETUNREACH'
    };
  }

  // Server response errors
  if (err.response) {
    const status = err.response.status;
    const statusText = err.response.statusText;
    const data = err.response.data;

    if (status === 404) {
      return {
        message: 'Resource not found',
        details: `The requested resource at ${endpoint} was not found on the FHIR server.`,
        code: 'NOT_FOUND'
      };
    }

    if (status === 401) {
      return {
        message: 'Authentication required',
        details: `Authentication is required to access ${endpoint}. Please provide valid credentials.`,
        code: 'UNAUTHORIZED'
      };
    }

    if (status === 403) {
      return {
        message: 'Access forbidden',
        details: `Access to ${endpoint} is forbidden. Please check your permissions.`,
        code: 'FORBIDDEN'
      };
    }

    if (status === 429) {
      return {
        message: 'Too many requests',
        details: `Rate limit exceeded for ${endpoint}. Please wait before making another request.`,
        code: 'RATE_LIMITED'
      };
    }

    if (status >= 500) {
      return {
        message: 'FHIR server error',
        details: `The FHIR server returned an error (${status} ${statusText}). Please try again later.`,
        code: 'SERVER_ERROR'
      };
    }

    return {
      message: `HTTP ${status} Error`,
      details: data?.message || data?.error || statusText || 'An error occurred while processing your request.',
      code: `HTTP_${status}`
    };
  }

  // Request configuration errors
  if (err.code === 'ERR_INVALID_URL') {
    return {
      message: 'Invalid URL',
      details: `The URL ${endpoint} is not valid. Please check the server configuration.`,
      code: 'INVALID_URL'
    };
  }

  // Network or other errors
  return {
    message: 'Network error',
    details: err.message || 'An unexpected error occurred while connecting to the FHIR server.',
    code: 'NETWORK_ERROR'
  };
}

export function createErrorResponse(err: any, endpoint: string, serverType: 'local' | 'immunization' | 'tefca' = 'local', additionalData?: any) {
  const errorInfo = getErrorMessage(err, endpoint, serverType);

  return {
    error: errorInfo.message,
    details: errorInfo.details,
    code: errorInfo.code,
    endpoint: endpoint,
    timestamp: new Date().toISOString(),
    ...additionalData
  };
}

export function getHttpStatus(err: any): number {
  if (err.response) {
    return err.response.status;
  }

  // Connection errors should return 503 (Service Unavailable)
  if (err.code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH'].includes(err.code)) {
    return 503;
  }

  // Default to 500 for other errors
  return 500;
}