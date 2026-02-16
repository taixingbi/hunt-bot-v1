/**
 * Type declarations for vitest so the IDE resolves the module.
 * Install: pnpm add -D vitest
 */
declare module "vitest" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  export const expect: {
    (value: unknown): {
      toBe(expected: unknown): void;
      toContain(sub: string): void;
      toMatch(re: RegExp): void;
      not: { toBe(expected: unknown): void; toContain(sub: string): void; toMatch(re: RegExp): void };
    };
  };
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
}
