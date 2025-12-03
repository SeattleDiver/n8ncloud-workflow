export interface PrivateWorkflowRequest {
	requestId?: string;
	RequestId?: string;

	method?: string;
	Method?: string;

	path?: string;
	Path?: string;

	payload?: string; // may be base64 or JSON string
	Payload?: string;

	headers?: Record<string, string>;
	Headers?: Record<string, string>;

	sessionId?: string;
	SessionId?: string;
}
