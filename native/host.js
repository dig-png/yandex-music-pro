/*
 * YandexMusicPro local helper (native messaging host).
 *
 * Protocol: 4-byte little-endian length + UTF-8 JSON (Chrome native messaging).
 * One request per process (the extension uses chrome.runtime.sendNativeMessage).
 */
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");

const AUDIO_EXT = new Set([".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav"]);

function log(...args) {
  try {
    process.stderr.write(args.map(String).join(" ") + "\n");
  } catch (_) {}
}

function readStdinMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let needed = -1;
    process.stdin.on("data", (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (needed < 0 && total >= 4) {
        const buf = Buffer.concat(chunks, total);
        needed = buf.readUInt32LE(0);
      }
      if (needed >= 0 && total >= needed + 4) {
        const buf = Buffer.concat(chunks, total);
        try {
          resolve(JSON.parse(buf.slice(4, 4 + needed).toString("utf8")));
        } catch (e) {
          reject(e);
        }
      }
    });
    process.stdin.on("end", () => {
      if (needed < 0) reject(new Error("No native message received"));
    });
    process.stdin.on("error", reject);
    setTimeout(() => reject(new Error("Timed out waiting for message")), 20000).unref?.();
  });
}

function writeMessage(obj) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(obj), "utf8");
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length, 0);
    process.stdout.write(Buffer.concat([head, body]), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/* ------------------------------ tag reading ------------------------------ */

function decodeText(payload, encoding) {
  let text;
  switch (encoding) {
    case 0:
      text = payload.toString("latin1");
      break;
    case 1:
      if (payload.length >= 2 && payload[0] === 0xff && payload[1] === 0xfe) text = payload.slice(2).toString("utf16le");
      else if (payload.length >= 2 && payload[0] === 0xfe && payload[1] === 0xff) {
        const swapped = Buffer.from(payload.slice(2));
        swapped.swap16();
        text = swapped.toString("utf16le");
      } else text = payload.toString("utf16le");
      break;
    case 2: {
      let swapped = Buffer.from(payload);
      if (swapped.length % 2) swapped = swapped.slice(0, swapped.length - 1);
      swapped.swap16();
      text = swapped.toString("utf16le");
      break;
    }
    case 3:
      text = payload.toString("utf8");
      break;
    default:
      text = payload.toString("latin1");
  }
  return text.replace(/\u0000+$/g, "").replace(/\uFEFF/g, "").trim();
}

function parseFlac(buffer) {
  if (buffer.length < 8 || buffer.toString("ascii", 0, 4) !== "fLaC") return null;
  let off = 4;
  const tags = {};
  while (off + 4 <= buffer.length) {
    const header = buffer[off];
    const type = header & 0x7f;
    const last = (header & 0x80) !== 0;
    const len = buffer.readUIntBE(off + 1, 3);
    const start = off + 4;
    if (start + len > buffer.length) break;
    if (type === 4) {
      const block = buffer.slice(start, start + len);
      let p = 0;
      if (p + 4 > block.length) break;
      const vendorLen = block.readUInt32LE(p);
      p += 4 + vendorLen;
      if (p + 4 > block.length) break;
      const count = block.readUInt32LE(p);
      p += 4;
      for (let i = 0; i < count && p + 4 <= block.length; i++) {
        const entryLen = block.readUInt32LE(p);
        p += 4;
        if (p + entryLen > block.length) break;
        const entry = block.slice(p, p + entryLen).toString("utf8");
        p += entryLen;
        const eq = entry.indexOf("=");
        if (eq > 0) {
          const key = entry.slice(0, eq).toUpperCase();
          if (!(key in tags)) tags[key] = entry.slice(eq + 1);
        }
      }
    }
    off = start + len;
    if (last) break;
  }
  return tags;
}

function parseId3(buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") return null;
  const version = buffer[3];
  const flags = buffer[5];
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  let off = 10;
  const end = Math.min(buffer.length, 10 + size);
  if (flags & 0x40) {
    if (version === 4) {
      const extSize =
        ((buffer[off] & 0x7f) << 21) |
        ((buffer[off + 1] & 0x7f) << 14) |
        ((buffer[off + 2] & 0x7f) << 7) |
        (buffer[off + 3] & 0x7f);
      off += extSize;
    } else {
      off += 4 + buffer.readUInt32BE(off);
    }
  }
  const tags = {};
  while (off + 10 <= end) {
    const id = buffer.toString("ascii", off, off + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    let frameSize;
    if (version === 4) {
      frameSize =
        ((buffer[off + 4] & 0x7f) << 21) |
        ((buffer[off + 5] & 0x7f) << 14) |
        ((buffer[off + 6] & 0x7f) << 7) |
        (buffer[off + 7] & 0x7f);
    } else {
      frameSize = buffer.readUInt32BE(off + 4);
    }
    if (frameSize <= 0 || off + 10 + frameSize > end) break;
    const data = buffer.slice(off + 10, off + 10 + frameSize);
    if (data.length > 1) {
      if (id === "TIT2") tags.TITLE = decodeText(data.slice(1), data[0]);
      else if (id === "TPE1") tags.ARTIST = decodeText(data.slice(1), data[0]);
      else if (id === "TALB") tags.ALBUM = decodeText(data.slice(1), data[0]);
      else if (id === "TYER" || id === "TDRC") tags.DATE = decodeText(data.slice(1), data[0]);
      else if (id === "TRCK") tags.TRACKNUMBER = decodeText(data.slice(1), data[0]);
    }
    off += 10 + frameSize;
  }
  return tags;
}

async function readTags(file) {
  const ext = path.extname(file).toLowerCase();
  let handle;
  try {
    handle = await fsp.open(file, "r");
    const max = 1024 * 1024;
    const buf = Buffer.alloc(max);
    const { bytesRead } = await handle.read(buf, 0, max, 0);
    const data = buf.slice(0, bytesRead);
    let tags = null;
    if (ext === ".flac") tags = parseFlac(data);
    else if (ext === ".mp3") tags = parseId3(data);
    if (!tags) return null;
    const artist = tags.ARTIST || tags.album_artist || tags.ALBUMARTIST || tags["ALBUM ARTIST"] || "";
    const title = tags.TITLE || "";
    const year = String(tags.DATE || tags.YEAR || "").trim();
    return {
      artist: String(artist).trim(),
      title: String(title).trim(),
      album: String(tags.ALBUM || "").trim(),
      year: year === "NaN" ? "" : year,
      track: String(tags.TRACKNUMBER || "").trim(),
    };
  } catch (e) {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/* ------------------------------- commands -------------------------------- */

function ensureDir(dir) {
  return fsp.mkdir(dir, { recursive: true });
}

async function cmdPing(msg) {
  const stat = await fsp.stat(msg.dir || os.homedir()).catch(() => null);
  return {
    ok: true,
    helper: "ymp-files",
    version: 1,
    node: process.version,
    platform: process.platform,
    dirExists: !!stat && stat.isDirectory(),
  };
}

async function cmdList(msg) {
  const dir = path.resolve(msg.dir);
  const offset = Number(msg.offset) || 0;
  const limit = Math.min(Number(msg.limit) || 300, 400);
  const withTags = msg.tags !== false;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ru"));
  const slice = files.slice(offset, offset + limit);
  const items = [];
  for (const name of slice) {
    const full = path.join(dir, name);
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat) continue;
    const item = {
      name,
      size: stat.size,
      mtime: Math.round(stat.mtimeMs),
      ext: path.extname(name).slice(1).toLowerCase(),
    };
    if (withTags) {
      const tags = await readTags(full);
      if (tags) item.tags = tags;
    }
    items.push(item);
  }
  return {
    ok: true,
    dir,
    total: files.length,
    offset,
    count: items.length,
    files: items,
  };
}

async function cmdMove(msg) {
  const from = path.resolve(msg.from);
  const dir = path.resolve(msg.dir || path.dirname(from));
  await ensureDir(dir);
  const target = path.join(dir, path.basename(from));
  if (path.resolve(from).toLowerCase() === target.toLowerCase()) {
    return { ok: true, action: "already", path: target };
  }
  const srcStat = await fsp.stat(from);
  if (!srcStat.isFile()) throw new Error("Source is not a file: " + from);
  const dstStat = await fsp.stat(target).catch(() => null);
  if (dstStat) {
    if (dstStat.size === srcStat.size) {
      await fsp.unlink(from).catch(() => {});
      return { ok: true, action: "duplicate-removed", path: target };
    }
    return { ok: true, action: "conflict", path: target, source: from };
  }
  try {
    await fsp.rename(from, target);
  } catch (e) {
    if (e.code === "EXDEV") {
      await fsp.copyFile(from, target);
      await fsp.unlink(from);
    } else {
      throw e;
    }
  }
  return { ok: true, action: "moved", path: target };
}

async function cmdDelete(msg) {
  const file = path.resolve(msg.path);
  await fsp.unlink(file);
  return { ok: true, path: file };
}

async function cmdStat(msg) {
  const dir = path.resolve(msg.dir);
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((e) => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()));
  let bytes = 0;
  for (const f of files) {
    const st = await fsp.stat(path.join(dir, f.name)).catch(() => null);
    if (st) bytes += st.size;
  }
  return { ok: true, dir, count: files.length, bytes, exists: true };
}

async function cmdOpen(msg) {
  const dir = path.resolve(msg.dir);
  await ensureDir(dir);
  const { spawn } = require("child_process");
  spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
  return { ok: true, dir };
}

const commands = {
  ping: cmdPing,
  list: cmdList,
  move: cmdMove,
  delete: cmdDelete,
  stat: cmdStat,
  open: cmdOpen,
};

(async () => {
  try {
    const msg = await readStdinMessage();
    const handler = commands[msg && msg.cmd];
    if (!handler) throw new Error("Unknown command: " + (msg && msg.cmd));
    const result = await handler(msg);
    await writeMessage(result);
  } catch (e) {
    await writeMessage({ ok: false, error: String((e && e.message) || e) }).catch(() => {});
    process.exitCode = 1;
  } finally {
    setTimeout(() => process.exit(), 50);
  }
})();
