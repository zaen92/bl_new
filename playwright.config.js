import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:process.env.STEP2_E2E?'tests/step2-browser':'tests/browser', testIgnore:process.env.AUTH_EMULATOR_TESTS ? [] : ['**/auth.spec.js'], workers:1, use:{baseURL:'http://127.0.0.1:5173',headless:true,
 launchOptions:{executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']}},
 webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI}
});
