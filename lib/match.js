/*
 * YandexMusicPro — matching helpers.
 * Shared by content script, service worker and extension pages.
 */
(() => {
  const FEAT_RE = /[([{]\s*(?:feat|ft|with|prod|при уч)\.?\s[^)\]}]*[)\]}]/gi;
  const DASH_RE = /[\u2010-\u2015\u2212]/g;
  const QUOTE_RE = /[\u2018\u2019\u201a\u201b`\u00b4]/g;
  const DQUOTE_RE = /[\u201c\u201d\u00ab\u00bb]/g;

  function normalize(value) {
    if (value === null || value === undefined) return "";
    let s = String(value);
    try {
      s = s.normalize("NFKC");
    } catch (_) {}
    s = s.replace(/^\uFEFF/, "").replace(/\uFEFF/g, "");
    s = s.toLowerCase();
    s = s.replace(/ё/g, "е");
    s = s.replace(QUOTE_RE, "'").replace(DQUOTE_RE, '"').replace(DASH_RE, "-");
    s = s.replace(FEAT_RE, " ");
    s = s.replace(/\s+(?:feat|ft|featuring)\.?\s+.+$/i, " ");
    s = s.replace(/[^\p{L}\p{N}]+/gu, " ");
    return s.replace(/\s+/g, " ").trim();
  }

  function splitArtists(artist) {
    if (!artist) return [];
    return String(artist)
      .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\bvs\.?\b)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function artistKeys(artist) {
    const out = new Set();
    const full = normalize(artist);
    if (full) out.add(full);
    const parts = splitArtists(artist).map(normalize).filter(Boolean);
    if (parts.length > 1) {
      out.add([...parts].sort().join(" "));
      out.add(parts.join(" "));
    } else if (parts.length === 1) {
      out.add(parts[0]);
    }
    return [...out];
  }

  function titleKeys(title, version) {
    const out = new Set();
    const t = normalize(title);
    if (!t) return [];
    out.add(t);
    if (version) {
      const v = normalize(version);
      if (v) {
        out.add(normalize(String(title) + " " + String(version)));
        out.add(normalize(String(title) + " (" + String(version) + ")"));
      }
    }
    const noFeat = normalize(String(title || "").replace(FEAT_RE, " "));
    if (noFeat) out.add(noFeat);
    return [...out];
  }

  /** Keys for a track coming from the Yandex API (or from the page DOM). */
  function trackKeys(track) {
    const strong = new Set();
    const weak = new Set();
    const titles = titleKeys(track.title, track.version);
    const artistList = (track.artists || []).map((a) => a.name || a).filter(Boolean);
    const artist = track.artist || artistList.join(", ");
    const artists = artistKeys(artist);

    // "Track (feat. X)" — X may be part of the artist list in the file name.
    const featMatch = String(track.title || "").match(
      /[([{]\s*(?:feat|ft|with)\.?\s+([^)\]}]+)[)\]}]/i,
    );
    if (featMatch && featMatch[1]) {
      const feat = featMatch[1].trim();
      for (const extra of artistKeys(feat)) artists.push(extra);
      const combined = artistKeys(String(artist) + ", " + feat);
      for (const extra of combined) artists.push(extra);
    }

    const uniqueArtists = [...new Set(artists)];
    if (uniqueArtists.length && titles.length) {
      for (const a of uniqueArtists) for (const t of titles) strong.add(a + "|" + t);
    }
    for (const t of titles) weak.add(t);
    return { strong: [...strong], weak: [...weak] };
  }

  /** Keys for a local file (embedded tags have priority, filename is a fallback). */
  function fileKeys(file) {
    const strong = new Set();
    const weak = new Set();
    const tags = file.tags || {};
    const add = (artist, title, version) => {
      const titles = titleKeys(title, version);
      const artists = artistKeys(artist);
      if (artists.length && titles.length) {
        for (const a of artists) for (const t of titles) strong.add(a + "|" + t);
      } else if (titles.length) {
        for (const t of titles) weak.add(t);
      }
    };

    if (tags.title) add(tags.artist, tags.title, tags.version);

    const base = String(file.name || "").replace(/\.[a-z0-9]+$/i, "");
    const dash = base.indexOf(" - ");
    if (dash > 0) {
      add(base.slice(0, dash).trim(), base.slice(dash + 3).trim(), "");
    } else {
      const t = normalize(base);
      if (t) weak.add(t);
    }
    return { strong: [...strong], weak: [...weak] };
  }

  function buildIndex(files, dir) {
    const index = {
      version: 1,
      dir: dir || "",
      updatedAt: Date.now(),
      total: 0,
      files: [],
      byName: {},
      strong: {},
      weak: {},
    };
    for (const file of files || []) {
      if (!file || !file.name) continue;
      const ext = (file.ext || String(file.name).split(".").pop() || "").toLowerCase();
      const tags = file.tags || {};
      const entry = {
        name: file.name,
        ext,
        size: file.size || 0,
        mtime: file.mtime || 0,
        artist: tags.artist || "",
        title: tags.title || "",
        album: tags.album || "",
      };
      index.files.push(entry);
      index.byName[file.name] = ext;
      const keys = fileKeys({ name: file.name, tags });
      for (const key of keys.strong) (index.strong[key] ||= []).push(file.name);
      for (const key of keys.weak) (index.weak[key] ||= []).push(file.name);
    }
    index.total = index.files.length;
    return index;
  }

  function extAllowed(ext, settings) {
    const desired = (settings && settings.format) || "mp3";
    const policy = (settings && settings.formatPolicy) || "upgrade";
    if (desired === "flac" && policy !== "any") return ext === "flac";
    return true;
  }

  /**
   * Look a track up in the local index.
   * @returns {{found:boolean, files:string[], weak:boolean, blockedByFormat:boolean}}
   */
  function findLocal(index, track, settings) {
    const result = {
      found: false,
      files: [],
      weak: false,
      blockedByFormat: false,
      blockedFiles: [],
    };
    if (!index || !track) return result;
    const keys = trackKeys(track);

    for (const key of keys.strong) {
      const names = index.strong && index.strong[key];
      if (!names || !names.length) continue;
      const allowed = names.filter((name) => extAllowed(index.byName[name] || "", settings));
      if (allowed.length) {
        result.found = true;
        result.files = allowed;
        return result;
      }
      result.blockedByFormat = true;
      for (const name of names) {
        if (!result.blockedFiles.includes(name)) result.blockedFiles.push(name);
      }
    }

    // Weak match: only for files without an artist, and only when unambiguous.
    for (const key of keys.weak) {
      const names = index.weak && index.weak[key];
      if (names && names.length === 1) {
        const name = names[0];
        if (extAllowed(index.byName[name] || "", settings)) {
          result.found = true;
          result.files = names;
          result.weak = true;
          return result;
        }
        result.blockedByFormat = true;
        if (!result.blockedFiles.includes(name)) result.blockedFiles.push(name);
      }
    }
    return result;
  }

  function sameTrack(track, file, index) {
    return findLocal(index, track, { format: "any", formatPolicy: "any" }).files.includes(file.name);
  }

  function compare(index, snapshot, settings) {
    const found = [];
    const missing = [];
    const weak = [];
    const used = new Set();

    for (const track of (snapshot && snapshot.tracks) || []) {
      const match = findLocal(index, track, settings);
      if (match.found) {
        const row = { track, files: match.files };
        if (match.weak) {
          weak.push(row);
          found.push(row);
        } else {
          found.push(row);
        }
        for (const f of match.files) used.add(f);
      } else {
        missing.push({ track, blockedByFormat: match.blockedByFormat });
      }
    }

    const extra = ((index && index.files) || []).filter((f) => !used.has(f.name));
    const duplicates = [];
    for (const [key, names] of Object.entries((index && index.strong) || {})) {
      if (names.length > 1) duplicates.push({ key, files: names });
    }

    return {
      found,
      missing,
      weak,
      extra,
      duplicates,
      totalLibrary: ((snapshot && snapshot.tracks) || []).length,
      totalLocal: ((index && index.files) || []).length,
    };
  }

  function trackFromApi(raw) {
    const t = raw && raw.track ? raw.track : raw;
    if (!t || !t.id) return null;
    const artists = (t.artists || []).map((a) => a.name || a).filter(Boolean);
    const album = (t.albums && t.albums[0]) || {};
    const cover = t.coverUri || album.coverUri || "";
    return {
      id: String(t.id),
      title: t.title || "",
      version: t.version || "",
      artist: artists.join(", "),
      artists,
      album: album.title || "",
      albumId: album.id ? String(album.id) : "",
      year: album.year ? String(album.year) : t.year ? String(t.year) : "",
      label: (album.labels && album.labels[0] && album.labels[0].name) || "",
      position:
        (album.trackPosition && (album.trackPosition.index || album.trackPosition.volume)) || 0,
      cover: cover ? "https://" + String(cover).replace("%%", "600x600") : "",
      durationMs: t.durationMs || 0,
      source: raw && raw.source ? raw.source : "",
    };
  }

  const api = {
    normalize,
    trackKeys,
    fileKeys,
    buildIndex,
    findLocal,
    compare,
    sameTrack,
    trackFromApi,
    extAllowed,
  };

  globalThis.YMPMatch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
