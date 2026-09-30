import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(path, imports, globals = {}) {
  const source = fs.readFileSync(path, 'utf8').replaceAll('import.meta.env', '({})');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(name in imports, 'Unexpected import: ' + name);
      return imports[name];
    },
    console, Date, Map, Set, Promise, ...globals,
  }, { filename: path });
  return exports;
}

const storage = new Map();
let writes = 0;
let notifications = 0;
const { db } = loadModule('src/services/db.ts', {
  '../data/questions.json': [{ id: 1, question: 'Test', answer: 'A', wrong1: 'B', wrong2: 'C', wrong3: 'D', topic: 'T', qcmStatus: 'READY' }],
  './nativeStorage': { isNativeAndroidStorage: () => false, loadNativeSnapshot: async () => null, saveNativeSnapshot: async () => {} },
  '../config/appConfig': { appConfig: { defaultDomainId: 'test', defaultDomainName: 'Test', defaultDomainDescription: '' } },
}, {
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { writes++; storage.set(key, value); } },
  window: { dispatchEvent: () => {} },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
});
writes = 0; // Initial database creation writes a recovery copy.
db.subscribe(() => notifications++);
db.setSetting('daily_goal', '20');
assert.equal(writes, 0, 'Unchanged settings should not write');
db.setSettings({ daily_goal: '30', reminder_hours: '4' });
assert.equal(writes, 1, 'A batch should produce one recovery write');
assert.equal(notifications, 1);
db.saveRemote({
  latest: 2, minimum: 1, updateUrl: 'https://github.com/example',
  updateTitle: 'Update', updateMessage: 'Available',
  announcementEnabled: true, announcementId: 'a1', announcementTitle: 'Hello', announcementMessage: 'World',
  notifications: [{ id: 'n1', title: 'Notice', message: 'Message', type: 'info' }],
  lastCheckedAt: 123, source: 'github',
  ratingPrompt: { enabled: true, storeUrl: 'https://play.google.com', title: 'Rate', message: 'Please', minUsageDays: 3, minLaunches: 5, repeatAfterDays: 14 },
});
assert.equal(writes, 2, 'Remote refresh must save only once');
assert.equal(notifications, 2);
const saved = JSON.parse(storage.get('customs_study_data_v3'));
assert.equal(saved.questions.length, 1, 'Question bank must be retained');
assert.equal(saved.settings.daily_goal, '30');
assert.equal(saved.settings.remote_latest, '2');
assert.equal(saved.settings.remote_last_checked, '123');
assert.ok(saved.notifications.some(n => n.id === 'n1'));
assert.ok(saved.notifications.some(n => n.id === 'sys_announcement_a1'));

let initCalls = 0;
const slots = [];
const bannerRequests = [];
const hidden = [];
let rejectInit = true;
const navigator = { onLine: true };
const document = { visibilityState: 'visible' };
const ads = loadModule('src/services/ads.ts', {
  '@capacitor/core': {
    Capacitor: { getPlatform: () => 'android' },
    registerPlugin: () => ({
      initializeAds: async () => { initCalls++; if (rejectInit) throw new Error('offline'); },
      showBanner: async args => { slots.push(args.slot); bannerRequests.push(args); return { loaded: true, height: 50 }; },
      updateBanner: async () => {},
      hideBanner: async args => { hidden.push(args.slot); },
      showInterstitial: async () => {},
    }),
  },
}, { navigator, document });
const rect = { x: 0, y: 10, width: 320, height: 250, viewportWidth: 360, visible: true };
assert.equal((await ads.showBanner('first', rect, 'rectangle')).loaded, false);
rejectInit = false;
await Promise.all([ads.showBanner('first', rect, 'rectangle'), ads.showBanner('second', rect, 'rectangle')]);
assert.equal(initCalls, 2, 'Concurrent slots must share one initialization and retry failures');
assert.deepEqual(slots, ['first', 'second']);
assert.ok(bannerRequests.every(request => request.format === 'banner'), 'No configured rectangle unit: use the supported standard banner');
assert.ok(bannerRequests.every(request => request.fallbackPlacementId === 'BP_Banner_Android'));
assert.equal((await ads.showBanner('height-check', rect, 'banner')).height, 50);
slots.pop();
await ads.hideBanner('first');
assert.deepEqual(hidden, ['first'], 'Removing one slot must not hide another');
navigator.onLine = false;
assert.equal((await ads.showBanner('offline', rect, 'rectangle')).loaded, false);
assert.equal(slots.length, 2);
navigator.onLine = true;
document.visibilityState = 'hidden';
await ads.showInterstitial();
assert.equal((await ads.showBanner('background', rect, 'rectangle')).loaded, false);
document.visibilityState = 'visible';
assert.equal((await ads.showBanner('reconnected', rect, 'rectangle')).loaded, true);

let release;
const nativeWrites = [];
const native = loadModule('src/services/nativeStorage.ts', {
  '@capacitor/core': {
    Capacitor: { getPlatform: () => 'android' },
    registerPlugin: () => ({
      saveSnapshot: async ({ value }) => {
        nativeWrites.push(value);
        if (value === 'first') await new Promise(resolve => { release = resolve; });
      },
    }),
  },
});
const first = native.saveNativeSnapshot('first');
await Promise.resolve();
const second = native.saveNativeSnapshot('second');
const third = native.saveNativeSnapshot('third');
release();
await Promise.all([first, second, third]);
assert.deepEqual(nativeWrites, ['first', 'third'], 'Queued writes must persist the latest state');
await native.saveNativeSnapshot('fourth');
assert.equal(nativeWrites.at(-1), 'fourth');
assert.ok(!fs.existsSync('native-android/NexusNanoAiPlugin.java'));
for (const file of ['src/services/geminiAi.ts', 'src/views/AiSettingsPage.tsx', 'native-android/MainActivity.java', 'scripts/install-native-ads.sh']) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /NexusNanoAi|nanoStatus|generateWithNano|genai-prompt/);
}
console.log('Resource regression checks passed.');
