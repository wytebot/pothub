const enc = new TextEncoder();
const dec = new TextDecoder();
const u16 = (v) => [v & 255, (v >>> 8) & 255];
const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
const read16 = (b, p) => b[p] | (b[p + 1] << 8);
const read32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function concat(chunks) { const size = chunks.reduce((n, c) => n + c.length, 0), out = new Uint8Array(size); let offset = 0; for (const c of chunks) { out.set(c, offset); offset += c.length; } return out; }
export function createZip(files) {
  if (files.length > 5000) throw new Error('Backup has too many files.');
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name); const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data); if (name.length > 240 || data.length > 50 * 1024 * 1024) throw new Error('Backup file exceeds the supported size.');
    const crc = crc32(data), head = new Uint8Array([0x50,0x4b,0x03,0x04,...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    local.push(head, name, data);
    const centralHead = new Uint8Array([0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);
    central.push(centralHead, name); offset += head.length + name.length + data.length;
  }
  const directory = concat(central), end = new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(directory.length),...u32(offset),...u16(0)]);
  return concat([...local, directory, end]);
}
export function readZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer), files = new Map(); if(bytes.length>55*1024*1024)throw new Error('Backup ZIP exceeds the 50 MB restore limit.'); let p = 0, total = 0, count = 0;
  while (p + 4 <= bytes.length && read32(bytes, p) === 0x04034b50) {
    if (++count > 5000) throw new Error('Backup has too many files.');
    const flags = read16(bytes, p + 6), method = read16(bytes, p + 8), crc = read32(bytes, p + 14), compressed = read32(bytes, p + 18), size = read32(bytes, p + 22), nameLen = read16(bytes, p + 26), extraLen = read16(bytes, p + 28);
    if (flags !== 0 || method !== 0 || compressed !== size) throw new Error('Unsupported ZIP compression or flags. Re-export the backup from Pothub.');
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nameLen)); if (!name || name.startsWith('/') || name.split('/').includes('..')) throw new Error('Backup contains an unsafe path.');
    const start = p + 30 + nameLen + extraLen, end = start + size; if (end > bytes.length) throw new Error('Backup ZIP is truncated.');
    const data = bytes.slice(start, end); if (crc32(data) !== crc) throw new Error(`Backup file failed integrity validation: ${name}`);
    total += size; if (total > 50 * 1024 * 1024) throw new Error('Backup exceeds the 50 MB restore limit.'); files.set(name, data); p = end;
  }
  if (!files.size) throw new Error('This ZIP is empty or is not a supported Pothub backup.');
  return files;
}
export { enc as backupEncoder, dec as backupDecoder };

const TOKEN_PATTERNS=[/\bAIza[0-9A-Za-z_-]{20,}\b/g,/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,/\bsk-(?:proj-|ant-|live_|test_)?[A-Za-z0-9_-]{20,}={0,2}\b/g];
export function sanitizeBackupData(value){if(typeof value==='string'){let out=value;for(const pattern of TOKEN_PATTERNS)out=out.replace(pattern,'[REDACTED_API_KEY]');out=out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi,'Bearer [REDACTED]');out=out.replace(/((?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|password)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]');return out}if(Array.isArray(value))return value.map(sanitizeBackupData);if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))out[key]=sanitizeBackupData(item);return out}return value}
