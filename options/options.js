/* YandexMusic.pro — options page. */
(() => {
  "use strict";

  const chromeApi = globalThis.browser || globalThis.chrome;
  const $ = (id) => document.getElementById(id);

  const TEXT_IDS = ["musicDir", "path"];
  const SELECT_IDS = ["formatPolicy", "format", "quality", "cover"];
  const CHECK_IDS = ["skipExisting", "autoMove", "upgradeCleanup", "tags", "position", "folder"];
  const SOURCE_IDS = { likes: "srcLikes", playlists: "srcPlaylists", albums: "srcAlbums" };

  let pollTimer = null;

  function send(message) {
    return new Promise((resolve) => {
      chromeApi.runtime.sendMessage(message, (response) => {
        if (chromeApi.runtime.lastError) {
          resolve({ ok: false, error: chromeApi.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "Нет ответа от расширения" });
      });
    });
  }

  function setStatus(element, text, kind) {
    if (!element) return;
    element.textContent = text || "";
    element.className = "status" + (kind ? " " + kind : "");
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 Б";
    const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return value.toFixed(index === 0 ? 0 : 1) + " " + units[index];
  }

  function formatDate(timestamp) {
    if (!timestamp) return "";
    try {
      return new Date(timestamp).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  }

  async function loadState() {
    const result = await send({ type: "getSettings" });
    if (!result.ok) {
      setStatus($("helperStatus"), result.error || "Не удалось загрузить настройки", "error");
      return;
    }
    const settings = result.settings || {};

    for (const id of TEXT_IDS) {
      if ($(id)) $(id).value = settings[id] || "";
    }
    for (const id of SELECT_IDS) {
      if ($(id) && settings[id] !== undefined) $(id).value = settings[id];
    }
    for (const id of CHECK_IDS) {
      if ($(id)) $(id).checked = settings[id] !== false;
    }
    const sources = settings.reportSources || { likes: true, playlists: true, albums: true };
    for (const [key, id] of Object.entries(SOURCE_IDS)) {
      if ($(id)) $(id).checked = sources[key] !== false;
    }

    if ($("pathBlock")) {
      $("pathBlock").classList.toggle("is-hidden", !settings.folder);
    }
    if ($("qualityBlock")) {
      $("qualityBlock").classList.toggle("is-hidden", settings.format === "flac");
    }

    if (result.index) {
      setStatus(
        $("scanStatus"),
        `В папке ${result.index.total} файлов · обновлено ${formatDate(result.index.updatedAt)}`,
        "ok",
      );
    } else if (result.scanStatus && result.scanStatus.state === "error") {
      setStatus($("scanStatus"), result.scanStatus.error, "error");
    }

    renderLibraryStatus(result.libraryStatus);
  }

  async function save(patch) {
    const result = await send({ type: "saveSettings", settings: patch });
    return result.ok;
  }

  function bindInputs() {
    for (const id of SELECT_IDS) {
      const element = $(id);
      if (!element) continue;
      element.addEventListener("change", async () => {
        await save({ [id]: element.value });
        if (id === "format" && $("qualityBlock")) {
          $("qualityBlock").classList.toggle("is-hidden", element.value === "flac");
        }
      });
    }

    for (const id of CHECK_IDS) {
      const element = $(id);
      if (!element) continue;
      element.addEventListener("change", async () => {
        await save({ [id]: element.checked });
        if (id === "folder" && $("pathBlock")) {
          $("pathBlock").classList.toggle("is-hidden", !element.checked);
        }
      });
    }

    for (const [key, id] of Object.entries(SOURCE_IDS)) {
      const element = $(id);
      if (!element) continue;
      element.addEventListener("change", async () => {
        const sources = {};
        for (const [sourceKey, sourceId] of Object.entries(SOURCE_IDS)) {
          sources[sourceKey] = $(sourceId) ? $(sourceId).checked : true;
        }
        await save({ reportSources: sources });
      });
    }

    for (const id of TEXT_IDS) {
      const element = $(id);
      if (!element) continue;
      element.addEventListener("change", async () => {
        const value = element.value.trim();
        element.value = value;
        await save({ [id]: value });
        if (id === "musicDir" && value) {
          setStatus($("helperStatus"), "Путь сохранён. Нажмите «Обновить список файлов».", "ok");
        }
      });
    }
  }

  async function checkHelper() {
    const button = $("checkHelper");
    button.disabled = true;
    setStatus($("helperStatus"), "Проверяем локальный помощник…");
    try {
      const dir = $("musicDir").value.trim();
      if (dir) await save({ musicDir: dir });
      const result = await send({ type: "hostPing" });
      if (!result.ok) {
        setStatus(
          $("helperStatus"),
          "Помощник не отвечает: " + (result.error || "неизвестная ошибка") +
            "\nЗапустите native\\install.ps1 из папки расширения.",
          "error",
        );
        return;
      }
      setStatus(
        $("helperStatus"),
        `Помощник работает (Node ${result.node || "?"}). Папка ${result.dirExists ? "найдена" : "не найдена"}.`,
        result.dirExists ? "ok" : "warn",
      );
    } finally {
      button.disabled = false;
    }
  }

  async function scanFolder() {
    const button = $("scanFolder");
    button.disabled = true;
    const dir = $("musicDir").value.trim();
    if (dir) await save({ musicDir: dir });
    setStatus($("scanStatus"), "Читаем файлы и теги… Это может занять несколько секунд.");
    try {
      const result = await send({ type: "scanLocal", dir });
      if (!result.ok) {
        setStatus($("scanStatus"), "Ошибка: " + (result.error || "не удалось прочитать папку"), "error");
        return;
      }
      setStatus($("scanStatus"), `Готово: ${result.total} файлов в ${result.dir}`, "ok");
    } finally {
      button.disabled = false;
    }
  }

  function renderLibraryStatus(status) {
    const bar = $("libraryBar");
    const text = $("libraryStatus");
    if (!status) {
      bar.classList.remove("indeterminate");
      bar.style.width = "0%";
      setStatus(text, "Проверка ещё не запускалась.");
      return;
    }
    if (status.state === "error") {
      bar.classList.remove("indeterminate");
      bar.style.width = "0%";
      setStatus(text, status.error || status.message || "Ошибка проверки", "error");
      return;
    }
    if (status.state === "done") {
      bar.classList.remove("indeterminate");
      bar.style.width = "100%";
      const counts = status.counts || {};
      const details = [
        counts.likes ? `лайки: ${counts.likes}` : "",
        counts.playlists ? `плейлисты: ${counts.playlists}` : "",
        counts.albums ? `альбомы: ${counts.albums}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const warnings = [];
      if (counts.playlistsError) warnings.push(`плейлисты — ${counts.playlistsError}`);
      if (counts.albumsError) warnings.push(`альбомы — ${counts.albumsError}`);
      const suffix = warnings.length
        ? ` Не загрузилось: ${warnings.join("; ")}.`
        : " Откройте отчёт для подробностей.";
      setStatus(
        text,
        `Готово: ${status.total || 0} треков${details ? " (" + details + ")" : ""}.${suffix}`,
        warnings.length ? "warn" : "ok",
      );
      return;
    }
    const total = status.total || 0;
    const done = status.done || 0;
    if (total > 0) {
      bar.classList.remove("indeterminate");
      bar.style.width = Math.min(100, Math.round((done / total) * 100)) + "%";
    } else {
      bar.classList.add("indeterminate");
      bar.style.width = "35%";
    }
    setStatus(text, status.message || "Проверяем библиотеку…");
  }

  async function startLibraryCheck() {
    const button = $("checkLibrary");
    button.disabled = true;
    const sources = {};
    for (const [key, id] of Object.entries(SOURCE_IDS)) {
      sources[key] = $(id) ? $(id).checked : true;
    }
    await save({ reportSources: sources });
    setStatus($("libraryStatus"), "Открываем music.yandex.ru и собираем список треков…");
    try {
      const result = await send({ type: "startLibraryFetch", sources });
      if (!result.ok) {
        setStatus($("libraryStatus"), result.error || "Не удалось начать проверку", "error");
      }
    } finally {
      button.disabled = false;
      startPolling();
    }
  }

  async function refreshProgress() {
    const result = await send({ type: "getProgress" });
    if (result.ok) renderLibraryStatus(result.libraryStatus);
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(refreshProgress, 1200);
    setTimeout(() => {
      clearInterval(pollTimer);
      pollTimer = null;
    }, 30 * 60 * 1000);
  }

  function bindButtons() {
    $("checkHelper").addEventListener("click", checkHelper);
    $("scanFolder").addEventListener("click", scanFolder);
    $("openFolder").addEventListener("click", async () => {
      const dir = $("musicDir").value.trim();
      if (dir) await save({ musicDir: dir });
      const result = await send({ type: "openMusicFolder" });
      if (!result.ok) setStatus($("helperStatus"), result.error || "Не удалось открыть папку", "error");
    });
    $("checkLibrary").addEventListener("click", startLibraryCheck);
    $("openReport").addEventListener("click", () => send({ type: "openLibraryPage" }));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindInputs();
    bindButtons();
    await loadState();
    startPolling();
    setTimeout(() => {
      clearInterval(pollTimer);
      pollTimer = null;
    }, 60 * 1000);
  });
})();
