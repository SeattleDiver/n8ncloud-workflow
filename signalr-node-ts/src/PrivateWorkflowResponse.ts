export interface PrivateWorkflowResponse {
	RequestId: string;
	StatusCode: number;
	Path: string;
	Payload: string; // base64
}
