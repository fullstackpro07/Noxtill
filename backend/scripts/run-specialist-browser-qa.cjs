/* Local browser QA: separate test business/Redis, no provider credentials. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const redisBinary = process.env.QA_REDIS_BINARY || '/Users/mc/Library/Application Support/Noxtill/redis/bin/redis-server';
const children = [];
function stop() { for (const child of children) child.kill('SIGTERM'); }
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });

function freePort(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); reject(new Error(`QA port ${port} is already in use.`)); });
    socket.once('error', () => { socket.destroy(); resolve(); });
  });
}

async function main() {
  await Promise.all([freePort(5001), freePort(6381)]);
  if (!fs.existsSync(redisBinary)) throw new Error('Set QA_REDIS_BINARY to the local Redis server executable.');
  const local = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
  const url = new URL(local.DATABASE_URL);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'noxtill-specialist-qa-'));
  if ([temporary, path.dirname(temporary)].some((directory) => fs.existsSync(path.join(directory, '.env')))) {
    throw new Error('QA working directory unexpectedly contains an environment file.');
  }
  const env = {
    // Prisma can load schema-relative .env files even with a temporary working directory.
    // Existing empty env values are not replaced by dotenv: block every non-allowlisted key.
    ...Object.fromEntries(Object.keys(local).filter((key) => !['PATH', 'HOME', 'TMPDIR', 'LANG'].includes(key)).map((key) => [key, ''])),
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG, NODE_ENV: 'development', DATABASE_URL: url.toString(),
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '7d',
    PORT: '5001', REDIS_HOST: '127.0.0.1', REDIS_PORT: '6381',
    CORS_ALLOWLIST: 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001',
    API_RATE_LIMIT_PER_MINUTE: '1000',
  };
  const redis = spawn(redisBinary, ['--bind', '127.0.0.1', '--port', '6381', '--save', '', '--appendonly', 'no', '--dir', temporary], { env, stdio: 'inherit' });
  children.push(redis);
  console.log('QA API: 5001. Redis: 6381. Existing local database; test creates its own business. Provider keys blocked; recurring global jobs disabled.');
  const prelude = `
    const { Queue } = require(${JSON.stringify(require.resolve('bullmq'))});
    const add = Queue.prototype.add;
    Queue.prototype.add = function(name, data, options) {
      if (options && options.repeat) return Promise.resolve(null);
      return add.call(this, name, data, options);
    };
    Queue.prototype.upsertJobScheduler = function() { return Promise.resolve(null); };
    require(${JSON.stringify(require.resolve('@prisma/client'))});
    const blocked = ${JSON.stringify(Object.keys(local).filter((key) => !Object.hasOwn(env, key) || env[key] === ''))};
    for (const key of blocked) if (process.env[key]) throw new Error('A blocked QA environment setting was unexpectedly loaded.');
    console.log('QA environment isolation verified after Prisma initialization.');
    require(${JSON.stringify(path.join(root, 'dist/main.js'))});
  `;
  const server = spawn(process.execPath, ['-e', prelude], { cwd: temporary, env, stdio: 'inherit' });
  children.push(server);
  server.on('exit', (code) => { stop(); process.exit(code || 0); });
}
main().catch((error) => { console.error(error.message); stop(); process.exit(1); });
