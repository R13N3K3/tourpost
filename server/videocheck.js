// Prüft ein hochgeladenes Video mit ffprobe, bevor es in den Vorrat kommt.
// Harte Fehler lehnen den Upload ab, Hinweise erscheinen als Warnung in der App.
// Ist ffprobe nicht installiert, wird nicht geprüft (der Upload geht dann ohne Prüfung durch).
const { execFile } = require('child_process');

const NAMES = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' };

function probe(file) {
  return new Promise(resolve => {
    execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
      { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err && err.code === 'ENOENT') return resolve({ available: false });
        if (err) return resolve({ available: true, valid: false });
        try {
          const j = JSON.parse(stdout);
          const v = (j.streams || []).find(s => s.codec_type === 'video');
          if (!v) return resolve({ available: true, valid: false });
          const a = (j.streams || []).find(s => s.codec_type === 'audio');
          // gedrehte Videos (Handy-Aufnahmen) zählen mit der angezeigten Ausrichtung
          const rot = Math.abs(Number(v.side_data_list?.find(d => 'rotation' in d)?.rotation ?? v.tags?.rotate ?? 0)) % 180 === 90;
          resolve({
            available: true, valid: true,
            width: rot ? v.height : v.width,
            height: rot ? v.width : v.height,
            duration: Number(j.format?.duration ?? v.duration) || 0,
            vcodec: v.codec_name,
            acodec: a?.codec_name || null,
          });
        } catch {
          resolve({ available: true, valid: false });
        }
      });
  });
}

// Liefert { errors: [...], warnings: [...] } für die gewählten Plattformen.
function check(info, platforms) {
  const errors = [];
  const warnings = [];
  if (!info.available) return { errors, warnings };
  if (!info.valid) return { errors: ['Die Datei ist kein lesbares Video.'], warnings };

  const { width, height, duration, vcodec } = info;
  const portrait = height > width;
  const secs = Math.round(duration);
  const has = p => platforms.includes(p);

  if (has('instagram')) {
    if (duration < 3) errors.push(`Instagram: Reels müssen mindestens 3 Sekunden lang sein (das Video hat ${secs} s).`);
    if (duration > 900) warnings.push(`Instagram: Reels dürfen höchstens 15 Minuten lang sein (das Video hat ${Math.round(duration / 60)} min).`);
    if (!portrait) warnings.push(`Instagram: Das Video ist im Querformat (${width}×${height}). Reels sind für Hochformat 9:16 gedacht.`);
  }
  if (has('youtube')) {
    if (duration > 180) warnings.push(`YouTube: Über 3 Minuten, das Video wird kein Short (${Math.round(duration / 60)} min).`);
    if (width > height) warnings.push(`YouTube: Querformat (${width}×${height}), das Video wird nicht als Short erkannt.`);
  }
  if (has('tiktok') && !portrait) {
    warnings.push(`TikTok: Das Video ist im Querformat (${width}×${height}), Hochformat 9:16 wirkt besser.`);
  }
  if (vcodec && vcodec !== 'h264' && platforms.some(p => NAMES[p])) {
    warnings.push(`Das Video nutzt den Codec ${vcodec}. H.264 in MP4 ist am sichersten, sonst kann die Plattform es ablehnen.`);
  }
  return { errors, warnings };
}

module.exports = { probe, check };
