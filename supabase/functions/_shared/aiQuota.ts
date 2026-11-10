/** Tester bypass from Profile → Developer → Remove AI daily limits. */
export function bypassAiLimit(body: Record<string, unknown>): boolean {
  return body.dev_bypass === true;
}
