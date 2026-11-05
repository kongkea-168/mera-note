import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright';

// Avoid a trailing Windows backslash escaping Playwright's shell argument quote.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const artifacts = path.join(root, 'test-results');

async function eventually(check) {
  const deadline = Date.now() + 10_000;
  let error;
  do {
    try { await check(); return; } catch (failure) { error = failure; }
    await delay(100);
  } while (Date.now() < deadline);
  throw error;
}

test('production Electron app', { timeout: 120_000 }, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'mera-note-test-'));
  await mkdir(artifacts, { recursive: true });
  let app;
  let appRoot;
  const errors = [];
  const launch = async () => {
    const env = { ...process.env, NODE_ENV: 'production' };
    delete env.ELECTRON_RUN_AS_NODE;
    const executablePath = process.env.MERA_TEST_EXECUTABLE;
    // Electron applies this switch before loading the app, isolating even its
    // initial autosave. The same tests can exercise the actual packaged binary.
    const args = [...(executablePath ? [] : [root]), `--user-data-dir=${profile}`];
    app = await electron.launch({ executablePath, args, cwd: root, env, timeout: 30_000 });
    const info = await app.evaluate(({ app: mainApp }) => ({
      profile: mainApp.getPath('userData'), appPath: mainApp.getAppPath(), packaged: mainApp.isPackaged,
    }));
    assert.equal(await realpath(info.profile), await realpath(profile));
    if (executablePath) assert.equal(info.packaged, true);
    appRoot = info.appPath;
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('textarea').waitFor();
    // Initial hydration also writes the default note; wait for it before edits.
    await eventually(async () => assert.ok(JSON.parse(await readFile(path.join(profile, 'mera_note_store.json'), 'utf8'))));
    return page;
  };
  const stored = async () => JSON.parse(await readFile(path.join(profile, 'mera_note_store.json'), 'utf8'));
  try {
    let page = await launch();
    const note = 'សួស្តីកម្ពុជា — MERA Note\nEnglish + Khmer persistence check';

    await t.test('local content, sandbox, context isolation and restricted bridge', async () => {
      assert.ok(page.url().startsWith('file:'));
      assert.equal(await page.title(), 'MERA Note');
      const prefs = await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const p = win.webContents.getLastWebPreferences();
        return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, alwaysOnTop: win.isAlwaysOnTop() };
      });
      assert.deepEqual(prefs, { sandbox: true, contextIsolation: true, nodeIntegration: false, alwaysOnTop: true });
      assert.deepEqual(await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process, api: Object.keys(window.api).sort() })), {
        require: 'undefined', process: 'undefined', api: ['closeApp', 'loadNote', 'moveWindow', 'saveNote'],
      });
      assert.equal(await page.evaluate(async () => {
        try { await fetch('data:text/plain,blocked-by-csp'); return 'allowed'; } catch { return 'blocked'; }
      }), 'blocked');
    });

    await t.test('Khmer/English editing, autosave and literal HTML', async () => {
      await page.locator('textarea').fill('<img src=x onerror="window.injected=true">');
      assert.equal(await page.evaluate(() => window.injected), undefined);
      await page.locator('textarea').fill(note);
      await eventually(async () => assert.equal((await stored()).text, note));
    });

    await t.test('all ten themes and bundled Khmer font', async () => {
      const outside = await page.locator('.toolbar button, .toolbar input').evaluateAll(elements => elements.filter(el => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight;
      }).map(el => el.title));
      assert.deepEqual(outside, [], 'Every toolbar control must be inside the window');
      const themes = ['Pastel Yellow', 'Pastel Blue', 'Pastel Green', 'Pastel Pink', 'Khmer Frame', 'Dark Mode', 'Cyberpunk', 'Dark Blue', 'Dark Grey', 'Dark Green'];
      for (const theme of themes) {
        await page.getByTitle(theme, { exact: true }).click();
        await page.screenshot({ path: path.join(artifacts, `${theme.toLowerCase().replaceAll(' ', '-')}.png`) });
      }
      await page.getByTitle('Pastel Yellow', { exact: true }).click();
      assert.equal(await page.evaluate(async () => {
        await document.fonts.load('16px Suwannaphum', 'សួស្តី');
        return document.fonts.check('16px Suwannaphum', 'សួស្តី');
      }), true);
    });

    await t.test('font controls, text color and restart persistence', async () => {
      await page.getByTitle('Increase Font Size', { exact: true }).click();
      await page.getByTitle('Increase Font Size', { exact: true }).click();
      await page.getByTitle('Decrease Font Size', { exact: true }).click();
      await page.getByTitle('Text Color', { exact: true }).fill('#125634');
      await page.getByTitle('Pastel Blue', { exact: true }).click();
      await eventually(async () => {
        const data = await stored();
        assert.equal(data.fontSize, 18);
        assert.equal(data.textColor, '#125634');
        assert.equal(data.color, '#e6f7ff');
      });
      await app.close();
      page = await launch();
      assert.equal(await page.locator('textarea').inputValue(), note);
      assert.equal(await page.locator('textarea').evaluate(el => getComputedStyle(el).fontSize), '18px');
      assert.equal(await page.getByTitle('Text Color', { exact: true }).inputValue(), '#125634');
      assert.equal((await stored()).color, '#e6f7ff');
    });

    await t.test('untrusted window cannot read or overwrite notes', async () => {
      const result = await app.evaluate(async ({ BrowserWindow }, preload) => {
        const main = BrowserWindow.getAllWindows()[0];
        const other = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
        try {
          await other.loadURL(main.webContents.getURL());
          return await other.webContents.executeJavaScript('(async () => { window.api.saveNote({text:"UNTRUSTED"}); return window.api.loadNote(); })()');
        } finally { other.destroy(); }
      }, path.join(appRoot, 'electron/preload.cjs'));
      assert.equal(result.text, '');
      assert.equal((await stored()).text, note);
    });

    await t.test('IPC payload limits and popup lockdown', async () => {
      const sanitized = await page.evaluate(async () => {
        window.api.saveNote({ text: 'x'.repeat(1_000_100), fontSize: 1000, color: {}, textColor: null });
        const data = await window.api.loadNote();
        return { length: data.text.length, fontSize: data.fontSize, color: data.color, textColor: data.textColor };
      });
      assert.deepEqual(sanitized, { length: 1_000_000, fontSize: 72, color: '#fff4e6', textColor: '#333333' });
      await page.evaluate(async (text) => {
        window.api.saveNote({ text, fontSize: 18, color: '#e6f7ff', textColor: '#125634' });
        await window.api.loadNote();
      }, note);
      assert.equal(await page.evaluate(() => window.open('about:blank')), null);
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    });

    await t.test('hide retains the note and window can be shown again', async () => {
      await page.getByTitle('Hide App', { exact: true }).click();
      await eventually(async () => assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
      assert.equal(await page.locator('textarea').inputValue(), note);
      await page.screenshot({ path: path.join(artifacts, 'restored-note.png') });
      assert.deepEqual(errors, []);
    });
  } finally {
    if (app) await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  }
});
