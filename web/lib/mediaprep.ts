/** Kompres foto/video di perangkat sebelum diunggah (server maks 4 MB). */
export async function prepImage(f: File): Promise<{ blob: Blob; secs: number }> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as any);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  let q = 0.72, b: Blob | null = null;
  for (let i = 0; i < 5; i++) { b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q)); if (b && b.size <= 500 * 1024) break; q -= 0.1; }
  if (!b) throw new Error('bad_file');
  return { blob: b, secs: 1 };
}

/** Video: ambil maks 10 detik, skala ke tinggi ~640, rekam ulang ~700 kbps. */
export async function prepVideo(f: File, onProgress?: (p: number) => void): Promise<{ blob: Blob; secs: number }> {
  const url = URL.createObjectURL(f);
  try {
    const v = document.createElement('video'); v.src = url; v.playsInline = true; v.muted = false; v.preload = 'auto';
    await new Promise<void>((ok, bad) => { v.onloadedmetadata = () => ok(); v.onerror = () => bad(new Error('bad_file')); });
    const secs = Math.min(10, Math.max(1, Math.ceil(v.duration || 10)));
    const k = Math.min(1, 640 / Math.max(1, Math.min(v.videoWidth, v.videoHeight)));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k / 2) * 2; c.height = Math.round(v.videoHeight * k / 2) * 2;
    const g = c.getContext('2d')!;
    const out = c.captureStream(30);
    const cap = (v as any).captureStream?.() as MediaStream | undefined;
    cap?.getAudioTracks().forEach((t) => out.addTrack(t));
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m));
    if (!mime) throw new Error('bad_file');
    const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 700_000, audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    let raf = 0;
    const draw = () => { g.drawImage(v, 0, 0, c.width, c.height); onProgress?.(Math.min(1, v.currentTime / secs)); if (v.currentTime >= secs || v.ended) { v.pause(); rec.stop(); } else raf = requestAnimationFrame(draw); };
    rec.start(500); await v.play(); raf = requestAnimationFrame(draw);
    await done; cancelAnimationFrame(raf);
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (blob.size > 4 * 1024 * 1024) throw new Error('too_big');
    return { blob, secs };
  } finally { URL.revokeObjectURL(url); }
}

/** Ambil kotak MP4/MOV tingkat atas selain mdat (metadata asli: moov, udta, xmp, c2pa) agar server (Deks) bisa memeriksanya;
 *  video dikompres ulang di perangkat sehingga metadata aslinya hilang di berkas yang diunggah. */
export async function mp4Meta(f: Blob): Promise<Uint8Array> {
  const out: Uint8Array[] = []; let total = 0, off = 0;
  try {
    while (off + 8 <= f.size && total < 900_000) {
      const h = new DataView(await f.slice(off, off + 16).arrayBuffer());
      let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
      if (size === 1 && h.byteLength >= 16) size = Number(h.getBigUint64(8)); else if (size === 0) size = f.size - off;
      if (size < 8 || off + size > f.size) break;
      if (type !== 'mdat' && size <= 600_000) { const b = new Uint8Array(await f.slice(off, off + size).arrayBuffer()); out.push(b); total += b.length; }
      off += size;
    }
  } catch { /* berkas bukan MP4 */ }
  const r = new Uint8Array(total); let p = 0; for (const b of out) { r.set(b, p); p += b.length; }
  return r;
}
/** Paket untuk server: 'DKS1' + 1 (sidecar) + panjang(4, BE) + metadata + berkas yang disimpan. */
export function packMeta(meta: Uint8Array, stored: Uint8Array): Uint8Array {
  const h = new Uint8Array(9); h.set([0x44, 0x4b, 0x53, 0x31, 1]); new DataView(h.buffer).setUint32(5, meta.length, false);
  const r = new Uint8Array(9 + meta.length + stored.length); r.set(h); r.set(meta, 9); r.set(stored, 9 + meta.length); return r;
}
