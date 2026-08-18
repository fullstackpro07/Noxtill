/**
 * Hostinger's Node.js panel often does not give Prisma a usable `DATABASE_URL`:
 * the database picker stores the bare schema name, the env UI keeps wrapping quotes,
 * or the value is pasted as `DATABASE_URL=mysql://...`. Prisma then refuses to boot
 * (`URL must start with the protocol mysql://`), Nest never listens, and the proxy
 * returns 503. Normalize before `PrismaClient` is constructed.
 *
 * Hostinger can also lock a stale `DATABASE_URL` from the database wizard while
 * `DB_PASSWORD` / `MYSQL_PASSWORD` is updated later. Overlay those parts when set.
 */
export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  let url = stripEnv(env.DATABASE_URL);
  if (url.toUpperCase().startsWith('DATABASE_URL=')) {
    url = stripEnv(url.slice('DATABASE_URL='.length));
  }

  const user = stripEnv(env.DB_USER ?? env.MYSQL_USER);
  const password = stripEnv(env.DB_PASSWORD ?? env.MYSQL_PASSWORD);
  const host = stripEnv(env.DB_HOST ?? env.MYSQL_HOST);
  const port = stripEnv(env.DB_PORT ?? env.MYSQL_PORT);
  const databaseFromParts = stripEnv(env.DB_NAME ?? env.MYSQL_DATABASE);

  if (isMysqlUrl(url)) {
    const resolved = overlayMysqlUrl(url, {
      user,
      password,
      host,
      port,
      database: databaseFromParts,
    });
    env.DATABASE_URL = resolved;
    return resolved;
  }

  const database = url && !url.includes('://') ? url : databaseFromParts;

  if (user && password && database) {
    const composed = composeMysqlUrl(
      user,
      password,
      host || 'localhost',
      port || '3306',
      database,
    );
    env.DATABASE_URL = composed;
    return composed;
  }

  throw new Error(
    `DATABASE_URL must be a mysql:// connection string. ${describeInvalid(url)} ` +
      'In Hostinger: website dashboard → Environment variables, set DATABASE_URL to ' +
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

function composeMysqlUrl(
  user: string,
  password: string,
  host: string,
  port: string,
  database: string,
): string {
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database.replace(/^\//, '')}`;
}

function overlayMysqlUrl(
  url: string,
  overrides: {
    user: string;
    password: string;
    host: string;
    port: string;
    database: string;
  },
): string {
  const parsed = new URL(url);
  return composeMysqlUrl(
    overrides.user || decodeURIComponent(parsed.username),
    overrides.password || decodeURIComponent(parsed.password),
    overrides.host || parsed.hostname,
    overrides.port || parsed.port || '3306',
    overrides.database || parsed.pathname.replace(/^\//, ''),
  );
}

export function describeDatabaseTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, '') || '(none)';
    return `user=${parsed.username} host=${parsed.hostname} port=${parsed.port || '3306'} db=${db} passwordChars=${parsed.password.length}`;
  } catch {
    return 'DATABASE_URL could not be parsed (check for unescaped @ : / in the password)';
  }
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
