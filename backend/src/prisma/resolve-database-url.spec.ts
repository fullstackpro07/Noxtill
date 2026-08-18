import {
  describeDatabaseTarget,
  resolveDatabaseUrl,
} from './resolve-database-url';

describe('resolveDatabaseUrl', () => {
  it('passes through a valid mysql:// URL', () => {
    const env = {
      DATABASE_URL: 'mysql://noxtill:secret@localhost:3306/Noxtill',
    };
    expect(resolveDatabaseUrl(env)).toBe(
      'mysql://noxtill:secret@localhost:3306/Noxtill',
    );
  });

  it('strips wrapping quotes Hostinger env UI often keeps', () => {
    const env = {
      DATABASE_URL: '"mysql://noxtill:secret@localhost:3306/Noxtill"',
    };
    expect(resolveDatabaseUrl(env)).toBe(
      'mysql://noxtill:secret@localhost:3306/Noxtill',
    );
  });

  it('strips a pasted DATABASE_URL= prefix', () => {
    const env = {
      DATABASE_URL:
        'DATABASE_URL=mysql://noxtill:secret@localhost:3306/Noxtill',
    };
    expect(resolveDatabaseUrl(env)).toBe(
      'mysql://noxtill:secret@localhost:3306/Noxtill',
    );
  });

  it('composes a URL when Hostinger stored only the database name', () => {
    const env = {
      DATABASE_URL: 'u721189487_noxtill',
      DB_USER: 'u721189487_noxtill006',
      DB_PASSWORD: 'secret',
    };
    expect(resolveDatabaseUrl(env)).toBe(
      'mysql://u721189487_noxtill006:secret@localhost:3306/u721189487_noxtill',
    );
  });

  it('overlays DB_PASSWORD onto a stale mysql:// DATABASE_URL', () => {
    const env = {
      DATABASE_URL: 'mysql://noxtill:oldpassword@localhost:3306/Noxtill',
      DB_PASSWORD: 'new-password',
    };
    expect(resolveDatabaseUrl(env)).toBe(
      'mysql://noxtill:new-password@localhost:3306/Noxtill',
    );
  });

  it('throws a Hostinger-specific hint when nothing usable is set', () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/mysql:\/\//);
  });

  it('describes a URL without leaking the password', () => {
    expect(
      describeDatabaseTarget(
        'mysql://noxtill:super-secret@localhost:3306/Noxtill',
      ),
    ).toBe('user=noxtill host=localhost port=3306 db=Noxtill passwordChars=12');
  });
});
