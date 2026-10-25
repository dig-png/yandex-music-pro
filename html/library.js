/* YandexMusic.pro — library comparison report. */
(() => {
  "use strict";

  const chromeApi = globalThis.chrome;
  const M = globalThis.YMPMatch;
  const $ = (id) => document.getElementById(id);
  const MAX_ROWS = 700;

  const state = {
    index: null,
    snapshot: null,
    settings: { format: "flac", formatPolicy: "upgrade" },
    comparison: null,
    filter: "missing",
    query: "",
    selected: new Set(),
    download: null,
    library: null,
  };

  let renderTimer = null;

  function getStore(keys) {
    return new Promise((resolve) => {
      chromeApi.storage.local.get(keys, (value) => resolve(value || {}));
    });
  }

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

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    try {
      return new Date(timestamp).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "—";
    }
  }

  function trackName(track) {
    return [track.title, track.version ? "(" + track.version + ")" : ""].filter(Boolean).join(" ");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function fileExt(name) {
    const match = String(name || "").match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function extPill(name) {
    const ext = fileExt(name);
    return el("span", "pill " + (ext === "flac" ? "flac" : "mp3"), ext ? ext.toUpperCase() : "?");
  }

  function coverCell(track) {
    const cell = el("td", "cover");
    if (track && track.cover) {
      const img = el("img");
      img.src = track.cover;
      img.loading = "lazy";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      cell.appendChild(img);
    }
    return cell;
  }

  function trackCell(track, extra) {
    const cell = el("td");
    const wrap = el("div", "title-cell");
    const name = el("div", "name", trackName(track) || "(без названия)");
    const meta = el(
      "div",
      "meta",
      [track.artist || "неизвестный артист", extra || ""].filter(Boolean).join(" · "),
    );
    name.title = trackName(track);
    wrap.appendChild(name);
    wrap.appendChild(meta);
    cell.appendChild(wrap);
    return cell;
  }

  /* ------------------------------- data ---------------------------------- */

  async function load() {
    const data = await getStore([
      "musicIndex",
      "librarySnapshot",
      "format",
      "formatPolicy",
      "skipExisting",
      "musicDir",
      "libraryStatus",
      "downloadProgress",
      "scanStatus",
    ]);

    state.index = data.musicIndex || null;
    state.snapshot = data.librarySnapshot || null;
    state.download = data.downloadProgress || null;
    state.library = data.libraryStatus || null;
    state.settings = {
      format: data.format || "flac",
      formatPolicy: data.formatPolicy || "upgrade",
      skipExisting: data.skipExisting !== false,
      musicDir: data.musicDir || "",
    };

    state.comparison =
      state.index && state.snapshot && M
        ? M.compare(state.index, state.snapshot, state.settings)
        : null;

    const missingIds = new Set(
      state.comparison ? state.comparison.missing.map((row) => String(row.track.id)) : [],
    );
    for (const id of [...state.selected]) {
      if (!missingIds.has(id)) state.selected.delete(id);
    }

    render();
  }

  function scheduleLoad() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(load, 250);
  }

  /* ------------------------------ rendering ------------------------------- */

  function render() {
    renderHeader();
    renderStats();
    renderBadges();
    renderProgress();
    renderTable();
    renderSelection();
  }

  function renderHeader() {
    const parts = [];
    if (state.snapshot) {
      parts.push("Аккаунт: " + (state.snapshot.uid || "—"));
      parts.push("Яндекс проверен: " + formatDate(state.snapshot.fetchedAt));
    } else {
      parts.push("Библиотека Яндекса ещё не загружена");
    }
    parts.push("Папка: " + (state.settings.musicDir || "не задана"));
    if (state.index) parts.push("Файлов в папке: " + state.index.total);
    $("subtitle").textContent = parts.join(" · ");
  }

  function renderStats() {
    const c = state.comparison;
    const libraryCount = state.snapshot ? state.snapshot.tracks.length : 0;
    const localCount = state.index ? state.index.total : 0;
    $("statLibrary").textContent = libraryCount || "—";
    $("statLocal").textContent = localCount || "—";
    if (!c) {
      for (const id of ["statFound", "statMissing", "statExtra", "statDup"]) $(id).textContent = "—";
      return;
    }
    $("statFound").textContent = c.found.length - c.weak.length;
    $("statMissing").textContent = c.missing.length;
    $("statExtra").textContent = c.extra.length;
    $("statDup").textContent = c.duplicates.length;
  }

  function renderBadges() {
    const c = state.comparison;
    const counts = {
      missing: c ? c.missing.length : 0,
      found: c ? c.found.length - c.weak.length : 0,
      weak: c ? c.weak.length : 0,
      extra: c ? c.extra.length : 0,
      duplicates: c ? c.duplicates.length : 0,
    };
    $("badgeMissing").textContent = counts.missing;
    $("badgeFound").textContent = counts.found;
    $("badgeWeak").textContent = counts.weak;
    $("badgeExtra").textContent = counts.extra;
    $("badgeDup").textContent = counts.duplicates;
    for (const tab of document.querySelectorAll(".tab")) {
      tab.classList.toggle("active", tab.dataset.filter === state.filter);
    }
  }

  function renderProgress() {
    const bar = $("progressBar");
    const status = $("status");
    const download = state.download;
    const stale = (value, limit) =>
      !value || !value.updatedAt || Date.now() - value.updatedAt > limit;

    if (download && download.state === "running" && !stale(download, 15 * 60 * 1000)) {
      const total = download.total || 0;
      const done = download.done || 0;
      let width = 0;
      if (total > 0) width = Math.min(100, Math.round((done / total) * 100));
      bar.style.width = width + "%";
      status.className = "status";
      status.textContent =
        `Скачиваем: ${done} из ${total}` +
        (download.failed ? ` · ошибок ${download.failed}` : "") +
        (download.skipped ? ` · пропущено ${download.skipped}` : "");
      $("stopDownloads").disabled = false;
      $("downloadMissing").disabled = true;
      return;
    }

    $("stopDownloads").disabled = true;

    if (download && (download.state === "done" || download.state === "stopped")) {
      bar.style.width = "100%";
      status.className = "status " + (download.failed ? "error" : "ok");
      status.textContent =
        download.message ||
        `${download.state === "stopped" ? "Остановлено" : "Готово"}: скачано ${download.done || 0}, ошибок ${download.failed || 0}, пропущено ${download.skipped || 0}`;
      return;
    }

    if (state.library && state.library.state === "running" && !stale(state.library, 5 * 60 * 1000)) {
      const total = state.library.total || 0;
      const done = state.library.done || 0;
      bar.style.width = total > 0 ? Math.min(100, Math.round((done / total) * 100)) + "%" : "0%";
      status.className = "status";
      status.textContent = state.library.message || "Собираем библиотеку…";
      $("downloadMissing").disabled = true;
      return;
    }

    const libraryErrorIsNewer =
      !state.snapshot || !state.snapshot.fetchedAt || (state.library.updatedAt || 0) > state.snapshot.fetchedAt;

    if (state.library && state.library.state === "error" && libraryErrorIsNewer) {
      bar.style.width = "0%";
      status.className = "status error";
      status.textContent = state.library.error || "Ошибка загрузки библиотеки";
      return;
    }

    if (!state.comparison) {
      bar.style.width = "0%";
      status.className = "status";
      status.textContent = !state.snapshot
        ? "Нажмите «Проверить библиотеку», чтобы загрузить список треков из аккаунта."
        : "Нужно обновить список файлов в папке — нажмите «Обновить список файлов».";
      return;
    }

    bar.style.width = "100%";
    status.className = "status ok";
    status.textContent = `Сверка готова: ${state.comparison.totalLibrary} треков в Яндексе, ${state.comparison.totalLocal} файлов на диске.`;
  }

  function currentRows() {
    const c = state.comparison;
    if (!c) return [];
    const query = state.query.trim().toLowerCase();
    const matches = (text) => !query || String(text || "").toLowerCase().includes(query);

    if (state.filter === "missing") {
      return c.missing.filter((row) =>
        matches(row.track.artist + " " + trackName(row.track) + " " + row.track.album),
      );
    }
    if (state.filter === "found") {
      return c.found
        .filter((row) => !c.weak.includes(row))
        .filter((row) =>
          matches(row.track.artist + " " + trackName(row.track) + " " + row.files.join(" ")),
        );
    }
    if (state.filter === "weak") {
      return c.weak.filter((row) =>
        matches(row.track.artist + " " + trackName(row.track) + " " + row.files.join(" ")),
      );
    }
    if (state.filter === "extra") {
      return c.extra.filter((file) =>
        matches(file.name + " " + file.artist + " " + file.title),
      );
    }
    return c.duplicates.filter((group) => matches(group.key + " " + group.files.join(" ")));
  }

  function renderTable() {
    const thead = $("thead");
    const tbody = $("tbody");
    thead.textContent = "";
    tbody.textContent = "";

    const headerRow = el("tr");

    if (state.filter === "duplicates") {
      headerRow.appendChild(el("th", null, "Совпадение"));
      headerRow.appendChild(el("th", null, "Файлы"));
    } else if (state.filter === "extra") {
      headerRow.appendChild(el("th", null, "Файл"));
      headerRow.appendChild(el("th", null, "Теги"));
      headerRow.appendChild(el("th", null, "Формат"));
    } else {
      headerRow.appendChild(el("th", "small", ""));
      headerRow.appendChild(el("th", null, ""));
      headerRow.appendChild(el("th", null, "Трек"));
      headerRow.appendChild(el("th", null, "Альбом"));
      headerRow.appendChild(el("th", null, "Год"));
      headerRow.appendChild(el("th", null, state.filter === "missing" ? "Статус" : "Файл"));
    }
    thead.appendChild(headerRow);

    if (!state.comparison) {
      const row = el("tr");
      const cell = el("td", "empty", "Нет данных для отображения.");
      cell.colSpan = 6;
      row.appendChild(cell);
      tbody.appendChild(row);
      $("tableNote").textContent = "";
      return;
    }

    const rows = currentRows();
    if (!rows.length) {
      const row = el("tr");
      const cell = el("td", "empty", state.query ? "Ничего не найдено." : "Здесь пусто.");
      cell.colSpan = 6;
      row.appendChild(cell);
      tbody.appendChild(row);
      $("tableNote").textContent = "";
      return;
    }

    const visible = rows.slice(0, MAX_ROWS);

    if (state.filter === "duplicates") {
      for (const group of visible) {
        const row = el("tr");
        row.appendChild(el("td", "mono", group.key.replace("|", " — ")));
        row.appendChild(el("td", "mono", group.files.join("\n")));
        tbody.appendChild(row);
      }
    } else if (state.filter === "extra") {
      for (const file of visible) {
        const row = el("tr");
        const nameCell = el("td");
        nameCell.appendChild(el("div", "mono", file.name));
        row.appendChild(nameCell);
        const tags = [file.artist, file.title].filter(Boolean).join(" — ") || "—";
        row.appendChild(el("td", null, tags));
        const formatCell = el("td");
        formatCell.appendChild(extPill(file.name));
        row.appendChild(formatCell);
        tbody.appendChild(row);
      }
    } else {
      for (const item of visible) {
        const track = item.track;
        const row = el("tr");

        if (state.filter === "missing") {
          const checkCell = el("td", "small");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = state.selected.has(String(track.id));
          checkbox.addEventListener("change", () => {
            const id = String(track.id);
            if (checkbox.checked) state.selected.add(id);
            else state.selected.delete(id);
            renderSelection();
          });
          checkCell.appendChild(checkbox);
          row.appendChild(checkCell);
          row.addEventListener("click", (event) => {
            if (event.target === checkbox || event.target.tagName === "INPUT") return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event("change"));
          });
        } else {
          row.appendChild(el("td", "small", ""));
        }

        row.appendChild(coverCell(track));
        row.appendChild(trackCell(track, track.label || ""));
        row.appendChild(el("td", null, track.album || "—"));
        row.appendChild(el("td", null, track.year || "—"));

        const last = el("td");
        if (state.filter === "missing") {
          const pill = el(
            "span",
            "pill " + (item.blockedByFormat ? "mp3" : "need"),
            item.blockedByFormat ? "Есть MP3 → нужен FLAC" : "Нет файла",
          );
          last.appendChild(pill);
        } else if (state.filter === "weak") {
          last.appendChild(el("span", "pill weak", "слабое совпадение"));
          last.appendChild(el("div", "mono", item.files.join("\n")));
        } else {
          last.appendChild(extPill(item.files[0]));
          last.appendChild(el("div", "mono", item.files.join("\n")));
        }
        row.appendChild(last);

        tbody.appendChild(row);
      }
    }

    $("tableNote").textContent =
      rows.length > visible.length
        ? `Показано ${visible.length} из ${rows.length}. Уточните поиск, чтобы увидеть остальные.`
        : `Всего: ${rows.length}.`;
  }

  function renderSelection() {
    const button = $("downloadMissing");
    const missing = state.comparison ? state.comparison.missing.length : 0;
    const count = state.selected.size;
    const downloading = state.download && state.download.state === "running";
    const fetching = state.library && state.library.state === "running";
    $("selectAll").checked = missing > 0 && count === missing;
    button.disabled = missing === 0 || downloading || fetching;
    button.textContent = count
      ? `Скачать выбранные (${count})`
      : `Скачать отсутствующие (${missing})`;
    $("selection").textContent = count ? `Выбрано: ${count}` : "Ничего не выбрано";
  }

  /* ------------------------------ actions --------------------------------- */

  async function startLibraryCheck() {
    const sources = state.settings.reportSources || { likes: true, playlists: true, albums: true };
    $("refreshLibrary").disabled = true;
    $("status").className = "status";
    $("status").textContent = "Открываем music.yandex.ru и собираем список треков…";
    try {
      const result = await send({ type: "startLibraryFetch", sources });
      if (!result.ok) {
        $("status").className = "status error";
        $("status").textContent = result.error || "Не удалось начать проверку";
      }
    } finally {
      $("refreshLibrary").disabled = false;
    }
  }

  async function scanLocal() {
    $("refreshLocal").disabled = true;
    $("status").className = "status";
    $("status").textContent = "Читаем файлы и теги…";
    try {
      const result = await send({ type: "scanLocal" });
      if (!result.ok) {
        $("status").className = "status error";
        $("status").textContent = result.error || "Не удалось прочитать папку";
        return;
      }
      await load();
    } finally {
      $("refreshLocal").disabled = false;
    }
  }

  async function downloadMissing() {
    const missing = state.comparison ? state.comparison.missing : [];
    const selected = state.selected.size
      ? missing.filter((row) => state.selected.has(String(row.track.id)))
      : missing;
    const tracks = selected.map((row) => row.track);
    if (!tracks.length) return;
    $("downloadMissing").disabled = true;
    $("status").className = "status";
    $("status").textContent = "Передаём список в Яндекс.Музыку…";
    try {
      const result = await send({ type: "downloadTracks", tracks });
      if (!result.ok) {
        $("status").className = "status error";
        $("status").textContent = result.error || "Не удалось запустить скачивание";
      }
    } finally {
      load();
    }
  }

  function csvEscape(value) {
    const text = String(value === undefined || value === null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    if (!state.comparison) return;
    const rows = currentRows();
    const lines = [["status", "artist", "title", "album", "year", "files", "format"].map(csvEscape).join(";")];

    if (state.filter === "extra") {
      for (const file of rows) {
        lines.push(
          ["extra", file.artist, file.title, file.album, "", file.name, fileExt(file.name)]
            .map(csvEscape)
            .join(";"),
        );
      }
    } else if (state.filter === "duplicates") {
      for (const group of rows) {
        lines.push(["duplicate", "", group.key, "", "", group.files.join(" | "), ""].map(csvEscape).join(";"));
      }
    } else {
      for (const item of rows) {
        const track = item.track;
        const status =
          state.filter === "missing"
            ? item.blockedByFormat
              ? "need-flac"
              : "missing"
            : state.filter === "weak"
              ? "weak"
              : "found";
        const files = item.files || [];
        lines.push(
          [
            status,
            track.artist,
            trackName(track),
            track.album,
            track.year,
            files.join(" | "),
            files[0] ? fileExt(files[0]) : "",
          ]
            .map(csvEscape)
            .join(";"),
        );
      }
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "ymp-library-" + state.filter + ".csv");
  }

  function exportJson() {
    if (!state.comparison) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      musicDir: state.settings.musicDir,
      settings: state.settings,
      snapshot: {
        uid: state.snapshot.uid,
        fetchedAt: state.snapshot.fetchedAt,
        counts: state.snapshot.counts,
        tracks: state.snapshot.tracks,
      },
      comparison: {
        missing: state.comparison.missing.map((row) => ({
          id: row.track.id,
          artist: row.track.artist,
          title: trackName(row.track),
          album: row.track.album,
          year: row.track.year,
          blockedByFormat: row.blockedByFormat,
        })),
        found: state.comparison.found.map((row) => ({
          id: row.track.id,
          artist: row.track.artist,
          title: trackName(row.track),
          files: row.files,
        })),
        extra: state.comparison.extra,
        duplicates: state.comparison.duplicates,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    triggerDownload(blob, "ymp-library-report.json");
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ------------------------------- wiring --------------------------------- */

  function bind() {
    for (const tab of document.querySelectorAll(".tab")) {
      tab.addEventListener("click", () => {
        state.filter = tab.dataset.filter;
        render();
      });
    }

    $("search").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderTable();
    });

    $("selectAll").addEventListener("change", (event) => {
      if (!state.comparison) return;
      state.selected = event.target.checked
        ? new Set(state.comparison.missing.map((row) => String(row.track.id)))
        : new Set();
      renderTable();
      renderSelection();
    });

    $("downloadMissing").addEventListener("click", downloadMissing);
    $("stopDownloads").addEventListener("click", async () => {
      await send({ type: "stopDownloads" });
    });
    $("refreshLocal").addEventListener("click", scanLocal);
    $("refreshLibrary").addEventListener("click", startLibraryCheck);
    $("exportCsv").addEventListener("click", exportCsv);
    $("exportJson").addEventListener("click", exportJson);
    $("openOptions").addEventListener("click", () => chromeApi.runtime.openOptionsPage());

    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area && area !== "local") return;
      for (const key of [
        "musicIndex",
        "librarySnapshot",
        "libraryStatus",
        "downloadProgress",
        "format",
        "formatPolicy",
      ]) {
        if (changes[key]) {
          scheduleLoad();
          return;
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    const settingsResult = await send({ type: "getSettings" });
    if (settingsResult.ok && settingsResult.settings) {
      state.settings.reportSources = settingsResult.settings.reportSources;
    }
    await load();
    // Live progress for long operations.
    setInterval(() => {
      if (
        (state.download && state.download.state === "running") ||
        (state.library && state.library.state === "running")
      ) {
        load();
      }
    }, 2000);
  });
})();
