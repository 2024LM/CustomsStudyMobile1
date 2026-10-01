import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(native = false) {
  const storage = new Map(), spoken = [], nativeSpoken = [];
  let callback;
  const window = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout, clearTimeout,
    speechSynthesis: {
      getVoices: () => [{ voiceURI: 'ar', lang: 'ar-SA', name: 'Arabic', localService: true }],
      cancel() {}, speak: utterance => spoken.push(utterance),
    },
  };
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync('src/services/arabicTts.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, {
    exports, console, setTimeout, clearTimeout,
    require: () => ({
      Capacitor: { isNativePlatform: () => native, getPlatform: () => native ? 'android' : 'web' },
      registerPlugin: () => ({
        addListener: async (_name, listener) => { callback = listener; return { remove: async () => {} }; },
        playback: async () => ({ requestId: '', state: 'idle' }),
        speak: async options => { nativeSpoken.push(options); return { started: true, locale: 'ar-SA', voice: 'Arabic' }; },
        stop: async () => {},
      }),
    }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { addEventListener() {}, visibilityState: 'visible' }, window,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, Event: class {},
  });
  return { api: exports, spoken, nativeSpoken, emit: event => callback(event) };
}
const { api, spoken } = setup();
assert.equal(api.prepareTextForSpeech('# **رسوم**\n- النسبة 12.5٪\n[القانون](https://example.com)\nالسـعر ١٢٫٥'), 'رسوم\nالنسبة 12.5 في المئة\nالقانون\nالسعر ١٢٫٥');
assert.equal(api.prepareTextForSpeech('حرارة 25°C،'), 'حرارة 25 درجة مئوية،');
assert.equal(api.prepareTextForSpeech('عِلْمٌ 12/2024 A-12 3.14'), 'عِلْمٌ 12/2024 A-12 3.14');
assert.equal(api.prepareTextForSpeech('دراسة، مدرسة. مدرسة'), 'دراسة، مدرسة. مدرسة');
api.saveSoftenFinalTaaMarbuta(true);
assert.equal(api.prepareTextForSpeech('دراسة، مدرسة. مدرسة'), 'دراسة، مدرسه. مدرسه');
api.saveSentencePauseEnabled(false);
assert.equal(api.prepareTextForSpeech('النسبة 12.5. هل؟'), 'النسبة 12.5 هل');
assert.equal(api.readingFrameEnabled(), true);
api.saveReadingFrameEnabled(false);
assert.equal(api.readingFrameEnabled(), false);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const first = api.speakArabic('نص أول', 1, 'first');
await tick(); spoken[0].onstart(); await first;
assert.equal(api.currentTtsPlayback().state, 'speaking');
const second = api.speakArabic('نص آخر', 1, 'second');
await tick(); spoken[0].onend();
assert.equal(api.currentTtsPlayback().requestId, 'second');
assert.equal(api.currentTtsPlayback().state, 'loading');
spoken[1].onstart(); await second; spoken[1].onend();
assert.equal(api.currentTtsPlayback().state, 'done');
const pending = api.speakArabic('تحميل', 1, 'pending');
const rejected = assert.rejects(pending);
await api.stopArabicTts(); await rejected; await tick();
assert.equal(spoken.length, 2, 'Cancelling before voices load must not queue speech');
const third = api.speakArabic('خطأ', 1, 'third');
await tick(); spoken[2].onstart(); await third; spoken[2].onerror();
assert.equal(api.currentTtsPlayback().state, 'error');
const android = setup(true);
await android.api.speakArabic('نص', 1, 'native-first');
android.emit({ requestId: 'native-first', state: 'speaking' });
assert.equal(android.api.currentTtsPlayback().state, 'speaking');
await android.api.speakArabic('آخر', 1, 'native-second');
android.emit({ requestId: 'native-first', state: 'done' });
assert.equal(android.api.currentTtsPlayback().state, 'loading');
android.emit({ requestId: 'native-second', state: 'error' });
assert.equal(android.api.currentTtsPlayback().state, 'error');
assert.equal(android.nativeSpoken[1].requestId, 'native-second');
console.log('TTS text preparation and playback lifecycle checks passed.');
