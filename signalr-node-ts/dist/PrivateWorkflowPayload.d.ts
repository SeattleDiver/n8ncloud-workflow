export type PrivateWorkflowPayload = {
    type: 'inline';
    value: string;
    length: number;
    isEncrypted?: boolean;
} | {
    type: 'reference';
    url: string;
    length: number;
    isEncrypted?: boolean;
};
//# sourceMappingURL=PrivateWorkflowPayload.d.ts.map