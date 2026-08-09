// Manual mock for the e2e suite — `archiver` (v8) ships ESM-only, same class of issue as
// puppeteer.js in this directory. No e2e journey in this suite exercises the account-zip export.
class MockZipArchive {
  pipe(dest) {
    this.dest = dest;
    return dest;
  }
  append(buffer) {
    this.dest?.write(buffer);
    return this;
  }
  on() {
    return this;
  }
  finalize() {
    this.dest?.end();
    return Promise.resolve();
  }
}

module.exports = { ZipArchive: MockZipArchive };
