import { PrivateWorkflowPayload } from './PrivateWorkflowPayload';

export interface PrivateWorkflowRequest {
	requestId?: string;
	RequestId?: string;

	method?: string;
	Method?: string;

	path?: string;
	Path?: string;

	payload?: PrivateWorkflowPayload;
	Payload?: PrivateWorkflowPayload;

	headers?: Record<string, string>;
	Headers?: Record<string, string>;

	sessionId?: string;
	SessionId?: string;
}
