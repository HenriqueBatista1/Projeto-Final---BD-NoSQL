export class InsufficientStockError extends Error {
  constructor(readonly externalId: number) {
    super(`Insufficient stock for product ${externalId}`);
    this.name = "InsufficientStockError";
  }
}
