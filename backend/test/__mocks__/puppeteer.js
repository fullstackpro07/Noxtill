// Manual mock for the e2e suite (test/jest-e2e.json's moduleNameMapper): `puppeteer` ships ESM-only
// and breaks ts-jest's CommonJS transform the moment `AppModule` is loaded whole (it pulls in
// PdfRendererService transitively) — the same class of issue every unit spec touching PDF/QR
// generation already works around with a per-file `jest.mock(...)`, but the e2e suite loads the
// entire app graph, so this needs to be handled once, here, rather than per-spec-file. No e2e
// journey in this suite exercises real PDF/QR rendering.
module.exports = {
  launch: async () => ({
    newPage: async () => ({
      setContent: async () => {},
      setViewport: async () => {},
      pdf: async () => Buffer.from(''),
      screenshot: async () => Buffer.from(''),
    }),
    close: async () => {},
  }),
};
