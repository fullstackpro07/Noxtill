/**
 * Hostinger's Node.js panel often does not give Prisma a usable `DATABASE_URL`:
 * the database picker stores the bare schema name, the env UI keeps wrapping quotes,
 * or the value is pasted as `DATABASE_URL=mysql://...`. Prisma then refuses to boot
 * (`URL must start with the protocol mysql://`), Nest never listens, and the proxy
 * returns 503. Normalize before `PrismaClient` is constructed.
 */
export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  let url = stripEnv(env.DATABASE_URL);
  if (url.toUpperCase().startsWith('DATABASE_URL=')) {
    url = stripEnv(url.slice('DATABASE_URL='.length));
  }
  if (isMysqlUrl(url)) {
    env.DATABASE_URL = url;
    return url;
  }

  const user = stripEnv(env.DB_USER ?? env.MYSQL_USER);
  const password = stripEnv(env.DB_PASSWORD ?? env.MYSQL_PASSWORD);
  const host = stripEnv(env.DB_HOST ?? env.MYSQL_HOST) || 'localhost';
  const port = stripEnv(env.DB_PORT ?? env.MYSQL_PORT) || '3306';
  const database =
    url && !url.includes('://')
      ? url
      : stripEnv(env.DB_NAME ?? env.MYSQL_DATABASE);

  if (user && password && database) {
    const composed = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    env.DATABASE_URL = composed;
    return composed;
  }

  throw new Error(
    `DATABASE_URL must be a mysql:// connection string. ${describeInvalid(url)} ` +
      'In Hostinger: Node.js → Environment variables, set DATABASE_URL to ' +
      'mysql://USER:PASSWORD@localhost:3306/DBNAME with no wrapping quotes. ' +
      'Or set DB_USER, DB_PASSWORD, and DB_NAME and this process will compose the URL.',
  );
}

export function stripEnv(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\r$/g, '')
    .replace(/^['"]+|['"]+$/g, '');
}

function isMysqlUrl(url: string): boolean {
  return url.startsWith('mysql://');
}

function describeInvalid(url: string): string {
  if (!url) {
    return 'It is currently empty or unset.';
  }
  if (!url.includes('://')) {
    return `It looks like a bare database name (${url.length} chars), not a URL.`;
  }
  return `It uses protocol "${url.split('://')[0]}://" instead of mysql://.`;
}
