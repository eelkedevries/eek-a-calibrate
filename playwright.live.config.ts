// Runs the Playwright suite against the deployed site instead of a local build, as a
// post-deploy check (docs/deployment.md): no local server is started, and requests go
// through HTTPS_PROXY when one is set (as in sandboxed sessions).
//   npx playwright test -c playwright.live.config.ts smoke flow mobile ready no-scroll
import base from './playwright.config.ts';

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

export default {
  ...base,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: process.env.LIVE_URL ?? 'https://eelkedevries.com/eek-a-calibrate/',
    ignoreHTTPSErrors: Boolean(proxy),
    ...(proxy ? { proxy } : {}),
  },
};
