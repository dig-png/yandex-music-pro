/*
 * YandexMusicPro — background service worker.
 * Only downloading, local-library indexing and Yandex library comparison live here.
 */
importScripts("/lib/match.js");

const HOST_NAME = "com.ymp.files";
const TAB_URLS = [
  "*://music.yandex.ru/*",
  "*://*.music.yandex.ru/*",
  "*://music.yandex.com/*",
  "*://*.music.yandex.com/*",
  "*://music.yandex.kz/*",
  "*://*.music.yandex.kz/*",
  "*://music.yandex.uz/*",
  "*://*.music.yandex.uz/*",
  "*://music.yandex.by/*",
  "*://*.music.yandex.by/*",
];

const DEFAULTS = {
  format: "flac",
  quality: "hq",
  tags: true,
  folder: false,
  path: "",
  cover: "600x600",
  position: false,
  musicDir: "",
  skipExisting: true,
  formatPolicy: "upgrade",
  autoMove: true,
  upgradeCleanup: true,
  reportSources: { likes: true, playlists: true, albums: true },
  html: "0;",
  shareTime: 6e8,
};

/* ------------------------------- helpers --------------------------------- */

const storage = {
  get: (keys) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (v) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(v || {});
      });
    }),
  set: (obj) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    }),
  remove: (keys) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    }),
};

function sendNative(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message || String(err) });
        else if (!response) resolve({ ok: false, error: "Empty response from local helper" });
        else resolve(response);
      });
    } catch (e) {
      resolve({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  });
}

function downloadsSearch(query) {
  return new Promise((resolve) => chrome.downloads.search(query, (items) => resolve(items || [])));
}

async function getSettings() {
  const stored = await storage.get(Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS };
  for (const [key, value] of Object.entries(stored)) {
    if (value !== undefined) settings[key] = value;
  }
  if (!settings.musicDir) settings.musicDir = DEFAULTS.musicDir;
  return settings;
}

async function ensureDefaults() {
  const stored = await storage.get(Object.keys(DEFAULTS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await storage.set(missing);
}

async function readIndex() {
  const { musicIndex } = await storage.get("musicIndex");
  return musicIndex || null;
}

async function setStatus(key, value) {
  await storage.set({ [key]: { ...value, updatedAt: Date.now() } });
}

/* --------------------------- local library scan -------------------------- */

let scanPromise = null;

function scanLocal(dir) {
  if (scanPromise) return scanPromise;
  scanPromise = (async () => {
    const settings = await getSettings();
    const target = dir || settings.musicDir;
    await setStatus("scanStatus", { state: "running", dir: target, offset: 0, total: 0 });
    const all = [];
    let offset = 0;
    let total = 0;
    for (;;) {
      const response = await sendNative({
        cmd: "list",
        dir: target,
        offset,
        limit: 300,
        tags: true,
      });
      if (!response.ok) throw new Error(response.error || "Local helper error");
      total = response.total;
      all.push(...response.files);
      offset += response.count;
      await setStatus("scanStatus", {
        state: "running",
        dir: target,
        offset,
        total,
        files: all.length,
      });
      if (!response.count || offset >= total) break;
    }
    const index = YMPMatch.buildIndex(all, target);
    await storage.set({ musicIndex: index, musicDir: target, lastScan: Date.now() });
    await setStatus("scanStatus", {
      state: "done",
      dir: target,
      offset: total,
      total,
      files: index.total,
      strongKeys: Object.keys(index.strong).length,
    });
    return index;
  })()
    .catch(async (error) => {
      await setStatus("scanStatus", { state: "error", error: String(error && error.message ? error.message : error) });
      throw error;
    })
    .finally(() => {
      scanPromise = null;
    });
  return scanPromise;
}

function addFileToIndex(index, file) {
  if (!index) return index;
  if (index.byName && index.byName[file.name] !== undefined) return index;
  const ext = (file.ext || file.name.split(".").pop() || "").toLowerCase();
  const entry = {
    name: file.name,
    ext,
    size: file.size || 0,
    mtime: file.mtime || Date.now(),
    artist: (file.tags && file.tags.artist) || file.artist || "",
    title: (file.tags && file.tags.title) || file.title || "",
    album: (file.tags && file.tags.album) || file.album || "",
  };
  index.files.push(entry);
  index.byName[file.name] = ext;
  const keys = YMPMatch.fileKeys({ name: file.name, tags: file.tags || {} });
  for (const key of keys.strong) {
    index.strong[key] = index.strong[key] || [];
    if (!index.strong[key].includes(file.name)) index.strong[key].push(file.name);
  }
  for (const key of keys.weak) {
    index.weak[key] = index.weak[key] || [];
    if (!index.weak[key].includes(file.name)) index.weak[key].push(file.name);
  }
  index.total = index.files.length;
  index.updatedAt = Date.now();
  return index;
}

function removeFileFromIndex(index, name) {
  if (!index) return index;
  index.files = index.files.filter((f) => f.name !== name);
  if (index.byName) delete index.byName[name];
  for (const map of [index.strong, index.weak]) {
    for (const key of Object.keys(map || {})) {
      map[key] = map[key].filter((n) => n !== name);
      if (!map[key].length) delete map[key];
    }
  }
  index.total = index.files.length;
  return index;
}

/* ---------------------------- download handling -------------------------- */

const moving = new Set();

async function finalizeDownload(downloadId) {
  const [item] = await downloadsSearch({ id: Number(downloadId) });
  const { pendingDownloads = {} } = await storage.get("pendingDownloads");
  let pending = pendingDownloads[String(downloadId)];

  if (!pending && item && item.filename) {
    const { pendingByFilename = {} } = await storage.get("pendingByFilename");
    const base = item.filename.split(/[\\/]/).pop();
    if (base && pendingByFilename[base]) {
      pending = { ...pendingByFilename[base], state: "in_progress", finalized: false };
      pendingDownloads[String(downloadId)] = pending;
      delete pendingByFilename[base];
      await storage.set({ pendingDownloads, pendingByFilename });
    }
  }
  if (!pending) return { known: false };
  if (!item) return { known: true, state: "missing" };
  if (item.state === "in_progress") return { known: true, state: "in_progress" };
  if (item.state === "interrupted") {
    pending.state = "interrupted";
    pending.finalized = true;
    pending.error = item.error || "interrupted";
    await storage.set({ pendingDownloads });
    return { known: true, state: "interrupted", error: pending.error };
  }
  if (pending.finalized) return { known: true, state: "complete", moved: pending.moved };

  if (moving.has(downloadId)) return { known: true, state: "complete" };
  moving.add(downloadId);
  try {
    const settings = await getSettings();
    const source = item.filename || pending.filename || "";
    let moved = null;
    if (settings.autoMove && source) {
      moved = await sendNative({ cmd: "move", from: source, dir: settings.musicDir });
      if (!moved.ok) {
        // Retry once: the file may still be locked by the browser.
        await new Promise((r) => setTimeout(r, 700));
        moved = await sendNative({ cmd: "move", from: source, dir: settings.musicDir });
      }
    }

    const finalPath = (moved && moved.ok && moved.path) || source;
    const name = finalPath.split(/[\\/]/).pop();

    if (moved && moved.ok) {
      const index = await readIndex();
      if (index) {
        addFileToIndex(index, {
          name,
          ext: name.split(".").pop(),
          size: item.fileSize || item.bytesReceived || 0,
          tags: pending.tags || {
            artist: pending.artist || "",
            title: pending.title || "",
            album: pending.album || "",
          },
        });
        await storage.set({ musicIndex: index });
      }
      if (
        settings.upgradeCleanup &&
        /\.flac$/i.test(name) &&
        (pending.trackKey || (pending.replacedFiles && pending.replacedFiles.length))
      ) {
        await cleanupReplacedMp3(settings.musicDir, pending);
      }
    }

    pending.finalized = true;
    pending.state = "complete";
    pending.moved = moved;
    pending.path = finalPath;
    await storage.set({ pendingDownloads });

    const log = (await storage.get("downloadLog")).downloadLog || [];
    log.unshift({
      at: Date.now(),
      name,
      action: (moved && moved.action) || "kept",
      error: moved && !moved.ok ? moved.error : "",
    });
    await storage.set({ downloadLog: log.slice(0, 100) });

    return { known: true, state: "complete", moved, path: finalPath, action: moved && moved.action };
  } finally {
    moving.delete(downloadId);
  }
}

async function cleanupReplacedMp3(dir, pending) {
  try {
    const index = await readIndex();
    const names = new Set();
    for (const name of pending.replacedFiles || []) {
      if (/\.mp3$/i.test(name)) names.add(name);
    }
    if (!names.size && index && pending.trackKey) {
      for (const key of pending.trackKey) {
        for (const name of index.strong[key] || []) {
          if (/\.mp3$/i.test(name)) names.add(name);
        }
      }
    }
    if (!names.size) return;
    for (const name of names) {
      const r = await sendNative({ cmd: "move", from: dir + "\\" + name, dir: dir + "\\_replaced_mp3" });
      if (r.ok && index) removeFileFromIndex(index, name);
    }
    if (index) await storage.set({ musicIndex: index });
  } catch (_) {}
}

async function startDownload(message) {
  const filename = message.filename || "track.mp3";
  const tags = {
    artist: message.artist || "",
    title: message.title || "",
    album: message.album || "",
  };
  const trackKey = message.trackKey || [];
  const replacedFiles = Array.isArray(message.replacedFiles) ? message.replacedFiles : [];

  const { pendingByFilename = {} } = await storage.get("pendingByFilename");
  pendingByFilename[filename] = {
    filename,
    tags,
    trackKey,
    replacedFiles,
    createdAt: Date.now(),
  };
  await storage.set({ pendingByFilename });

  const run = (name) =>
    new Promise((resolve) => {
      chrome.downloads.download(
        { url: message.url, filename: name, conflictAction: "overwrite", saveAs: false },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err || downloadId === undefined) {
            resolve({ error: (err && err.message) || "download failed" });
          } else {
            resolve({ downloadId, filename: name });
          }
        },
      );
    });

  let result = await run(filename);
  if (result.error && /invalid filename/i.test(result.error)) {
    const ext = (filename.match(/\.([a-z0-9]+)$/i) || [null, "mp3"])[1];
    result = await run(Math.floor(Math.random() * 1e15) + "." + ext);
  }
  if (result.error) return { status: "error", error: result.error };

  const { pendingDownloads = {} } = await storage.get("pendingDownloads");
  pendingDownloads[String(result.downloadId)] = {
    filename: result.filename,
    tags,
    trackKey,
    replacedFiles,
    startedAt: Date.now(),
    state: "in_progress",
    finalized: false,
  };
  delete pendingByFilename[filename];
  await storage.set({ pendingDownloads, pendingByFilename });
  return { status: "started", downloadId: result.downloadId };
}

/* ------------------------------ Yandex tabs ------------------------------ */

function findMusicTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: TAB_URLS }, (tabs) => resolve(tabs || []));
  });
}

async function findMusicTab() {
  const tabs = await findMusicTabs();
  return tabs[0] || null;
}

function reloadTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, {}, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function waitTabComplete(tabId, timeout = 25000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve(false);
        if (tab.status === "complete") return resolve(true);
        if (Date.now() - started > timeout) return resolve(false);
        setTimeout(check, 300);
      });
    };
    check();
  });
}

function sendToTab(tabId, payload, timeout = 15000) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(response || { ok: true });
    });
    setTimeout(() => resolve({ ok: false, error: "timeout" }), timeout);
  });
}

async function ensureMusicTab() {
  const tabs = await findMusicTabs();
  for (const tab of tabs) {
    if (await pingTab(tab.id, 3, 1500)) return tab;
  }

  if (tabs.length) {
    // The page was opened before the extension was installed or updated, so it
    // has no (current) content script. A reload injects it without a new tab.
    const tab = tabs[0];
    try {
      await reloadTab(tab.id);
      if (await pingTab(tab.id, 30)) return tab;
    } catch (_) {}
  }

  // A tab that existed before the extension was loaded has no content script.
  // Open a fresh background tab (cookies are shared, so the session is kept).
  const tab = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url: "https://music.yandex.ru/", active: false }, (t) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(t);
    });
  });
  await waitTabComplete(tab.id);
  if (await pingTab(tab.id, 30)) return tab;

  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tab.id, {}, () => {
      pingTab(tab.id, 30).then((ok) => {
        if (ok) resolve(tab);
        else
          reject(
            new Error(
              "Не удалось связаться со страницей Яндекс.Музыки. Откройте https://music.yandex.ru/ и войдите в аккаунт.",
            ),
          );
      });
    });
  });
}

function pingTab(tabId, attempts = 20, timeout = 3000) {
  const expected = chrome.runtime.getManifest().version;
  return (async () => {
    for (let i = 0; i < attempts; i++) {
      const ping = await sendToTab(tabId, { type: "ympPing" }, timeout);
      // A content script left over from an older version answers without `v`.
      // Treat it as stale so callers reload the tab instead of failing later.
      if (ping && ping.ok && ping.v === expected) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })();
}

/* ------------------------------- messaging ------------------------------- */

async function handleMessage(message, sender) {
  const type = message && (message.type || message.message);

  switch (type) {
    case "ympPing":
      return { ok: true };

    case "check":
      return { status: false };

    case "getSettings": {
      const settings = await getSettings();
      const index = await readIndex();
      const extra = await storage.get(["scanStatus", "libraryStatus", "downloadProgress", "lastScan"]);
      return {
        ok: true,
        settings,
        index: index
          ? { total: index.total, dir: index.dir, updatedAt: index.updatedAt, files: index.files.length }
          : null,
        ...extra,
      };
    }

    case "saveSettings": {
      await storage.set(message.settings || {});
      return { ok: true, settings: await getSettings() };
    }

    case "scanLocal": {
      const settings = await getSettings();
      const index = await scanLocal(message.dir || settings.musicDir);
      return { ok: true, total: index.total, dir: index.dir };
    }

    case "hostPing": {
      const settings = await getSettings();
      return await sendNative({ cmd: "ping", dir: settings.musicDir });
    }

    case "openMusicFolder": {
      return await sendNative({ cmd: "open", dir: (await getSettings()).musicDir });
    }

    case "downloadInfo": {
      try {
        const response = await fetch(message.url, { headers: message.headers || {} });
        if (!response.ok) return { ok: false, error: "HTTP " + response.status };
        return await response.json();
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case "download":
      return await startDownload(message);

    case "checkBrowserDownloadStatus": {
      const result = await finalizeDownload(message.downloadId);
      return { isFinished: result.state !== "in_progress", ...result };
    }

    case "startLibraryFetch": {
      const tab = await ensureMusicTab();
      const sources = message.sources || (await getSettings()).reportSources;
      await setStatus("libraryStatus", { state: "starting", sources });
      const response = await sendToTab(tab.id, { type: "ympFetchLibrary", sources });
      if (!response.ok) throw new Error(response.error || "Не удалось запустить сбор библиотеки");
      return { ok: true, tabId: tab.id };
    }

    case "downloadTracks": {
      const tab = await ensureMusicTab();
      const tracks = (message.tracks || []).slice(0, 20000);
      await setStatus("downloadProgress", {
        state: "running",
        total: tracks.length,
        done: 0,
        failed: 0,
        skipped: 0,
        startedAt: Date.now(),
      });
      const response = await sendToTab(
        tab.id,
        {
          type: "ympDownloadTracks",
          tracks,
        },
        20000,
      );
      if (!response.ok) throw new Error(response.error || "Не удалось запустить скачивание");
      return { ok: true, accepted: response.accepted || tracks.length };
    }

    case "stopDownloads": {
      const tab = await findMusicTab();
      if (tab) await sendToTab(tab.id, { type: "ympStopDownloads" }, 3000);
      await setStatus("downloadProgress", { state: "stopped" });
      return { ok: true };
    }

    case "getProgress": {
      return {
        ok: true,
        ...(await storage.get(["libraryStatus", "downloadProgress", "scanStatus", "downloadLog"])),
      };
    }

    case "clearSnapshot":
      await storage.remove("librarySnapshot");
      return { ok: true };

    case "openLibraryPage": {
      const url = chrome.runtime.getURL("html/library.html");
      await new Promise((resolve) => {
        chrome.tabs.query({ url }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.update(tabs[0].id, { active: true }, () => resolve());
          } else {
            chrome.tabs.create({ url }, () => resolve());
          }
        });
      });
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unknown message: " + type };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }),
    );
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && (delta.state.current === "complete" || delta.state.current === "interrupted")) {
    finalizeDownload(delta.id).catch(() => {});
  }
});

ensureDefaults().catch(() => {});
