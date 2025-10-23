// // src/library/PrivateWorkflowResponseRegistry.ts
// export const PrivateWorkflowResponseRegistry = new Map<
// 	string,
// 	{ resolve: (data: any) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }
// >();


// PrivateWorkflowResponseRegistry.ts
interface RegistryEntry {
	resolve: (data: any) => void;
	reject: (err: any) => void;
	timeout: NodeJS.Timeout;
	isManual?: boolean;
}

const registry = new Map<string, RegistryEntry>();

export const PrivateWorkflowResponseRegistry = {
	set(id: string, entry: RegistryEntry) {
		registry.set(id, entry);
	},
	get(id: string) {
		return registry.get(id);
	},
	delete(id: string) {
		registry.delete(id);
	},
};
