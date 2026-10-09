export function assertNever(value: never, label = "value"): never {
  throw new Error(`Unexpected ${label}: ${JSON.stringify(value)}`);
}
