// api/topup.js — Vercel Serverless
// Actions: extract | notify | notify-advertiser

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  const { action } = body;

  try {
    if (action === 'extract') return await handleExtract(body, res);
    if (action === 'notify') return await handleNotify(body, res);
    if (action === 'notify-advertiser') return await handleNotifyAdvertiser(body, res);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ─── EXTRACT via Claude Vision ───────────────────────────────
async function handleExtract(body, res) {
  const { imageUrl, targetBiayaPerHasil, sisaLimit, tipe } = body;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: imageUrl }
        },
        {
          type: 'text',
          text: `Ini adalah screenshot Meta Ads Manager. Extract data berikut dalam format JSON:
{
  "spend": <total Jumlah yang dibelanjakan, angka saja tanpa Rp/titik/koma>,
  "hasil": <total Hasil (jumlah konversi/purchases), angka saja>,
  "biaya_per_hasil": <Biaya per hasil rata-rata, angka saja>,
  "anggaran": <Anggaran harian jika ada, angka saja atau null>
}
Jika ada baris "Hasil dari X kampanye" gunakan baris total tersebut.
Jika kolom tidak ditemukan, isi null. Balas HANYA JSON, tanpa penjelasan.`
        }
      ]
    }]
  });

  let extracted;
  try {
    const text = message.content[0].text.trim();
    extracted = JSON.parse(text.replace(/```json?/g, '').replace(/```/g, '').trim());
  } catch {
    return res.json({ success: false, error: 'Gagal parse hasil AI. Pastikan screenshot menampilkan kolom yang benar.' });
  }

  // Hitung rekomendasi
  const rekomendasi = hitungRekomendasi(extracted, targetBiayaPerHasil, sisaLimit, tipe);

  return res.json({ success: true, extracted, rekomendasi });
}

function hitungRekomendasi(ext, target, sisaLimit, tipe) {
  const bph = ext.biaya_per_hasil;
  const spend = ext.spend || 0;

  if (!bph || bph === 0) {
    return { keputusan: 'stop', label: '🛑 Stop — Data tidak lengkap', alasan: 'Biaya per hasil tidak ditemukan di screenshot.', nominal: 0 };
  }

  const ratio = bph / target; // < 1 = bagus, > 1 = jelek

  let keputusan, label, alasan, persen;

  if (ratio <= 1.0) {
    // Performa bagus — rekomendasikan full atau lebih
    keputusan = 'approve';
    persen = 1.0;
    label = '✅ Performa Bagus — Top Up Penuh';
    alasan = `Biaya per hasil ${formatRp(bph)} ≤ target ${formatRp(target)}. Performa on track.`;
  } else if (ratio <= 1.3) {
    // Sedikit di atas target — kurangi 25%
    keputusan = 'reduce';
    persen = 0.75;
    label = '⚠️ Performa Cukup — Top Up 75%';
    alasan = `Biaya per hasil ${formatRp(bph)} sedikit di atas target ${formatRp(target)} (${Math.round(ratio * 100)}%). Kurangi budget.`;
  } else if (ratio <= 1.6) {
    // Jauh di atas target — kurangi 50%
    keputusan = 'reduce';
    persen = 0.5;
    label = '⚠️ Performa Kurang — Top Up 50%';
    alasan = `Biaya per hasil ${formatRp(bph)} jauh di atas target ${formatRp(target)} (${Math.round(ratio * 100)}%). Evaluasi campaign.`;
  } else {
    // Sangat jelek — stop
    keputusan = 'stop';
    persen = 0;
    label = '🛑 Performa Buruk — Jangan Top Up';
    alasan = `Biaya per hasil ${formatRp(bph)} lebih dari 160% target ${formatRp(target)}. Hentikan atau optimasi campaign dulu.`;
  }

  // Basis: spend kemarin (pagi) atau spend sekarang (sore)
  const basisTopup = tipe === 'pagi' ? spend : Math.max(spend * 0.5, 50000);
  const nominalRaw = Math.min(basisTopup * persen, sisaLimit);
  const nominal = Math.floor(nominalRaw / 1000) * 1000; // bulatkan ke ribuan

  return { keputusan, label, alasan, persen, nominal };
}

// ─── NOTIFY Admin via WA ─────────────────────────────────────
async function handleNotify(body, res) {
  const {
    requestId, approveToken,
    advertiserNama, akunNama, produkNama, tipe,
    extracted, rekomendasi
  } = body;

  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'wa_targets').single();
  const targets = settings?.value || [];

  if (targets.length === 0) return res.json({ success: true, sent: 0 });

  const appUrl = process.env.APP_URL || 'https://your-app.vercel.app';
  const reviewUrl = `${appUrl}/semua-request.html`;

  const ikonKep = { approve: '✅', reduce: '⚠️', stop: '🛑' };
  const ikon = ikonKep[rekomendasi.keputusan] || '📋';

  const msg = `${ikon} *Request Top Up Baru*

👤 Advertiser: ${advertiserNama}
📱 Akun: ${akunNama}
🏷️ Produk: ${produkNama || '—'}
⏰ Waktu: ${tipe.toUpperCase()}

📊 *Data dari Screenshot:*
• Spend: ${formatRp(extracted.spend)}
• Hasil: ${extracted.hasil || '—'}
• Biaya/Hasil: ${formatRp(extracted.biaya_per_hasil)}

🤖 *Rekomendasi AI:*
${rekomendasi.label}
${rekomendasi.alasan}
${rekomendasi.nominal ? `Nominal: ${formatRp(rekomendasi.nominal)}` : ''}

👉 Review di: ${reviewUrl}`;

  let sent = 0;
  for (const t of targets) {
    if (!t.no) continue;
    await sendWA(t.no, msg);
    sent++;
  }

  return res.json({ success: true, sent });
}

// ─── NOTIFY Advertiser via WA ─────────────────────────────────
async function handleNotifyAdvertiser(body, res) {
  const { advertiserWa, status, akunNama, produkNama, tipe, nominalActual, catatan } = body;
  if (!advertiserWa) return res.json({ success: true, skipped: 'no WA number' });

  let msg;
  if (status === 'approved') {
    msg = `✅ *Top Up Disetujui*

📱 Akun: ${akunNama}
🏷️ Produk: ${produkNama || '—'}
⏰ Waktu: ${tipe?.toUpperCase()}
💰 Nominal: ${formatRp(nominalActual)}

${catatan ? `📝 Catatan: ${catatan}` : 'Budget sudah di-top up. Selamat beriklan! 🚀'}`;
  } else {
    msg = `❌ *Request Top Up Ditolak*

📱 Akun: ${akunNama}
⏰ Waktu: ${tipe?.toUpperCase()}

📝 Alasan: ${catatan || '—'}

Silakan perbaiki campaign dan coba lagi besok.`;
  }

  await sendWA(advertiserWa, msg);
  return res.json({ success: true });
}

// ─── Helper ───────────────────────────────────────────────────
async function sendWA(no, message) {
  try {
    await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': process.env.FONNTE_TOKEN },
      body: new URLSearchParams({ target: no, message })
    });
  } catch (e) {
    console.error('WA send error:', e.message);
  }
}

function formatRp(n) {
  if (!n && n !== 0) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}
