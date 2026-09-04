// =============================================
// Auth Helper — Budget Management Ads
// =============================================

const _sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

async function getUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const cached = sessionStorage.getItem('bma_profile');
  if (cached) return JSON.parse(cached);

  const { data } = await _sb.from('profiles').select('*').eq('id', user.id).single();

  // Profile belum ada — auto-create
  if (!data) {
    const fallback = {
      id: user.id,
      nama: user.email.split('@')[0],
      role: 'advertiser',
      no_wa: null
    };
    await _sb.from('profiles').insert(fallback);
    sessionStorage.setItem('bma_profile', JSON.stringify(fallback));
    return fallback;
  }

  sessionStorage.setItem('bma_profile', JSON.stringify(data));
  return data;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = 'login.html'; return null; }
  return user;
}

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return profile;
}

async function logout() {
  sessionStorage.removeItem('bma_profile');
  await _sb.auth.signOut();
  window.location.href = 'login.html';
}

function formatRp(n) {
  if (!n && n !== 0) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(str) {
  const diff = (Date.now() - new Date(str)) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  return Math.floor(diff / 86400) + ' hari lalu';
}

// Toast
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
