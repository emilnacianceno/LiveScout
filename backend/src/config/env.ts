// Bun loads .env automatically (the dev script passes --env-file=../.env).
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const env = {
  port: Number(process.env.BACKEND_PORT ?? 3001),
  pythonUrl: `http://127.0.0.1:${process.env.PYTHON_PORT ?? 8001}`,
  database: {
    url: required('DATABASE_URL'),
    poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  },
};
