import type { AxiosError } from 'axios';

/**
 * Get a user-friendly error message from auth API errors (login/register).
 * Handles network errors, validation details, and server error messages.
 */
export function getAuthErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ error?: string; details?: Array<{ msg?: string; message?: string }> }>;
  const response = axiosError.response;
  const data = response?.data;

  // Network error (backend not running, CORS, or no connection)
  if (!response) {
    const err = error as Error & { code?: string };
    if (err.code === 'ERR_NETWORK') {
      return 'Cannot connect to server. Make sure the backend is running on port 5000.';
    }
    if (err.message) {
      return err.message;
    }
    return 'Connection failed. Please try again.';
  }

  // Server returned an error body
  if (data?.error) {
    return data.error;
  }

  // Validation details - use first message
  const details = data?.details;
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    return (first.msg || (first as { message?: string }).message) || 'Validation failed';
  }

  // Fallback by status
  switch (response.status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Invalid email or password.';
    case 403:
      return data?.error || 'Access denied.';
    case 409:
      return data?.error || 'This email or username is already in use.';
    case 500:
      return data?.error || 'Server error. Please try again later.';
    default:
      return data?.error || 'Something went wrong. Please try again.';
  }
}

/**
 * Get all validation detail messages (for showing multiple toasts if needed).
 */
export function getAuthValidationDetails(error: unknown): string[] {
  const axiosError = error as AxiosError<{ details?: Array<{ msg?: string; message?: string }> }>;
  const details = axiosError.response?.data?.details;
  if (!Array.isArray(details)) return [];
  return details.map((d) => d.msg || (d as { message?: string }).message).filter(Boolean) as string[];
}
