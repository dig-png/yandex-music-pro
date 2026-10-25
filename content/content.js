(() => {
  const e = globalThis.browser || globalThis.chrome;
  const M = globalThis.YMPMatch;
  const state = {
    settings: {
      format: "flac",
      quality: "hq",
      tags: true,
      folder: false,
      path: "",
      position: false,
      cover: "600x600",
      musicDir: "",
      skipExisting: true,
      formatPolicy: "upgrade",
    },
    index: null,
    ready: false,
  };
  class t {
    static #e = e.storage.local;
    static execute = (e, s) =>
      new Promise((n) => Reflect.apply(t.#e[e], t.#e, [s, n]));
    static get = (e) => t.execute("get", e);
    static set = (e) => t.execute("set", e);
  }
  class s {
    static sanitize = (e) =>
      e.replace(/[?:;"<>\/\\|*]|^\s+|[\u200B-\u200D\uFEFF]/gi, (e) =>
        " " === e || e.match(/[\u200B-\u200D\uFEFF]/) ? "" : "_",
      );
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const topDoc = () => {
    try {
      return window.top.document;
    } catch (_) {
      return document;
    }
  };
  async function loadState() {
    const data = await t.get([
      "format",
      "quality",
      "tags",
      "folder",
      "path",
      "position",
      "cover",
      "musicDir",
      "skipExisting",
      "formatPolicy",
      "musicIndex",
    ]);
    for (const key of Object.keys(state.settings)) {
      if (data[key] !== undefined) state.settings[key] = data[key];
    }
    state.index = data.musicIndex || null;
    state.ready = true;
    return state;
  }
  function isLocal(track) {
    if (!state.settings.skipExisting || !state.index || !M) {
      return { found: false, files: [] };
    }
    try {
      return M.findLocal(state.index, track, state.settings);
    } catch (_) {
      return { found: false, files: [] };
    }
  }
  function decodeTrackData(element) {
    if (!element) return null;
    const raw = element.getAttribute && element.getAttribute("data-ymp-track");
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (_) {
      return null;
    }
  }
  function encodeTrackData(track) {
    return encodeURIComponent(JSON.stringify({ artist: track.artist || "", title: track.title || "" }));
  }
  function markButton(button, track, label) {
    if (!button || !track) return;
    button.setAttribute("data-ymp-track", encodeTrackData(track));
    const local = isLocal(track);
    if (local.found) {
      button.classList.add("_yamusic_done");
      button.title = "Уже скачано: " + local.files[0];
    } else {
      button.classList.remove("_yamusic_done");
      button.title = label || "Скачать";
    }
  }
  function refreshButtons() {
    for (const button of document.querySelectorAll("div._yamusic_save_next[data-ymp-track]")) {
      const track = decodeTrackData(button);
      if (!track) continue;
      const local = isLocal(track);
      button.classList.toggle("_yamusic_done", !!local.found);
      if (local.found) button.title = "Уже скачано: " + local.files[0];
      else if (!button.classList.contains("_loading"))
        button.title = button.classList.contains("_yamusic_save_next_player")
          ? "Скачать текущий трек"
          : "Скачать";
    }
  }
  class n {
    static #t = "7tvSmFbyf5hJnIHhCimDDD";
    static generate = async (e, t, s) => {
      const a = Math.floor(Date.now() / 1e3);
      let r = "mp3",
        o = s || "hq";
      "flac" === t && ((r = "flac-mp4"), (o = "lossless"));
      const i = `${a}${e}${o}${r}raw`,
        l = new TextEncoder(),
        c = await crypto.subtle.importKey(
          "raw",
          l.encode(n.#t),
          { name: "HMAC", hash: { name: "SHA-256" } },
          !1,
          ["sign"],
        ),
        d = await crypto.subtle.sign("HMAC", c, l.encode(i)),
        u = btoa(String.fromCharCode(...new Uint8Array(d))).replace(/=+$/, "");
      return {
        timestamp: a,
        signature: u,
        url: `https://api.music.yandex.ru/get-file-info?ts=${a}&trackId=${e}&quality=${o}&codecs=${encodeURIComponent(r)}&transports=raw&sign=${encodeURIComponent(u)}`,
      };
    };
  }
  class a {
    static extract = (e) => {
      let t, s, n, a, r, o, i, l;
      try {
        s =
          e.querySelector("div[class*='PlayButtonWithPosition_root']")
            ?.textContent || "";
      } catch {}
      try {
        t = e
          .querySelector("a[class*='Meta_albumLink__']")
          ?.getAttribute("href")
          ?.split("/")[4];
      } catch {}
      if (!t) return null;
      try {
        n =
          (e
            .querySelector("span[class*='Meta_title__']")
            ?.textContent?.trim() ||
            e
              .querySelector("a[class*='Meta_albumLink__']")
              ?.textContent?.trim() ||
            "") +
          (e.querySelector("span[class*='Meta_version__']")?.textContent?.trim()
            ? ` ${e.querySelector("span[class*='Meta_version__']").textContent.trim()}`
            : "");
      } catch {
        n = "";
      }
      try {
        const t = e.querySelectorAll("span[class*='Meta_artistCaption__']");
        a =
          t.length > 0
            ? Array.from(t)
                .map((e) => e.textContent.trim())
                .join(", ")
            : [
                ...document.querySelectorAll(
                  "span[class*='PageHeaderAlbumMeta_artistLabel__']",
                ),
              ]
                .map((e) => e.textContent.trim())
                .join(", ");
      } catch {
        a = "";
      }
      try {
        r = [
          ...document.querySelectorAll(
            "span[class*='PageHeaderTitle_font_short__']",
          ),
        ]
          .map((e) => e.textContent.trim())
          .join(" ");
      } catch {
        r = "";
      }
      try {
        o = document.querySelector(
          "div[class*='PageHeaderAlbumMeta_year_dot__']",
        ).textContent;
      } catch {
        o = "";
      }
      try {
        i =
          document
            .querySelector('a[class*="CommonAlbumPage_labelLink__"] span')
            ?.textContent.trim() || "";
      } catch {
        i = "";
      }
      try {
        const t =
          e.querySelector("img[class*='PlayButtonWithCover_coverImage__']") ||
          document.querySelector("img[class*='PageHeaderCover_coverImage__']");
        t && (l = t.getAttribute("src"));
      } catch {}
      return {
        trackId: t,
        position: s,
        title: n,
        artist: a,
        album: r,
        year: o,
        label: i,
        coverUrl: l,
      };
    };
  }
  class r {
    static #s = 7;
    #n = 0;
    #a = [];
    #r(e, t) {
      return (e[t] << 24) | (e[t + 1] << 16) | (e[t + 2] << 8) | e[t + 3];
    }
    #o(e, t) {
      return (BigInt(this.#r(e, t)) << 32n) | BigInt(this.#r(e, t + 4));
    }
    *#i(e, t, s) {
      let n = t;
      for (; n + 8 <= s;) {
        let t = this.#r(e, n);
        const a = String.fromCharCode(...e.slice(n + 4, n + 8));
        let r = n + 8;
        if (1 === t) {
          if (n + 16 > s) break;
          ((t = Number(this.#o(e, n + 8))), (r = n + 16));
        } else 0 === t && (t = s - n);
        if (t < 8 || n + t > s) break;
        (yield { type: a, start: n, size: t, dataStart: r }, (n += t));
      }
    }
    #l(e, t, s, n) {
      for (const a of this.#i(e, t, s)) {
        if (a.type === n) return a;
        const t = [
            "mvhd",
            "tkhd",
            "mdhd",
            "hdlr",
            "vmhd",
            "smhd",
            "dref",
            "stsd",
            "stts",
            "stsc",
            "stsz",
            "stco",
            "co64",
            "esds",
            "dfLa",
          ].includes(a.type),
          s = a.dataStart + (t ? 4 : 0);
        if (s < a.start + a.size) {
          const t = this.#l(e, s, a.start + a.size, n);
          if (t) return t;
        }
      }
      return null;
    }
    #c(e, t, s, n) {
      let a = [];
      for (const r of this.#i(e, t, s)) {
        r.type === n && a.push(r);
        const t = [
            "mvhd",
            "tkhd",
            "mdhd",
            "hdlr",
            "vmhd",
            "smhd",
            "dref",
            "stsd",
            "stts",
            "stsc",
            "stsz",
            "stco",
            "co64",
            "esds",
            "dfLa",
          ].includes(r.type),
          s = r.dataStart + (t ? 4 : 0);
        s < r.start + r.size && a.push(...this.#c(e, s, r.start + r.size, n));
      }
      return a;
    }
    #d(e, t) {
      const s = [100, 102, 76, 97],
        n = t.dataStart,
        a = t.start + t.size;
      for (let t = n; t <= a - 8; t++)
        if (
          e[t + 4] === s[0] &&
          e[t + 5] === s[1] &&
          e[t + 6] === s[2] &&
          e[t + 7] === s[3]
        ) {
          const s = this.#r(e, t);
          if (s >= 8 && t + s <= a)
            return { type: "dfLa", start: t, size: s, dataStart: t + 8 };
        }
      return null;
    }
    #u(e, t) {
      const s = t.slice(e.dataStart + 4, e.start + e.size);
      if (s.length < 8) return null;
      const n = this.#r(s, 0),
        a = this.#r(s, 4);
      if (0 === a) return [];
      if (0 !== n) return Array.from({ length: a }, () => n);
      const r = [];
      let o = 8;
      for (let e = 0; e < a && o + 4 <= s.length; e++)
        (r.push(this.#r(s, o)), (o += 4));
      return r;
    }
    #m(e, t) {
      const s = t.slice(e.dataStart + 4, e.start + e.size);
      if (s.length < 4) return [];
      const n = this.#r(s, 0),
        a = [];
      let r = 4;
      for (let e = 0; e < n && r + 12 <= s.length; e++) {
        const e = this.#r(s, r),
          t = this.#r(s, r + 4);
        ((r += 12), a.push({ firstChunk: e, samplesPerChunk: t }));
      }
      return a;
    }
    #h(e, t) {
      const s = t.slice(e.dataStart + 4, e.start + e.size);
      if (s.length < 4) return [];
      const n = this.#r(s, 0),
        a = [];
      let r = 4;
      for (let e = 0; e < n && r + 8 <= s.length; e++)
        (a.push(this.#o(s, r)), (r += 8));
      return a;
    }
    #g(e, t) {
      const s = t.slice(e.dataStart + 4, e.start + e.size);
      if (s.length < 4) return [];
      const n = this.#r(s, 0),
        a = [];
      let r = 4;
      for (let e = 0; e < n && r + 4 <= s.length; e++)
        (a.push(this.#r(s, r)), (r += 4));
      return a;
    }
    #f(e, t) {
      for (let s = t.length - 1; s >= 0; s--)
        if (e >= t[s].firstChunk) return t[s].samplesPerChunk;
      return t[0]?.samplesPerChunk ?? 0;
    }
    #_(e, t) {
      const s = this.#l(e, 0, e.length, "stsz"),
        n = this.#l(e, 0, e.length, "stsc"),
        a = this.#l(e, 0, e.length, "co64"),
        r = this.#l(e, 0, e.length, "stco");
      if (!s || !n || (!a && !r)) return e.slice(t.dataStart, t.start + t.size);
      const o = this.#u(s, e),
        i = this.#m(n, e),
        l = a ? this.#h(a, e) : this.#g(r, e);
      if (!o || 0 === o.length || 0 === l.length || 0 === i.length)
        return e.slice(t.dataStart, t.start + t.size);
      let c = 0;
      for (const e of o) c += e;
      if (0 === c) return e.slice(t.dataStart, t.start + t.size);
      const d = new Uint8Array(c);
      let u = 0,
        m = 0;
      for (let t = 0; t < l.length && m < o.length; t++) {
        const s = l[t],
          n = t + 1,
          a = this.#f(n, i);
        if (s + (a > 0 ? o[m] : 0) > e.length) break;
        let r = s;
        for (let t = 0; t < a && m < o.length; t++, m++) {
          const t = o[m];
          if (r + t > e.length) break;
          (d.set(e.slice(r, r + t), u), (r += t), (u += t));
        }
      }
      return u !== c ? d.slice(0, u) : d;
    }
    #p(e) {
      const t = new DataView(e.buffer, e.byteOffset, e.byteLength),
        s = t.getUint16(0, !1),
        n = t.getUint16(2, !1),
        a = (e[4] << 16) | (e[5] << 8) | e[6],
        r = (e[7] << 16) | (e[8] << 8) | e[9],
        o = this.#o(e, 10);
      return {
        minBlockSize: s,
        maxBlockSize: n,
        minFrameSize: a,
        maxFrameSize: r,
        sampleRate: Number((o >> 44n) & 0xfff7fn),
        channels: Number((o >> 41n) & 7n) + 1,
        bitsPerSample: Number((o >> 36n) & 31n) + 1,
        totalSamples: Number(0xfffffffc0n & o),
        md5: e.slice(18, 34),
      };
    }
    #y(e, t, s, n) {
      let a = [],
        r = Math.max(2, Math.floor(n / (10 * t))),
        o = Math.floor(n / r),
        i = 0,
        l = 0;
      for (
        a.push({ sampleNumber: 0, offset: 0, samplesInFrame: s });
        i < e.length;
      ) {
        let t = i;
        if (16382 != ((e[i] << 6) | (e[i + 1] >> 2))) break;
        let s = (e[i + 2] >> 4) & 15,
          c = 0;
        if (1 === s) c = 192;
        else if (s >= 2 && s <= 5) c = 576 * 2 ** (s - 2);
        else if (6 === s) c = e[i + 5] + 1;
        else {
          if (7 !== s) break;
          c = (e[i + 5] << 8) + e[i + 6] + 1;
        }
        let d = t + (6 === s ? 6 : 7 === s ? 7 : 5) + c + 2;
        for (; d + 2 <= e.length && 16382 != ((e[d] << 6) | (e[d + 1] >> 2));)
          d++;
        if (
          (d > e.length && (d = e.length),
          l > 0 &&
            l % o < c &&
            a.length < r &&
            a.push({ sampleNumber: l, offset: t, samplesInFrame: c }),
          (i = d),
          (l += c),
          l >= n)
        )
          break;
      }
      a.push({
        sampleNumber: 18446744073709551615n,
        offset: 0,
        samplesInFrame: 0,
      });
      let c = new Uint8Array(18 * a.length),
        d = new DataView(c.buffer);
      for (let e = 0; e < a.length; e++) {
        let t = a[e];
        (d.setBigUint64(18 * e, BigInt(t.sampleNumber), !1),
          d.setBigUint64(18 * e + 8, BigInt(t.offset), !1),
          d.setUint16(18 * e + 16, t.samplesInFrame, !1));
      }
      let u = this.#v(3, c.length, !1),
        m = new Uint8Array(u.length + c.length);
      return (m.set(u, 0), m.set(c, u.length), m);
    }
    #w(e) {
      const t = new Uint8Array(e),
        s = t.length,
        n = this.#c(t, 0, s, "mdat");
      if (0 === n.length) throw new Error("MP4 demux: mdat box not found");
      const a = n[0],
        r = this.#l(t, 0, s, "stsd");
      if (!r) throw new Error("MP4 demux: stsd box not found");
      const o = r.dataStart + 4;
      if (0 === this.#r(t, o)) throw new Error("MP4 demux: no sample entries");
      let i = null;
      for (const e of this.#i(t, o + 4, r.start + r.size))
        if ("fLaC" === e.type) {
          i = e;
          break;
        }
      if (!i) throw new Error("MP4 demux: fLaC sample entry not found");
      const l = this.#d(t, i);
      if (!l) throw new Error("MP4 demux: dfLa box not found");
      const c = l.dataStart + 4,
        d = t.slice(c, l.start + l.size),
        u = [];
      let m = 0;
      for (; m < d.length && !(m + 4 > d.length);) {
        const e = !!(128 & d[m]),
          t = (d[m + 1] << 16) | (d[m + 2] << 8) | d[m + 3];
        if (m + 4 + t > d.length) break;
        const s = d.slice(m, m + 4 + t);
        if ((u.push(s), (m += 4 + t), e)) break;
      }
      if (0 === u.length) throw new Error("MP4 demux: no FLAC metadata blocks");
      const h = u[0],
        g = this.#p(h.slice(4)),
        f = this.#_(t, a),
        _ = this.#y(f, g.sampleRate, g.minBlockSize, g.totalSamples),
        p = [];
      p.push(new TextEncoder().encode("fLaC"));
      const y = new Uint8Array(h);
      ((y[0] &= 127), p.push(y));
      const v = new Uint8Array(_);
      ((v[0] |= 128), p.push(v), p.push(f));
      const w = p.reduce((e, t) => e + t.length, 0),
        b = new Uint8Array(w);
      let x = 0;
      for (const e of p) (b.set(e, x), (x += e.length));
      return b.buffer;
    }
    #b(e, t, s) {
      const n = new Uint8Array(e);
      let a = 4;
      const r = [];
      let o = 4;
      for (; a < n.length && !(a + 4 > n.length);) {
        const e = (n[a + 1] << 16) | (n[a + 2] << 8) | n[a + 3];
        if (a + 4 + e > n.length) break;
        r.push(n.slice(a, a + 4 + e));
        const t = n[a];
        if (((a += 4 + e), 128 & t)) {
          o = a;
          break;
        }
      }
      for (const e of r) e[0] &= 127;
      const i = t ? new Uint8Array(t) : new Uint8Array(0);
      i.length && (i[0] &= 127);
      const l = s ? new Uint8Array(s) : null;
      l && l.length && (l[0] &= 127);
      const c = n.slice(o),
        d = [n.slice(0, 4), ...r];
      (i.length && d.push(i), l && l.length && d.push(l), d.push(c));
      const u = d.reduce((e, t) => e + t.length, 0),
        m = new Uint8Array(u);
      let h = 0;
      for (const e of d) (m.set(e, h), (h += e.length));
      const g = l || i;
      return (
        g && g.length
          ? (m[h - c.length - g.length] |= 128)
          : r.length && (m[h - c.length - r[r.length - 1].length] |= 128),
        m.buffer
      );
    }
    #v(e, t, s = !1) {
      const n = new Uint8Array(4);
      return (
        (n[0] = (s ? 128 : 0) | (127 & e)),
        (n[1] = (t >> 16) & 255),
        (n[2] = (t >> 8) & 255),
        (n[3] = 255 & t),
        n
      );
    }
    #x(e, t) {
      const s = new TextEncoder(),
        n = s.encode(e),
        a = s.encode(""),
        r = new Uint8Array(t),
        o = 8 + n.length + 4 + a.length + 4 + 4 + 4 + 4 + 4 + r.length,
        i = new Uint8Array(o),
        l = new DataView(i.buffer);
      let c = 0;
      (l.setUint32(c, 3, !1),
        (c += 4),
        l.setUint32(c, n.length, !1),
        (c += 4),
        i.set(n, c),
        (c += n.length),
        l.setUint32(c, a.length, !1),
        (c += 4),
        i.set(a, c),
        (c += a.length),
        l.setUint32(c, 0, !1),
        (c += 4),
        l.setUint32(c, 0, !1),
        (c += 4),
        l.setUint32(c, 0, !1),
        (c += 4),
        l.setUint32(c, 0, !1),
        (c += 4),
        l.setUint32(c, r.length, !1),
        (c += 4),
        i.set(r, c),
        (c += r.length));
      const d = this.#v(6, i.length, !1),
        u = new Uint8Array(d.length + i.length);
      return (u.set(d, 0), u.set(i, d.length), u);
    }
    #C(e, t) {
      const s = `${e}=${t}`,
        n = new TextEncoder().encode(s),
        a = new Uint8Array(4);
      ((a[0] = 255 & n.length),
        (a[1] = (n.length >> 8) & 255),
        (a[2] = (n.length >> 16) & 255),
        (a[3] = (n.length >> 24) & 255));
      const r = new Uint8Array(4 + n.length);
      return (r.set(a, 0), r.set(n, 4), r);
    }
    #B(e) {
      const t = new TextEncoder().encode("YandexMusic.pro"),
        s = new Uint8Array(4),
        n = t.length;
      ((s[0] = 255 & n),
        (s[1] = (n >> 8) & 255),
        (s[2] = (n >> 16) & 255),
        (s[3] = (n >> 24) & 255));
      const a = Object.entries(e).filter(([, e]) => e),
        r = new Uint8Array(4);
      ((r[0] = 255 & a.length),
        (r[1] = (a.length >> 8) & 255),
        (r[2] = (a.length >> 16) & 255),
        (r[3] = (a.length >> 24) & 255));
      const o = a.map(([e, t]) => this.#C(e, t)),
        i = o.reduce((e, t) => e + t.length, 0),
        l = new Uint8Array(4 + t.length + 4 + i);
      let c = 0;
      (l.set(s, c),
        (c += 4),
        l.set(t, c),
        (c += t.length),
        l.set(r, c),
        (c += 4));
      for (const e of o) (l.set(e, c), (c += e.length));
      const d = this.#v(4, l.length, !1),
        u = new Uint8Array(d.length + l.length);
      return (u.set(d, 0), u.set(l, d.length), u);
    }
    #S = async (a, r, o, i, l, c, d, u, m, cb) => {
      let replacedFiles = [];
      if (state.settings.skipExisting) {
        const local = isLocal({ artist: l, title: i });
        if (local.found) {
          if (a) {
            a.classList.remove("_loading");
            a.classList.add("_yamusic_done");
            a.title = "Уже скачано: " + local.files[0];
          }
          this.#n -= 1;
          this.#A();
          topDoc().dispatchEvent(new CustomEvent("_yamusic_file_done"));
          if (cb) cb("skipped");
          return;
        }
        if (local.blockedByFormat && Array.isArray(local.blockedFiles)) {
          replacedFiles = local.blockedFiles;
        }
      }
      const h = await t.get([
          "format",
          "quality",
          "tags",
          "folder",
          "path",
          "position",
          "cover",
        ]),
        g = h.format || "mp3",
        f = "flac" === g ? "lossless" : h.quality || "lq",
        _ = h.cover || "400x400",
        p = await n.generate(r, g, f),
        y = {
          "x-yandex-music-client": "YandexMusicWebNext/1.0.0",
          "x-yandex-music-without-invocation-info": "1",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://music.yandex.ru/",
        };
      try {
        const t = await e.runtime.sendMessage({
          message: "downloadInfo",
          url: p.url,
          headers: y,
        });
        if (!t) return this.#fail(a, cb);
        const n = t?.downloadInfo?.url;
        if (!n) return this.#fail(a, cb);
        const f = m?.replace(/100x100|200x200|300x300|400x400/, _);
        let v = await fetch(decodeURIComponent(n)).then((e) => e.arrayBuffer());
        const w = f
          ? await fetch(decodeURIComponent(f)).then((e) => e.arrayBuffer())
          : null;
        let b = "audio/mpeg",
          x = "mp3";
        if ("flac" === g)
          try {
            ((x = "flac"), (b = "audio/flac"));
            let e = this.#w(v),
              t = this.#B({
                TITLE: i || "",
                ARTIST: l || "",
                ALBUM: c || "",
                DATE: d || "",
                TRACKNUMBER: o > 0 ? String(o) : "",
                ORGANIZATION: u || "",
              }),
              s = null;
            if (w) {
              const e = (e) => {
                const t = new Uint8Array(e);
                return 255 === t[0] && 216 === t[1]
                  ? "image/jpeg"
                  : 137 === t[0] && 80 === t[1]
                    ? "image/png"
                    : 71 === t[0] && 73 === t[1]
                      ? "image/gif"
                      : "image/jpeg";
              };
              s = this.#x(e(w), w);
            }
            (!1 !== h.tags && (e = this.#b(e, t, s)), (v = e));
          } catch (e) {
            if (((x = "mp3"), (b = "audio/mpeg"), !1 !== h.tags))
              try {
                const e = new browserId3Writer(v);
                if (
                  (e
                    .setFrame("TIT2", i)
                    .setFrame("TPE1", [l])
                    .setFrame("TPE2", l)
                    .setFrame("TALB", c)
                    .setFrame("TYER", d)
                    .setFrame("TPUB", u)
                    .setFrame("TRCK", o),
                  w)
                )
                  try {
                    e.setFrame("APIC", { type: 3, data: w, description: "" });
                  } catch {}
                (e.addTag(), (v = e.arrayBuffer));
              } catch {}
          }
        else if (!1 !== h.tags)
          try {
            const e = new browserId3Writer(v);
            if (
              (e
                .setFrame("TIT2", i)
                .setFrame("TPE1", [l])
                .setFrame("TPE2", l)
                .setFrame("TALB", c)
                .setFrame("TYER", d)
                .setFrame("TPUB", u)
                .setFrame("TRCK", o),
              w)
            )
              try {
                e.setFrame("APIC", { type: 3, data: w, description: "" });
              } catch {}
            (e.addTag(), (v = e.arrayBuffer));
          } catch {}
        const C = s.sanitize(`${l} - ${i}.${x}`),
          B = this.#k(C, o, h);
        let S = new Blob([new Uint8Array(v)], { type: b }),
          k = URL.createObjectURL(S);
        this.#L(a, k, B, r, o, i, l, c, d, u, m, replacedFiles, cb);
      } catch {
        this.#fail(a, cb);
      }
    };
    #fail = (a, cb) => {
      if (a) a.classList.remove("_loading");
      this.#n -= 1;
      this.#A();
      if (cb) cb("failed");
    };
    #k = (e, t, s) => {
      const n = !0 === s.position && t > 0 ? `${t}. ` : "";
      return !0 === s.folder && s.path?.length > 0
        ? `${s.path}/${n}${e}`
        : `${n}${e}`;
    };
    #L = (t, s, n, a, r, o, i, l, c, d, u, replacedFiles, cb) => {
      const trackKey = M && M.trackKeys ? M.trackKeys({ artist: i, title: o }).strong : [];
      e.runtime.sendMessage(
        {
          message: "download",
          url: s,
          filename: n,
          artist: i,
          title: o,
          album: l,
          trackKey,
          replacedFiles: replacedFiles || [],
        },
        (n) => {
          (t && t.classList.remove("_loading"),
            setTimeout(() => {
              URL.revokeObjectURL(s);
            }, 2e4));
          const m = n?.downloadId;
          if (m) {
            let tries = 0;
            const t = () => {
              e.runtime.sendMessage(
                { message: "checkBrowserDownloadStatus", downloadId: m },
                (e) => {
                  if (e?.isFinished) {
                    topDoc().dispatchEvent(
                      new CustomEvent("_yamusic_file_done"),
                    );
                    loadState()
                      .then(refreshButtons)
                      .catch(() => {});
                    if (cb) cb("done");
                  } else if ((tries += 1) > 900) {
                    if (cb) cb("failed");
                  } else setTimeout(t, 1e3);
                },
              );
            };
            t();
          } else {
            document.dispatchEvent(new CustomEvent("_yamusic_file_done"));
            if (cb) cb("failed");
          }
          ((this.#n -= 1), this.#A(a, r, o, i, l, c, d, u));
        },
      );
    };
    #A = (e, t, s, n, a, r, o, i) => {
      if (this.#a.length > 0) {
        const [e, ...t] = this.#a.shift();
        this.#S(e, ...t);
      }
    };
    enqueue = (e, t, s, n, a, o, i, l, c, cb) => {
      ((this.#n += 1),
        e && e.classList.add("_loading"),
        this.#n > r.#s
          ? this.#a.push([e, t, s, n, a, o, i, l, c, cb])
          : this.#S(e, t, s, n, a, o, i, l, c, cb));
    };
  }
  class o {
    static create = (t) => {
      if (t.querySelector("._yamusic_save_next")) return null;
      const s = t.querySelectorAll("button"),
        n = document.createElement("div");
      return (
        n.classList.add("_yamusic_save_next"),
        (n.title = "Скачать"),
        (n.style.backgroundImage = `url('chrome-extension://${e.runtime.id}/images/save_icon.svg')`),
        t.insertBefore(n, s[0]),
        n
      );
    };
    static createAllButton = (t, s) => {
      if (t.querySelector("._yamusic_save_all")) return null;
      const n = document.querySelector(
          '[class*="CommonPageHeader_playControl"], [class*="PageHeaderArtist_playControl"]',
        ),
        a = document.querySelector(
          '[class*="PageHeaderPlaylist_trailerControl"], [class*="PageHeaderArtist_trailerControl"]',
        ),
        r = document.querySelector(
          '[class*="ArtistTracksPage_content__"], [class*="ChartTracksPage_content__"]',
        );
      if (!n && !r) return null;
      const o = document.createElement("button");
      (o.classList.add("_yamusic_save_all"),
        (o.type = "button"),
        (o.title = "Скачать все треки"));
      const i = t.matches('[class*="PageHeaderArtist_controls__"]');
      n &&
        (i
          ? ((t.style.gridTemplateAreas =
              '"play download trailer like pinOrDonate menu"'),
            (n.style.gridArea = "play"),
            (o.style.gridArea = "download"),
            a && (a.style.gridArea = "trailer"),
            (n.style.marginRight = "0"),
            a && (a.style.marginLeft = "0"))
          : ((n.style.order = "1"),
            (o.style.order = "2"),
            a && ((a.style.order = "3"), (a.style.marginLeft = "1px")),
            (n.style.marginRight = "1px")));
      const l = document.createElement("span");
      (l.classList.add("_yamusic_save_icon"),
        (l.style.backgroundImage = `url('chrome-extension://${e.runtime.id}/images/save_icon.svg')`));
      const c = document.createElement("span");
      ((c.textContent = "Скачать"), o.appendChild(l), o.appendChild(c));
      let d = !1,
        u = null,
        m = null,
        h = null,
        g = null;
      const f = () => {
        (m && window.top.document.removeEventListener("_yamusic_file_done", m),
          h && o.removeEventListener("mouseenter", h),
          g && o.removeEventListener("mouseleave", g));
      };
      if (
        (o.addEventListener("click", async () => {
          if (o.classList.contains("_can-abort"))
            return (
              (d = !0),
              f(),
              u && (u.remove(), (u = null)),
              o.classList.remove("_processing"),
              o.classList.remove("_can-abort"),
              (c.textContent = "Загрузка остановлена"),
              (o.title = "Скачать все треки"),
              void setTimeout(() => {
                if (
                  !o.classList.contains("_processing") &&
                  !o.classList.contains("_can-abort")
                ) {
                  const e = document.querySelector(
                      '[class*="ArtistTracksPage_content__"], [class*="ChartTracksPage_content__"]',
                    ),
                    t =
                      !document.querySelector(
                        '[class*="CommonPageHeader_playControl"], [class*="PageHeaderArtist_playControl"]',
                      ) && e;
                  c.textContent = t ? "Скачать все треки" : "Скачать";
                }
              }, 3e3)
            );
          if (
            o.classList.contains("_processing") ||
            o.classList.contains("_success")
          )
            return;
          ((d = !1), o.classList.add("_processing"));
          const e = location.href;
          if (!/\/(?:playlists|album|artist)\/|\/chart(?:\/|$)/.test(e))
            return (
              (c.textContent = "Не тот тип страницы"),
              void o.classList.remove("_processing")
            );
          c.textContent = "Загрузка...";
          const t = document.getElementById("_yamusic_iframe");
          t && t.remove();
          const s = document.createElement("iframe");
          if (
            ((s.id = "_yamusic_iframe"),
            (u = s),
            (s.src = e),
            document.body.appendChild(s),
            await new Promise((e) => {
              ((s.onload = e), setTimeout(e, 7e3));
            }),
            d)
          )
            return;
          const n = s.contentDocument || s.contentWindow?.document,
            a = s.contentWindow;
          if (!n || !a)
            return (
              (c.textContent = "Ошибка доступа"),
              o.classList.remove("_processing"),
              s.remove(),
              void (u = null)
            );
          let r = 0,
            i = 0;
          for (; i < 4;) {
            if (d) return;
            const e = n.querySelectorAll("div._yamusic_save_next").length;
            (e === r && e > 0 ? i++ : ((i = 0), (r = e)),
              await new Promise((e) => setTimeout(e, 1200)));
          }
          const l = n.querySelectorAll(
            'div._yamusic_save_next:not([class*="TrackModal_root__"] div._yamusic_save_next)',
          );
          if (0 === l.length)
            return (
              (c.textContent = "Треки не найдены"),
              o.classList.remove("_processing"),
              s.remove(),
              void (u = null)
            );
          const todo = [];
          let z = 0;
          for (const el of l) {
            const track = decodeTrackData(el);
            if (
              el.classList.contains("_yamusic_done") ||
              (track && isLocal(track).found)
            ) {
              z += 1;
              el.classList.add("_yamusic_done");
            } else todo.push(el);
          }
          const p = todo.length;
          if (0 === p)
            return (
              (c.textContent =
                z > 0 ? `Все треки уже скачаны (${z})` : "Треки не найдены"),
              o.classList.remove("_processing"),
              s.remove(),
              void (u = null)
            );
          (o.classList.add("_can-abort"), (o.title = "Остановить скачивание"));
          let _ = 0;
          let y = !1;
          const label = (n) =>
            z > 0 ? `Скачиваем ${n}/${p} (пропущено ${z})` : `Скачиваем ${n}/${p}`;
          const v = () => {
            if (o.classList.contains("_can-abort"))
              if (y) c.textContent = "Остановить";
              else {
                const e = _ < p ? _ + 1 : p;
                c.textContent = label(e);
              }
          };
          ((m = () => {
            (_++, v());
          }),
            (h = () => {
              ((y = !0), v());
            }),
            (g = () => {
              ((y = !1), v());
            }),
            window.top.document.addEventListener("_yamusic_file_done", m),
            o.addEventListener("mouseenter", h),
            o.addEventListener("mouseleave", g),
            (c.textContent = label(1)));
          const started = Date.now();
          for (const e of todo) {
            if (d) return void f();
            try {
              e.click();
            } catch {
              const t = new a.MouseEvent("click", {
                bubbles: !0,
                cancelable: !0,
                view: a,
              });
              e.dispatchEvent(t);
            }
            await new Promise((e) => setTimeout(e, 400));
          }
          for (; _ < p;) {
            if (d) return void f();
            if (Date.now() - started > 9e5) break;
            await new Promise((e) => setTimeout(e, 300));
          }
          if (d) return void f();
          (f(),
            u && (u.remove(), (u = null)),
            o.classList.remove("_processing"),
            o.classList.remove("_can-abort"),
            o.classList.add("_success"),
            (o.title = "Скачать все треки"),
            (c.textContent =
              z > 0
                ? `Загрузка завершена (пропущено ${z})`
                : "Загрузка завершена"));
        }),
        n)
      )
        n.after(o);
      else if (r) {
        c.textContent = "Скачать все треки";
        try {
          const e = document.querySelector(
            'div[class*="ArtistTracksPage_root__"] > header > div[class*="TextHeader_staticItem__"] > h1, div[class*="ChartTracksPage_root__"] > header > div[class*="TextHeader_staticItem__"] > h1',
          );
          e && e.after(o);
        } catch {}
      }
    };
    static bind = (t, s, n) => {
      t.addEventListener("click", function (a) {
        if ((a.stopPropagation(), a.preventDefault(), this.alreadyCalled))
          return (
            setTimeout(() => {
              this.alreadyCalled = !1;
            }, 1e4),
            !0
          );
        if (this.classList.contains("_yamusic_done")) return !0;
        ((this.alreadyCalled = !0),
          e.runtime.sendMessage({ message: "check" }, (e) => {
            if (!0 === e?.status) return;
            const a = s();
            if (a && isLocal(a).found) {
              markButton(t, a);
              return;
            }
            a &&
              n.enqueue(
                t,
                a.trackId,
                a.position,
                a.title,
                a.artist,
                a.album,
                a.year,
                a.label,
                a.coverUrl,
              );
          }));
      });
    };
  }
  class i {
    static #U = '.d-track, .track, div[class*="Track_root"]';
    static scan = (e) => {
      const t = document.querySelectorAll(i.#U);
      for (const s of t)
        ("DIV" !== s.tagName && "SECTION" !== s.tagName) || i.#E(s, e);
      const s = document.querySelector(
        'div[class*="PageHeaderPlaylist_mainControls__"], div[class*="CommonPageHeader_controls__"], div[class*="PageHeaderArtist_controls__"], div[class*="ArtistTracksPage_content__"], div[class*="ChartTracksPage_content__"]',
      );
      s &&
        !s.classList.contains("_yamusic_all_ready") &&
        (s.classList.add("_yamusic_all_ready"), o.createAllButton(s, e));
    };
    static #E = (e, t) => {
      if (!e || e.classList.contains("_yamusic_ready")) return;
      const s = e.querySelector(
        "div[class*='ControlsBar_root'], div[class*='PlayerBarDesktop_meta']",
      );
      if (!s) return;
      const track = a.extract(e);
      if (!track) return;
      if (s.querySelector("._yamusic_save_next")) {
        e.classList.add("_yamusic_ready");
        return;
      }
      const n = o.create(s);
      if (!n) return;
      e.classList.add("_yamusic_ready");
      markButton(n, track);
      o.bind(n, () => a.extract(e), t);
    };
  }
  class l {
    static handle = (e, t, s) => {
      if ("crash" === e?.message) {
        const t = document.querySelector(`[track-id='${e.id}']`);
        t &&
          (t.innerHTML =
            '<button class="button button_round button_action button-play button-play__type_track button_ico" id="_yamusic_save_button" style="background-color: #ff3333" title="Произошла ошибка... Нажмите на иконку, чтобы скачать ещё раз.">error</button>');
      }
    };
  }
  /* --------------------------- Yandex library API --------------------------- */

  const API_BASE = "https://api.music.yandex.ru";
  const API_HEADERS = {
    "x-yandex-music-client": "YandexMusicWebNext/1.0.0",
    "x-yandex-music-without-invocation-info": "1",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://music.yandex.ru/",
  };
  const downloadState = { stop: false, running: false };
  const isTopFrame = (() => {
    try {
      return window.top === window;
    } catch (_) {
      return false;
    }
  })();

  function setLibraryStatus(value) {
    return t.set({ libraryStatus: { ...value, updatedAt: Date.now() } });
  }
  function setDownloadStatus(value) {
    return t.set({ downloadProgress: { ...value, updatedAt: Date.now() } });
  }

  async function apiGet(path) {
    let response;
    try {
      response = await fetch(API_BASE + path, {
        credentials: "include",
        headers: API_HEADERS,
        cache: "no-store",
      });
    } catch (err) {
      throw new Error(
        "Нет связи с API Яндекс.Музыки: " + ((err && err.message) || err),
      );
    }
    if (response.status === 401 || response.status === 403) {
      const err = new Error("nologin");
      err.status = response.status;
      err.path = path;
      throw err;
    }
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " (" + path + ")");
    }
    const json = await response.json().catch(() => null);
    if (!json) throw new Error("Пустой ответ API (" + path + ")");
    if (json.error) {
      const name = String(
        json.error.name || json.error.message || "API error",
      );
      if (/unauthor|session|auth|token/i.test(name)) throw new Error("nologin");
      throw new Error(name);
    }
    return json;
  }

  // Yandex Music API mixes wrapped (`{result: ...}`) and bare responses.
  function unwrap(json) {
    if (
      json &&
      typeof json === "object" &&
      !Array.isArray(json) &&
      json.result !== undefined
    ) {
      return json.result;
    }
    return json;
  }

  function pickUid(json) {
    if (!json) return "";
    const data = unwrap(json) || {};
    const account = data.account || (data.user && data.user.account) || {};
    const uid =
      account.uid ||
      data.uid ||
      (data.user && data.user.uid) ||
      account.id ||
      "";
    if (uid && String(uid) !== "0") return String(uid);
    return "";
  }

  function uidFromPage() {
    for (const link of document.querySelectorAll('a[href*="/users/"]')) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/users\/(\d+)/);
      if (match) return match[1];
    }
    const holder = document.querySelector("[data-uid]");
    const attr = holder && holder.getAttribute("data-uid");
    return attr && /^\d+$/.test(attr) ? attr : "";
  }

  async function resolveUid() {
    // `/account/about` and `/account/status` return bare objects (no `result`),
    // and only an authorized session has `uid` inside.
    const failures = [];
    for (const path of ["/account/status", "/account/about"]) {
      try {
        const uid = pickUid(await apiGet(path));
        if (uid) return uid;
      } catch (err) {
        failures.push(err);
      }
    }
    const pageUid = uidFromPage();
    if (pageUid) return pageUid;
    try {
      const uid = pickUid(await apiGet("/users/me"));
      if (uid) return uid;
    } catch (err) {
      failures.push(err);
    }
    const authFailure = failures.find((err) => err && err.message === "nologin");
    if (authFailure) throw authFailure;
    throw new Error(
      "Не удалось определить аккаунт." +
        (failures[0] ? " " + failures[0].message : ""),
    );
  }

  function trackEntry(entry) {
    if (!entry) return null;
    const track = entry.track || entry;
    if (!track || !track.id) return null;
    return track;
  }

  function collectTrack(refs, entry, source, album) {
    const track = trackEntry(entry);
    if (!track) return false;
    const id = String(track.id);
    let record = refs.get(id);
    if (!record) {
      record = { id, sources: new Set(), raw: null, album: null };
      refs.set(id, record);
    }
    record.sources.add(source);
    if (track.title || (track.artists && track.artists.length)) {
      record.raw = track;
    }
    const linked = album || (track.albums && track.albums[0]) || null;
    if (linked && linked.id) record.album = linked;
    return true;
  }

  async function fetchLibrary(sources) {
    const config = {
      likes: !sources || sources.likes !== false,
      playlists: !sources || sources.playlists !== false,
      albums: !sources || sources.albums !== false,
    };
    try {
      await setLibraryStatus({
        state: "running",
        step: "account",
        done: 0,
        total: 0,
        message: "Определяем аккаунт…",
      });
      const uid = await resolveUid();
      const refs = new Map();
      const counts = {
        likes: 0,
        playlists: 0,
        albums: 0,
        playlistsTotal: 0,
        albumsTotal: 0,
      };
      const playlistMeta = [];

      if (config.likes) {
        await setLibraryStatus({
          state: "running",
          step: "likes",
          message: "Загружаем «Мне нравится»…",
        });
        const response = await apiGet(`/users/${uid}/likes/tracks`);
        const data = unwrap(response) || {};
        const list = Array.isArray(data)
          ? data
          : (data.library && data.library.tracks) || data.tracks || [];
        for (const entry of list) {
          if (collectTrack(refs, entry, "likes")) counts.likes += 1;
        }
        await setLibraryStatus({
          state: "running",
          step: "likes",
          done: counts.likes,
          total: counts.likes,
          message: `Мне нравится: ${counts.likes}`,
        });
      }

      if (config.playlists) {
        await setLibraryStatus({
          state: "running",
          step: "playlists",
          message: "Загружаем плейлисты…",
        });
        let lists = [];
        try {
          // `/playlists` requires a `kinds` parameter (400 otherwise); the list
          // endpoint returns every playlist of the user.
          const response = await apiGet(`/users/${uid}/playlists/list`);
          const data = unwrap(response);
          lists = Array.isArray(data)
            ? data
            : (data && (data.playlists || data.items)) || [];
        } catch (err) {
          if (err.message === "nologin") throw err;
          counts.playlistsError = err.message;
        }
        counts.playlistsTotal = lists.length;
        for (let i = 0; i < lists.length; i += 1) {
          const playlist = lists[i];
          if (!playlist || playlist.kind === undefined || playlist.kind === null)
            continue;
          const title = playlist.title || "Плейлист " + playlist.kind;
          await setLibraryStatus({
            state: "running",
            step: "playlists",
            done: i + 1,
            total: lists.length,
            message: `Плейлист ${i + 1}/${lists.length}: ${title}`,
          });
          try {
            const detail = await apiGet(`/users/${uid}/playlists/${playlist.kind}`);
            const data = unwrap(detail) || {};
            const tracks =
              (data.playlist && data.playlist.tracks) || data.tracks || [];
            let added = 0;
            for (const entry of tracks) {
              if (collectTrack(refs, entry, "playlists")) added += 1;
            }
            counts.playlists += added;
            playlistMeta.push({ kind: playlist.kind, title, count: added });
          } catch (err) {
            if (err.message === "nologin") throw err;
            playlistMeta.push({
              kind: playlist.kind,
              title,
              count: 0,
              error: err.message,
            });
          }
        }
      }

      if (config.albums) {
        await setLibraryStatus({
          state: "running",
          step: "albums",
          message: "Загружаем альбомы…",
        });
        let items = [];
        try {
          const response = await apiGet(`/users/${uid}/likes/albums?rich=true`);
          const data = unwrap(response);
          items = Array.isArray(data)
            ? data
            : (data && (data.albums || data.items)) || [];
        } catch (err) {
          if (err.message === "nologin") throw err;
          counts.albumsError = err.message;
        }
        counts.albumsTotal = items.length;
        for (let i = 0; i < items.length; i += 1) {
          const short = items[i] && (items[i].album || items[i]);
          if (!short || !short.id) continue;
          const title = short.title || "Альбом " + short.id;
          await setLibraryStatus({
            state: "running",
            step: "albums",
            done: i + 1,
            total: items.length,
            message: `Альбом ${i + 1}/${items.length}: ${title}`,
          });
          try {
            const detail = await apiGet(`/albums/${short.id}/with-tracks`);
            const data = unwrap(detail) || {};
            const album = data.album || data;
            const merged = { ...short, ...album, id: short.id };
            // Album details keep tracks inside `volumes`, each volume being an
            // array of tracks (sometimes `{tracks: [...]}`).
            const tracks = [];
            if (Array.isArray(album.volumes)) {
              for (const volume of album.volumes) {
                const list = Array.isArray(volume)
                  ? volume
                  : (volume && volume.tracks) || [];
                for (const track of list) tracks.push(track);
              }
            }
            if (!tracks.length && Array.isArray(album.tracks)) {
              for (const track of album.tracks) tracks.push(track);
            }
            let added = 0;
            for (const entry of tracks) {
              if (collectTrack(refs, entry, "albums", merged)) added += 1;
            }
            counts.albums += added;
          } catch (err) {
            if (err.message === "nologin") throw err;
          }
        }
      }

      const ids = [...refs.keys()];
      const details = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await setLibraryStatus({
          state: "running",
          step: "details",
          done: i,
          total: ids.length,
          message: `Данные о треках: ${i}/${ids.length}`,
        });
        try {
          const response = await apiGet(`/tracks?track-ids=${chunk.join(",")}`);
          const data = unwrap(response);
          const list = Array.isArray(data) ? data : (data && data.tracks) || [];
          for (const item of list) {
            const track = trackEntry(item);
            if (track) details.set(String(track.id), track);
          }
        } catch (err) {
          if (err.message === "nologin") throw err;
        }
      }
      await setLibraryStatus({
        state: "running",
        step: "details",
        done: ids.length,
        total: ids.length,
        message: `Данные о треках: ${ids.length}/${ids.length}`,
      });

      const tracks = [];
      for (const [id, record] of refs) {
        const raw = details.get(id) || record.raw;
        if (!raw) continue;
        const merged =
          record.album && !(raw.albums && raw.albums.length)
            ? { ...raw, albums: [record.album] }
            : raw;
        const track = M.trackFromApi(merged);
        if (!track) continue;
        track.source = [...record.sources].join(",");
        tracks.push(track);
      }
      tracks.sort((a, b) =>
        (a.artist + " " + a.title).localeCompare(b.artist + " " + b.title, "ru"),
      );

      const snapshot = {
        version: 1,
        uid,
        fetchedAt: Date.now(),
        sources: config,
        counts: { ...counts, total: tracks.length },
        playlists: playlistMeta,
        tracks,
      };
      await t.set({ librarySnapshot: snapshot });
      await setLibraryStatus({
        state: "done",
        step: "done",
        done: tracks.length,
        total: tracks.length,
        counts: snapshot.counts,
        fetchedAt: snapshot.fetchedAt,
        message: `Готово: ${tracks.length} треков`,
      });
      return snapshot;
    } catch (err) {
      let message;
      if (err && err.message === "nologin") {
        const where = err.status
          ? ` (HTTP ${err.status}${err.path ? ", " + err.path : ""})`
          : "";
        message =
          "Не удалось войти в аккаунт" +
          where +
          ". Войдите на music.yandex.ru и повторите проверку.";
      } else {
        message = String((err && err.message) || err);
      }
      await setLibraryStatus({ state: "error", error: message, message });
      throw err;
    }
  }

  function downloadTitle(track) {
    return [track.title, track.version].filter(Boolean).join(" ");
  }

  async function downloadTracks(tracks) {
    const list = (tracks || []).filter((track) => track && track.id);
    downloadState.stop = false;
    downloadState.running = true;

    const filtered = [];
    let skipped = 0;
    for (const track of list) {
      const local = isLocal({
        artist: track.artist,
        title: downloadTitle(track),
      });
      if (local.found) skipped += 1;
      else filtered.push(track);
    }

    const total = filtered.length;
    const startedAt = Date.now();
    let done = 0;
    let failed = 0;
    await setDownloadStatus({
      state: total ? "running" : "done",
      total,
      done,
      failed,
      skipped,
      startedAt,
      message: total
        ? `Скачиваем 0 из ${total}`
        : skipped
          ? "Все треки уже есть локально"
          : "Нечего скачивать",
    });

    if (!total) {
      downloadState.running = false;
      return { ok: true, total: 0, done: 0, failed: 0, skipped };
    }

    const downloader = new r();
    const run = (track) =>
      new Promise((resolve) => {
        try {
          downloader.enqueue(
            null,
            track.id,
            track.position || 0,
            downloadTitle(track),
            track.artist || "",
            track.album || "",
            track.year || "",
            track.label || "",
            track.cover || "",
            resolve,
          );
        } catch (_) {
          resolve("failed");
        }
      });

    for (let i = 0; i < filtered.length; i += 3) {
      if (downloadState.stop) break;
      const batch = filtered.slice(i, i + 3);
      const results = await Promise.all(batch.map(run));
      for (const result of results) {
        if (result === "done") done += 1;
        else if (result === "skipped") skipped += 1;
        else failed += 1;
      }
      await setDownloadStatus({
        state: "running",
        total,
        done,
        failed,
        skipped,
        startedAt,
        message: `Скачано ${done} из ${total}`,
      });
    }

    downloadState.running = false;
    const state = downloadState.stop ? "stopped" : "done";
    await setDownloadStatus({
      state,
      total,
      done,
      failed,
      skipped,
      startedAt,
      message: `${state === "stopped" ? "Остановлено" : "Готово"}: скачано ${done}, ошибок ${failed}, пропущено ${skipped}`,
    });
    loadState()
      .then(refreshButtons)
      .catch(() => {});
    return { ok: true, total, done, failed, skipped, state };
  }

  if (isTopFrame) {
    e.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const type = message && message.type;
      if (type === "ympPing") {
        sendResponse({
          ok: true,
          top: true,
          url: location.href,
          v: e.runtime.getManifest().version,
        });
        return false;
      }
      if (type === "ympFetchLibrary") {
        fetchLibrary(message.sources || {}).catch(() => {});
        sendResponse({ ok: true, started: true });
        return false;
      }
      if (type === "ympDownloadTracks") {
        const tracks = message.tracks || [];
        downloadTracks(tracks).catch(() => {});
        sendResponse({ ok: true, started: true, accepted: tracks.length });
        return false;
      }
      if (type === "ympStopDownloads") {
        downloadState.stop = true;
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  }

  try {
    e.storage.onChanged.addListener((changes, area) => {
      if (area && area !== "local") return;
      let relevant = false;
      for (const key of [
        "musicIndex",
        "skipExisting",
        "format",
        "formatPolicy",
        "musicDir",
      ]) {
        if (changes[key]) {
          relevant = true;
          break;
        }
      }
      if (!relevant) return;
      loadState()
        .then(refreshButtons)
        .catch(() => {});
    });
  } catch (_) {}

  const app = new (class {
    #P = new r();
    #F = () => {
      (i.scan(this.#P),
        this.#T(),
        document.addEventListener(
          "click",
          (e) => {
            const t = e.target.closest("._yamusic_save_next_player");
            if (!t) return;
            if (
              (e.preventDefault(),
              e.stopPropagation(),
              t.classList.contains("_loading") ||
                t.classList.contains("_yamusic_done"))
            )
              return;
            t.classList.add("_loading");
            const s = document.querySelector(
              '[class*="PlayerBarDesktopWithBackgroundProgressBar_description__"]',
            );
            if (!s) return void t.classList.remove("_loading");
            const n = s.querySelector('[class*="Meta_title__"]'),
              a = s.querySelector('[class*="Meta_artistCaption__"]'),
              r = document.querySelector(
                '[class*="PlayerBarDesktopWithBackgroundProgressBar_cover__"]',
              );
            if (!t.dataset.trackHref)
              return void t.classList.remove("_loading");
            const o = t.dataset.trackHref.split("/track/")[1],
              i = n ? n.textContent.trim() : "Unknown Track",
              l = a ? a.textContent.trim() : "Unknown Artist",
              c = r ? r.src : "";
            try {
              this.#P.enqueue(t, o, "", i, l, "", "", "", c);
            } catch {
              t.classList.remove("_loading");
            }
          },
          { capture: !0 },
        ),
        new MutationObserver(() => {
          (i.scan(this.#P), this.#T());
        }).observe(document.body, { childList: !0, subtree: !0 }));
    };
    #T = () => {
      const t = document.querySelector(
        '[class*="PlayerBarDesktopWithBackgroundProgressBar_meta__"]',
      );
      if (!t) return;
      const s = document.querySelector(
        '[class*="PlayerBarDesktopWithBackgroundProgressBar_description__"]',
      );
      if (!s) return;
      const n = s.querySelector('a[href*="/track/"]'),
        a = document.querySelector(
          '[class*="BaseSonataControlsDesktop_sonataButton__"] use[*|href*="play"], [class*="BaseSonataControlsDesktop_sonataButton__"] use[*|href*="pause"]',
        );
      if (!n || !a || a.closest("button")?.disabled) {
        const e = t.querySelector("._yamusic_save_next_player");
        return void (e && e.remove());
      }
      const r = n.getAttribute("href"),
        o = t.querySelector("._yamusic_save_next_player");
      const readMeta = () => {
        const titleEl = s.querySelector('[class*="Meta_title__"]');
        const artistEl = s.querySelector('[class*="Meta_artistCaption__"]');
        const title = titleEl ? titleEl.textContent.trim() : n.textContent.trim();
        const artist = artistEl ? artistEl.textContent.trim() : "";
        return title ? { title, artist } : null;
      };
      if (o) {
        if (o.dataset.trackHref !== r) {
          o.dataset.trackHref = r;
          o.classList.remove("_loading");
          const track = readMeta();
          if (track) markButton(o, track, "Скачать текущий трек");
        }
        return;
      }
      const i = document.createElement("div");
      (i.classList.add("_yamusic_save_next", "_yamusic_save_next_player"),
        (i.title = "Скачать текущий трек"),
        (i.dataset.trackHref = r));
      const l = e.runtime.getURL("images/save_icon.svg");
      ((i.style.webkitMaskImage = `url('${l}')`),
        (i.style.maskImage = `url('${l}')`));
      const track = readMeta();
      if (track) markButton(i, track, "Скачать текущий трек");
      t.insertBefore(i, t.firstChild);
    };
    launch = () => {
      ("loading" === document.readyState
        ? document.addEventListener("DOMContentLoaded", () => this.#F())
        : this.#F(),
        e.runtime.onMessage.addListener(l.handle));
    };
  })();
  loadState()
    .then(() => {
      app.launch();
      refreshButtons();
    })
    .catch(() => app.launch());
})();
