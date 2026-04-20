declare module 'better-sqlite3' {
  interface RunResult {
    changes: number
    lastInsertRowid: number | bigint
  }

  interface Statement {
    run(...params: unknown[]): RunResult
    get<T = unknown>(...params: unknown[]): T | undefined
    all<T = unknown>(...params: unknown[]): T[]
  }

  interface Database {
    pragma(source: string): unknown
    exec(sql: string): Database
    prepare(sql: string): Statement
    close(): void
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database
  }

  const Database: DatabaseConstructor
  export default Database
}
