/**
 * Custom error class for API-related errors.
 */
export class ApiError extends Error {
    public readonly statusCode?: number;
    public readonly endpoint: string;

    constructor(message: string, endpoint: string, statusCode?: number) {
        super(message);
        this.name = 'ApiError';
        this.endpoint = endpoint;
        this.statusCode = statusCode;
    }

    /**
     * Create an error from a failed fetch response.
     */
    static async fromResponse(response: Response, endpoint: string): Promise<ApiError> {
        let message: string;
        try {
            const data = await response.json();
            message = data.detail || data.message || response.statusText || 'Unknown error';
        } catch {
            message = response.statusText || 'Unknown error';
        }

        return new ApiError(
            message,
            endpoint,
            response.status
        );
    }

    /**
     * Create an error from a network or other error.
     */
    static fromError(error: Error, endpoint: string): ApiError {
        return new ApiError(
            error.message || 'Unknown error occurred',
            endpoint
        );
    }

    /**
     * Get a user-friendly error message.
     */
    getUserMessage(): string {
        if (this.statusCode === 404) {
            return 'The requested resource was not found.';
        }
        if (this.statusCode === 401 || this.statusCode === 403) {
            return 'You do not have permission to perform this action.';
        }
        if (this.statusCode === 413) {
            return 'The image is too large to process.';
        }
        if (this.statusCode && this.statusCode >= 500) {
            return 'The server encountered an error. Please try again later.';
        }
        return this.message || 'An unknown error occurred.';
    }

    /**
     * Get a detailed error message for logging.
     */
    getDetailedMessage(): string {
        return `API Error (${this.endpoint}): ${this.message}${
            this.statusCode ? ` [${this.statusCode}]` : ''
        }`;
    }
} 