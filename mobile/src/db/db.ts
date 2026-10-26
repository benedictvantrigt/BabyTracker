/** Parameter values accepted by SQLite bindings. */
export type SqlValue = string | number | null;

/**
 * The subset of expo-sqlite's SQLiteDatabase the app uses. Keeping it narrow lets
 * the repository run against Node's built-in SQLite in tests.
 */
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
