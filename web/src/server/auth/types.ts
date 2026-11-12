import "server-only";

import type { SqlRow, SqlValue } from "../db/connection";
import type { DatabaseOptions } from "../db/location";

export type Role = "ADMIN" | "SALESPERSON";
export interface Actor {
  readonly principalId: Role;
  readonly role: Role;
  readonly sessionId: string;
}
export interface AuthorizedTransaction {
  get(sql: string, bindings?: readonly SqlValue[]): Promise<SqlRow | undefined>;
  all(sql: string, bindings?: readonly SqlValue[]): Promise<SqlRow[]>;
  run(sql: string, bindings?: readonly SqlValue[]): Promise<{ changes: bigint }>;
}
declare const verifiedCredentialBrand: unique symbol;
// Private receipt, NOT an Actor/session/authorization capability. Its signal aborts
// on expiry, new verification, logout, consumption or shutdown. Issuance rechecks SQL.
export interface VerifiedCredential {
  readonly [verifiedCredentialBrand]: true;
  readonly signal: AbortSignal;
}
export interface AuthorizationGateway {
  verifyAdminPassword(password: unknown): Promise<VerifiedCredential>;
  verifySalespersonPassword(password: unknown): Promise<VerifiedCredential>;
  // Private response: signed cookies only in headers, never bearer-bearing JSON.
  issueAdminSession(receipt: unknown): Promise<Response>;
  issueSalespersonSession(receipt: unknown): Promise<Response>;
  // Private, fixed-role logout. Request identity comes only from signed-session verification.
  logoutAdmin(request: Request): Promise<Response>;
  logoutSalesperson(request: Request): Promise<Response>;
  // Both targets require a signed ADMIN session AND a fresh single-use ADMIN proof.
  // No cookie/token/hash response; self-rotation requires fresh login.
  rotateAdminPassword(request: Request, proof: unknown, password: unknown): Promise<void>;
  rotateSalespersonPassword(request: Request, proof: unknown, password: unknown): Promise<void>;
  authorizeAdmin(request: Request): Promise<Actor>;
  authorizeSalesperson(request: Request): Promise<Actor>;
  withFreshAdminTransaction<T>(request: Request, proof: unknown, work: (transaction: AuthorizedTransaction, actor: Actor) => Promise<T>): Promise<T>;
  withAdminTransaction<T>(request: Request, work: (transaction: AuthorizedTransaction, actor: Actor) => Promise<T>): Promise<T>;
  withSalespersonTransaction<T>(request: Request, work: (transaction: AuthorizedTransaction, actor: Actor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export interface AuthorizationConfiguration {
  database: DatabaseOptions;
  migrationsDirectory: string;
  // Provisioned elsewhere in a future reviewed key-custody step. No defaults.
  origins: Readonly<Record<Role, string>>;
  signingSecrets: Readonly<Record<Role, string>>;
  sessionLifetimeSeconds: number;
}
export class AuthorizationDenied extends Error {
  readonly code = "AUTHORIZATION_DENIED";
  constructor() { super("Access denied."); this.name = "AuthorizationDenied"; }
}
