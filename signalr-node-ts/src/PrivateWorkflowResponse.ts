export interface PrivateWorkflowResponse {
	requestId: string;
	statusCode: number;
	path: string;
	payload: string; // base64
}
