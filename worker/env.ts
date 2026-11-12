export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  AI_MODEL?: string;
  TAVILY_API_KEY?: string;
  OFFICE_HOST?: string;
  OFFICE_HOST_TOKEN?: string;
  /** Service token for the tunneled office machine. Omit when the host is on localhost. */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}
