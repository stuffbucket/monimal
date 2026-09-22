export interface ActiveOperation {
  operationId: string;
  completedBytes?: number;
  phase?: string;
  totalBytes?: number;
}
