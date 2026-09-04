// =============================================
// Nav / Sidebar — Budget Management Ads
// =============================================

async function initNav(activePage) {
  const profile = await getProfile();
  if (!profile) return;

  const isAdmin = profile.role === 'admin';

  // Render sidebar
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <span>💰</span> Budget Ads
    </div>

    <div class="sidebar-section">Menu</div>
    <ul class="sidebar-menu">
      <li><a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">
        <span class="icon">📊</span> Dashboard
      </a></li>
      <li><a href="topup.html" class="${activePage === 'topup' ? 'active' : ''}">
        <span class="icon">💸</span> Request Top Up
      </a></li>
      <li><a href="akun.html" class="${activePage === 'akun' ? 'active' : ''}">
        <span class="icon">📱</span> Akun Ads Saya
      </a></li>
      <li><a href="history.html" class="${activePage === 'history' ? 'active' : ''}">
        <span class="icon">📋</span> Riwayat
      </a></li>
    </ul>

    ${isAdmin ? `
    <div class="sidebar-section">Admin</div>
    <ul class="sidebar-menu">
      <li><a href="produk.html" class="${activePage === 'produk' ? 'active' : ''}">
        <span class="icon">🏷️</span> Kelola Produk
      </a></li>
      <li><a href="semua-request.html" class="${activePage === 'semua-request' ? 'active' : ''}">
        <span class="icon">📥</span> Semua Request
      </a></li>
      <li><a href="settings.html" class="${activePage === 'settings' ? 'active' : ''}">
        <span class="icon">⚙️</span> Settings
      </a></li>
    </ul>
    ` : ''}

    <div class="sidebar-bottom">
      <div class="user-info" onclick="logout()">
        <div class="avatar">${profile.nama.charAt(0).toUpperCase()}</div>
        <div>
          <div class="user-name">${profile.nama}</div>
          <div class="user-role">${isAdmin ? 'Admin' : 'Advertiser'}</div>
        </div>
      </div>
    </div>
  `;

  // Notif bell
  loadNotifications(profile.id);
}

async function loadNotifications(userId) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data) return;

  const unread = data.filter(n => !n.is_read);
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');

  if (badge) {
    badge.style.display = unread.length > 0 ? 'flex' : 'none';
    badge.textContent = unread.length > 9 ? '9+' : unread.length;
  }

  if (list) {
    if (data.length === 0) {
      list.innerHTML = '<div class="notif-empty">Tidak ada notifikasi</div>';
    } else {
      list.innerHTML = data.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead('${n.id}', '${n.link || ''}')">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${timeAgo(n.created_at)}</div>
        </div>
      `).join('');
    }
  }
}

async function markRead(id, link) {
  await _sb.from('notifications').update({ is_read: true }).eq('id', id);
  if (link) window.location.href = link;
  else loadNotifications((await getProfile()).id);
}

async function markAllRead() {
  const profile = await getProfile();
  await _sb.from('notifications').update({ is_read: true }).eq('user_id', profile.id);
  loadNotifications(profile.id);
}

function toggleNotif() {
  document.getElementById('notifDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('notifBtn');
  const dd = document.getElementById('notifDropdown');
  if (dd && !btn?.contains(e.target) && !dd.contains(e.target)) {
    dd.classList.remove('show');
  }
});
