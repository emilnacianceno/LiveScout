import postgres, { type Sql } from 'postgres';
import { env } from '../config/env';

/** Singleton PostgreSQL connection (pooled). Usage: const sql = getDatabase().query; await sql`SELECT ...` */
export class Database {
  private static instance: Database;
  private sql: Sql;

  private constructor() {
    this.sql = postgres(env.database.url, {
      max: env.database.poolMax,
      // Recycle sockets so we never reuse one that was silently killed while idle
      idle_timeout: 30,
      max_lifetime: 60 * 30,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }

  static getInstance(): Database {
    return (Database.instance ??= new Database());
  }

  get query() {
    return this.sql;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  async close() {
    await this.sql.end();
  }
}

export const getDatabase = () => Database.getInstance();
export const sql = () => getDatabase().query;
