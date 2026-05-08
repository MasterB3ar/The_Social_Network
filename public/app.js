const state = {
  token: localStorage.getItem('tsn_token'),
  me: null,
  users: [],
  globalMessages: [],
  socket: null,
  activeChatUser: null,
  activeMessages: [],
  chatDrafts: {},
  adminUsers: [],
  adminMessages: [],
  adminMessagesTotalCount: 0,
  adminMessagesNextOffset: 0,
  adminMessagesHasMore: false,
  adminPrivateMessagesCount: 0,
  adminReports: [],
  adminStats: null,
  globalNewMessageCount: 0,
  globalChatHasOpened: false,
  globalChatNeedsBottomScroll: false
};

const PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS = 15 * 60 * 1000;

const $ = (selector) => document.querySelector(selector);
const authScreen = $('#authScreen');
const appScreen = $('#appScreen');
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const authError = $('#authError');
const usersList = $('#usersList');
const chatPanel = $('#chatPanel');
const messagesList = $('#messagesList');
const globalMessagesList = $('#globalMessagesList');
const globalNewMessagesBtn = $('#globalNewMessagesBtn');
const toast = $('#toast');
const adminUsersList = $('#adminUsersList');
const adminMessageViewer = $('#adminMessageViewer');
const adminMessagesList = $('#adminMessagesList');
const adminReportViewer = $('#adminReportViewer');
const adminReportsList = $('#adminReportsList');
const adminStatsGrid = $('#adminStatsGrid');
const loadMoreAdminMessagesBtn = $('#loadMoreAdminMessagesBtn');

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function initials(name) {
  const parts = String(name || 'TSN').trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || '?';
}


function avatarHtml(userOrName, size = '') {
  const name = typeof userOrName === 'string' ? userOrName : (userOrName?.name || 'TSN');
  return `<div class="avatar ${escapeHtml(size)}">${escapeHtml(initials(name))}</div>`;
}

function applyAvatarElement(element, userOrName, size = '') {
  if (!element) return;
  const name = typeof userOrName === 'string' ? userOrName : (userOrName?.name || 'TSN');
  element.className = ['avatar', size].filter(Boolean).join(' ');
  element.removeAttribute('style');
  element.textContent = initials(name);
}

function directMessageBodyHtml(message) {
  return message?.text ? `<span>${escapeHtml(message.text)}</span>` : '<span></span>';
}


function mergeUpdatedPublicUser(user) {
  if (!user?.id) return;
  if (state.me?.id === user.id) state.me = { ...state.me, ...user };
  state.users = state.users.map((candidate) => candidate.id === user.id ? { ...candidate, ...user } : candidate);
  state.adminUsers = state.adminUsers.map((candidate) => candidate.id === user.id ? { ...candidate, ...user } : candidate);
  if (state.activeChatUser?.id === user.id) state.activeChatUser = { ...state.activeChatUser, ...user };
  state.globalMessages.forEach((message) => {
    if (message.author?.id === user.id || message.authorId === user.id) message.author = { ...(message.author || {}), ...user };
    (message.comments || []).forEach((comment) => {
      if (comment.author?.id === user.id || comment.authorId === user.id) comment.author = { ...(comment.author || {}), ...user };
    });
  });
}

function rerenderAfterProfileUpdate() {
  renderMe();
  renderUsers();
  renderGlobalMessages();
  renderChat();
  renderAdminUsers();
}

function formatTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'nu';
  if (minutes < 60) return `${minutes} min. siden`;
  if (hours < 24) return `${hours} t. siden`;
  if (days < 7) return `${days} d. siden`;
  return date.toLocaleDateString();
}

function formatExactDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Ukendt';
  return date.toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
}

function formatNumber(value) {
  return new Intl.NumberFormat('da-DK').format(Number(value) || 0);
}

function canDeleteMessage(authorId) {
  return Boolean(state.me && (state.me.isAdmin || authorId === state.me.id));
}

function canDeletePrivateMessageForEveryone(message) {
  if (!state.me || !message) return false;
  if (state.me.isAdmin) return true;
  if (message.from !== state.me.id) return false;
  const sentAt = new Date(message.createdAt || 0).getTime();
  if (!Number.isFinite(sentAt)) return false;
  const ageMs = Date.now() - sentAt;
  return ageMs >= 0 && ageMs <= PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS;
}

function deletePrivateMessageLabel(message) {
  if (state.me?.isAdmin) return 'Slet for alle';
  const sentAt = new Date(message.createdAt || 0).getTime();
  const remainingMs = Math.max(0, PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS - (Date.now() - sentAt));
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Slet for alle (${remainingMinutes} min.)`;
}


function dedupeUsers(users) {
  const seen = new Set();
  return (Array.isArray(users) ? users : []).filter((user) => {
    const username = String(user?.username || '').trim().toLowerCase();
    const key = username || user?.id || '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unreadBadgeText(count) {
  const number = Number(count) || 0;
  if (number <= 0) return '';
  return number > 99 ? '99+' : String(number);
}

function displayRole(role) {
  return role === 'admin' ? 'admin' : 'bruger';
}

function displayAdminStatus(user) {
  if (user.banned) return 'Banned';
  if (user.muted) return 'Muted';
  return user.online ? 'Online' : 'Offline';
}

function adminStatusClass(user) {
  if (user.banned) return 'danger';
  if (user.muted) return 'warning';
  if (user.online) return 'success';
  return 'muted';
}

function reportTypeLabel(type) {
  if (type === 'global-message') return 'global chatbesked';
  if (type === 'global-comment') return 'global kommentar';
  if (type === 'direct-message') return 'privat besked';
  if (type === 'user') return 'bruger';
  return 'indhold';
}

async function createReport(type, payload = {}) {
  const reason = prompt(`Hvorfor vil du rapportere denne ${reportTypeLabel(type)}?`);
  if (reason === null) return;
  const cleanReason = reason.trim();
  if (!cleanReason) {
    showToast('Rapporten skal have en kort grund.');
    return;
  }

  await api('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ type, reason: cleanReason, ...payload })
  });
  showToast('Rapport sendt til admin');
}

function setUnreadForUser(userId, count) {
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) return false;
  user.unreadCount = Math.max(0, Number(count) || 0);
  return true;
}

function incrementUnreadForUser(userId) {
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) return false;
  user.unreadCount = Math.max(0, Number(user.unreadCount) || 0) + 1;
  return true;
}

function upsertGlobalMessage(message) {
  if (!message || !message.id) return false;
  const index = state.globalMessages.findIndex((candidate) => candidate.id === message.id);
  if (index >= 0) {
    state.globalMessages[index] = message;
  } else {
    state.globalMessages.push(message);
  }
  state.globalMessages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return true;
}

function getScrollSnapshot(element) {
  if (!element) return null;
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return {
    distanceFromBottom,
    wasNearBottom: distanceFromBottom <= 96,
    hadOverflow: element.scrollHeight > element.clientHeight
  };
}

function restoreMessageScroll(element, snapshot, { forceBottom = false } = {}) {
  if (!element) return;

  const apply = () => {
    if (forceBottom || !snapshot || snapshot.wasNearBottom || !snapshot.hadOverflow) {
      element.scrollTop = element.scrollHeight;
      return;
    }

    element.scrollTop = Math.max(
      0,
      element.scrollHeight - element.clientHeight - snapshot.distanceFromBottom
    );
  };

  apply();
  requestAnimationFrame(apply);
}

function isElementNearBottom(element, threshold = 96) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

function updateGlobalNewMessagesButton() {
  if (!globalNewMessagesBtn) return;
  const count = Number(state.globalNewMessageCount || 0);
  globalNewMessagesBtn.classList.toggle('hidden', count <= 0);
  globalNewMessagesBtn.textContent = count > 1 ? `${count} nye beskeder ↓` : '1 ny besked ↓';
}

function clearGlobalNewMessages({ scroll = false } = {}) {
  state.globalNewMessageCount = 0;
  updateGlobalNewMessagesButton();
  if (scroll) scrollElementToBottom(globalMessagesList);
}

function handleIncomingGlobalMessage(message) {
  const wasKnown = state.globalMessages.some((candidate) => candidate.id === message?.id);
  const scrollSnapshot = getScrollSnapshot(globalMessagesList);
  const activeGlobal = appScreen.dataset.view === 'global';
  const mine = message?.authorId === state.me?.id;
  const nearBottom = !scrollSnapshot || scrollSnapshot.wasNearBottom;
  upsertGlobalMessage(message);

  if (!wasKnown && !mine && activeGlobal && !nearBottom) {
    state.globalNewMessageCount = Math.min(99, Number(state.globalNewMessageCount || 0) + 1);
  }

  renderGlobalMessages({ forceBottom: mine || (activeGlobal && nearBottom) });
  updateGlobalNewMessagesButton();
}

function blurActiveElement() {
  const active = document.activeElement;
  if (active && typeof active.blur === 'function') active.blur();
}

function scrollElementToTop(element) {
  if (!element) return;

  const apply = () => {
    const previousBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    element.scrollTop = 0;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    element.style.scrollBehavior = previousBehavior;
  };

  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 80);
}

function scrollElementToBottom(element) {
  if (!element) return;

  const apply = () => {
    const previousBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    element.scrollTop = element.scrollHeight;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, left: 0, behavior: 'auto' });
    }
    element.style.scrollBehavior = previousBehavior;
  };

  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 80);
}

function scheduleGlobalChatBottomScroll() {
  if (!globalMessagesList) return;

  const apply = () => scrollElementToBottom(globalMessagesList);
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 80);
  setTimeout(apply, 180);
  setTimeout(apply, 360);
  setTimeout(apply, 700);
}

function requestGlobalChatBottomOnOpen() {
  state.globalChatNeedsBottomScroll = true;
  clearGlobalNewMessages();
  scheduleGlobalChatBottomScroll();
}

function forceGlobalDetailTop() {
  blurActiveElement();

  const container = globalMessagesList;
  const panel = container?.closest('.global-chat');

  const apply = () => {
    if (container) scrollElementToTop(container);
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
    }
  };

  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 120);
  setTimeout(apply, 260);
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 2400);
}

function setToken(token) {
  state.token = token;
  if (token) localStorage.setItem('tsn_token', token);
  else localStorage.removeItem('tsn_token');
}

function showAuth() {
  authScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
  chatPanel.classList.add('hidden');
}

function showApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  updateAppNavigation();
}



function switchAppView(view) {
  const allowedViews = new Set(['profile', 'global', 'private', 'admin']);
  const previousView = appScreen.dataset.view || '';
  const nextView = allowedViews.has(view) ? view : 'global';

  if (nextView === 'admin' && !state.me?.isAdmin) {
    showToast('Admin er kun synlig for admins.');
    appScreen.dataset.view = 'global';
  } else {
    appScreen.dataset.view = nextView;
  }

  const activeView = appScreen.dataset.view || 'global';
  document.querySelectorAll('[data-app-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.appNav === activeView);
  });

  if (activeView !== 'private') {
    chatPanel.classList.add('hidden');
  }

  if (activeView === 'global') {
    const firstOpen = !state.globalChatHasOpened;
    const enteringGlobal = previousView !== 'global';
    if (firstOpen || enteringGlobal) {
      state.globalChatHasOpened = true;
      requestAnimationFrame(requestGlobalChatBottomOnOpen);
    }
  }


  if (activeView === 'admin' && state.me?.isAdmin) {
    loadAdminDashboard().catch((error) => showToast(error.message));
    loadAdminMessages().catch((error) => showToast(error.message));
    loadAdminReports().catch((error) => showToast(error.message));
  }
}

function updateAppNavigation() {
  const adminButton = $('#adminNavButton');
  if (adminButton) adminButton.classList.toggle('hidden', !state.me?.isAdmin);
  if (appScreen.dataset.view === 'admin' && !state.me?.isAdmin) {
    switchAppView('global');
    return;
  }
  switchAppView(appScreen.dataset.view || 'global');
}

document.querySelectorAll('[data-app-nav]').forEach((button) => {
  button.addEventListener('click', () => switchAppView(button.dataset.appNav));
});

const mobileMenuBtn = $('#mobileMenuBtn');
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    const switcher = document.querySelector('.app-switcher');
    if (switcher) switcher.classList.toggle('is-open');
  });
}

function forceLocalLogout(message = 'Du er blevet logget ud.') {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  setToken(null);
  state.me = null;
  state.users = [];
  state.globalMessages = [];
  state.activeChatUser = null;
  state.activeMessages = [];
  state.adminUsers = [];
  state.adminMessages = [];
  state.adminReports = [];
  state.adminStats = null;
  state.globalNewMessageCount = 0;
  state.globalChatHasOpened = false;
  state.globalChatNeedsBottomScroll = false;
  renderAdminMessageViewer();
  renderAdminReportViewer();
  showAuth();
  showToast(message);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (data.logout) forceLocalLogout(data.error || 'Din session er slut.');
    const error = new Error(data.error || 'Noget gik galt.');
    Object.assign(error, data);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function finishAuth(data, message = 'Logget ind') {
  setToken(data.token);
  await initApp({ fromLogin: true });
  showToast(message);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');

    const selected = tab.dataset.tab;
    loginForm.classList.toggle('hidden', selected !== 'login');
    registerForm.classList.toggle('hidden', selected !== 'register');
    authError.textContent = '';
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.textContent = '';

  const form = new FormData(loginForm);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: form.get('login'),
        password: form.get('password')
      })
    });
    await finishAuth(data, 'Logget ind');
  } catch (error) {
    authError.textContent = error.message;
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.textContent = '';

  const form = new FormData(registerForm);
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        username: form.get('username'),
        password: form.get('password')
      })
    });
    await finishAuth(data, 'Konto oprettet og logget ind');
  } catch (error) {
    authError.textContent = error.message;
  }
});


$('#logoutBtn').addEventListener('click', () => forceLocalLogout('Logget ud'));

$('#refreshBtn').addEventListener('click', async () => {
  await loadEverything();
  showToast('TSN er opdateret');
});

const rulesBtn = $('#rulesBtn');
const rulesPanel = $('#rulesPanel');
const closeRulesBtn = $('#closeRulesBtn');
if (rulesBtn && rulesPanel) {
  rulesBtn.addEventListener('click', () => rulesPanel.classList.remove('hidden'));
}
if (closeRulesBtn && rulesPanel) {
  closeRulesBtn.addEventListener('click', () => rulesPanel.classList.add('hidden'));
}
if (rulesPanel) {
  rulesPanel.addEventListener('click', (event) => {
    if (event.target === rulesPanel) rulesPanel.classList.add('hidden');
  });
}

const deleteAccountBtn = $('#deleteAccountBtn');
if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener('click', async () => {
    const password = prompt('Skriv din adgangskode for at slette kontoen permanent:');
    if (password === null) return;
    if (!password.trim()) {
      showToast('Adgangskode er påkrævet.');
      return;
    }
    if (!confirm('Er du helt sikker? Kontoen, globale chatbeskeder og private beskeder bliver slettet.')) return;

    try {
      await api('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({ password })
      });
      forceLocalLogout('Kontoen er slettet.');
    } catch (error) {
      showToast(error.message);
    }
  });
}

$('#profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({
        name: $('#profileName').value,
        bio: $('#profileBio').value
      })
    });
    state.me = data.user;
    renderMe();
    renderGlobalMessages();
    renderChat();
    showToast('Profil gemt');
  } catch (error) {
    showToast(error.message);
  }
});


const adminClaimForm = $('#adminClaimForm');
if (adminClaimForm) {
  adminClaimForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const passwordInput = $('#adminPasswordInput');
    const password = passwordInput.value.trim();
    if (!password) return;

    try {
      const data = await api('/api/admin/claim', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      state.me = data.user;
      passwordInput.value = '';
      renderMe();
      await loadAdminDashboard();
      await loadAdminMessages();
      await loadAdminReports();
      renderGlobalMessages();
      renderChat();
      showToast('Admin-rettigheder aktiveret');
    } catch (error) {
      showToast(error.message);
    }
  });
}

const refreshAdminUsersBtn = $('#refreshAdminUsersBtn');
if (refreshAdminUsersBtn) {
  refreshAdminUsersBtn.addEventListener('click', () => loadAdminUsers().catch((error) => showToast(error.message)));
}

const refreshAdminAllBtn = $('#refreshAdminAllBtn');
if (refreshAdminAllBtn) {
  refreshAdminAllBtn.addEventListener('click', () => loadAdminDashboard().catch((error) => showToast(error.message)));
}

let adminUserSearchTimer = null;
const adminUserSearch = $('#adminUserSearch');
if (adminUserSearch) {
  adminUserSearch.addEventListener('input', () => {
    clearTimeout(adminUserSearchTimer);
    adminUserSearchTimer = setTimeout(() => {
      if (state.me?.isAdmin) loadAdminUsers().catch((error) => showToast(error.message));
    }, 250);
  });
}

const adminUserStatus = $('#adminUserStatus');
if (adminUserStatus) {
  adminUserStatus.addEventListener('change', () => loadAdminUsers().catch((error) => showToast(error.message)));
}

const createBackupBtn = $('#createBackupBtn');
if (createBackupBtn) {
  createBackupBtn.addEventListener('click', async () => {
    const backupStatus = $('#backupStatus');
    createBackupBtn.disabled = true;
    if (backupStatus) backupStatus.textContent = 'Laver backup...';

    try {
      const data = await api('/api/admin/backup', { method: 'POST' });
      if (backupStatus) backupStatus.textContent = `Backup oprettet: ${data.backupFile}`;
      showToast('Databasebackup oprettet');
    } catch (error) {
      if (backupStatus) backupStatus.textContent = 'Backup fejlede';
      showToast(error.message);
    } finally {
      createBackupBtn.disabled = false;
    }
  });
}

const loadAdminMessagesBtn = $('#loadAdminMessagesBtn');
if (loadAdminMessagesBtn) {
  loadAdminMessagesBtn.addEventListener('click', () => loadAdminMessages().catch((error) => showToast(error.message)));
}

if (loadMoreAdminMessagesBtn) {
  loadMoreAdminMessagesBtn.addEventListener('click', () => loadAdminMessages({ append: true }).catch((error) => showToast(error.message)));
}

const loadAdminReportsBtn = $('#loadAdminReportsBtn');
if (loadAdminReportsBtn) {
  loadAdminReportsBtn.addEventListener('click', () => loadAdminReports().catch((error) => showToast(error.message)));
}

const adminReportStatus = $('#adminReportStatus');
if (adminReportStatus) {
  adminReportStatus.addEventListener('change', () => loadAdminReports().catch((error) => showToast(error.message)));
}

const adminReportType = $('#adminReportType');
if (adminReportType) {
  adminReportType.addEventListener('change', () => loadAdminReports().catch((error) => showToast(error.message)));
}

let adminReportSearchTimer = null;
const adminReportSearch = $('#adminReportSearch');
if (adminReportSearch) {
  adminReportSearch.addEventListener('input', () => {
    clearTimeout(adminReportSearchTimer);
    adminReportSearchTimer = setTimeout(() => {
      if (state.me?.isAdmin) loadAdminReports().catch((error) => showToast(error.message));
    }, 250);
  });
}

const adminMessageType = $('#adminMessageType');
if (adminMessageType) {
  adminMessageType.addEventListener('change', () => loadAdminMessages().catch((error) => showToast(error.message)));
}

let adminMessageSearchTimer = null;
const adminMessageSearch = $('#adminMessageSearch');
if (adminMessageSearch) {
  adminMessageSearch.addEventListener('input', () => {
    clearTimeout(adminMessageSearchTimer);
    adminMessageSearchTimer = setTimeout(() => {
      if (state.me?.isAdmin) loadAdminMessages().catch((error) => showToast(error.message));
    }, 250);
  });
}

if (adminMessagesList) {
  adminMessagesList.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-admin-delete-message-item]');
    if (!deleteButton) return;

    const item = state.adminMessages.find((candidate) => candidate.id === deleteButton.dataset.adminDeleteMessageItem);
    if (!item) return;
    if (!confirm(`Slet denne ${item.label || 'besked'} for alle?`)) return;

    try {
      await deleteAdminMessageItem(item);
      state.adminMessages = state.adminMessages.filter((candidate) => candidate.id !== item.id);
      if (item.kind === 'global-message') {
        state.globalMessages = state.globalMessages.filter((message) => message.id !== item.messageId);
        renderGlobalMessages();
      }
      if (item.kind === 'direct-message') {
        state.activeMessages = state.activeMessages.filter((message) => message.id !== item.messageId);
        renderChat();
      }
      renderAdminMessageViewer();
      showToast('Beskeden er slettet for alle.');
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (adminReportsList) {
  adminReportsList.addEventListener('click', async (event) => {
    const resolveButton = event.target.closest('[data-admin-resolve-report]');
    const reopenButton = event.target.closest('[data-admin-reopen-report]');
    const deleteTargetButton = event.target.closest('[data-admin-delete-report-target]');
    const reportId = resolveButton?.dataset.adminResolveReport || reopenButton?.dataset.adminReopenReport || deleteTargetButton?.dataset.adminDeleteReportTarget;
    if (!reportId) return;

    const report = state.adminReports.find((candidate) => candidate.id === reportId);
    if (!report) return;

    try {
      if (deleteTargetButton) {
        if (!confirm(`Håndhæv denne rapport mod ${report.target?.label || 'målet'}?`)) return;
        await api(`/api/admin/reports/${reportId}/target`, { method: 'DELETE' });
        await loadEverything();
        await loadAdminReports();
        showToast('Rapport håndhævet');
        return;
      }

      const action = reopenButton ? 'reopen' : 'resolve';
      await api(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action })
      });
      await loadAdminReports();
      showToast(action === 'reopen' ? 'Rapport genåbnet' : 'Rapport markeret som løst');
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (adminUsersList) {
  adminUsersList.addEventListener('click', async (event) => {
    const kickButton = event.target.closest('[data-admin-kick]');
    const banButton = event.target.closest('[data-admin-ban]');
    const unbanButton = event.target.closest('[data-admin-unban]');
    const muteButton = event.target.closest('[data-admin-mute]');
    const unmuteButton = event.target.closest('[data-admin-unmute]');
    const deleteButton = event.target.closest('[data-admin-delete-user]');

    try {
      if (kickButton) {
        const userId = kickButton.dataset.adminKick;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        if (!confirm(`Smid ${user?.name || 'denne bruger'} ud af TSN nu?`)) return;
        const data = await api(`/api/admin/users/${userId}/kick`, { method: 'POST' });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Bruger smidt ud');
      }

      if (banButton) {
        const userId = banButton.dataset.adminBan;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const reason = prompt(`Ban ${user?.name || 'denne bruger'}? Valgfri grund:`) || '';
        if (!confirm(`Ban ${user?.name || 'denne bruger'} og gennemtving log ud?`)) return;
        const data = await api(`/api/admin/users/${userId}/ban`, {
          method: 'POST',
          body: JSON.stringify({ reason })
        });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Bruger banned');
      }

      if (unbanButton) {
        const userId = unbanButton.dataset.adminUnban;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        if (!confirm(`Fjern ban fra ${user?.name || 'denne bruger'}?`)) return;
        const data = await api(`/api/admin/users/${userId}/unban`, { method: 'POST' });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Ban fjernet');
      }

      if (muteButton) {
        const userId = muteButton.dataset.adminMute;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const minutesRaw = prompt(`Mute ${user?.name || 'denne bruger'} i hvor mange minutter?`, '10');
        if (minutesRaw === null) return;
        const durationMinutes = Math.max(1, Math.min(1440, Number(minutesRaw) || 10));
        const reason = prompt('Valgfri mute-grund:', 'Spam') || 'Spam';
        const data = await api(`/api/admin/users/${userId}/mute`, {
          method: 'POST',
          body: JSON.stringify({ durationMinutes, reason })
        });
        upsertAdminUser(data.user);
        if (data.stats) state.adminStats = data.stats;
        renderAdminUsers();
        renderAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Bruger muted');
      }

      if (unmuteButton) {
        const userId = unmuteButton.dataset.adminUnmute;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        if (!confirm(`Fjern mute fra ${user?.name || 'denne bruger'}?`)) return;
        const data = await api(`/api/admin/users/${userId}/unmute`, { method: 'POST' });
        upsertAdminUser(data.user);
        if (data.stats) state.adminStats = data.stats;
        renderAdminUsers();
        renderAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Mute fjernet');
      }

      if (deleteButton) {
        const userId = deleteButton.dataset.adminDeleteUser;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const typed = prompt(`Skriv SLET for at slette ${user?.name || 'denne bruger'} og alt brugerens indhold:`);
        if (typed !== 'SLET') return;
        await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
        state.adminUsers = state.adminUsers.filter((candidate) => candidate.id !== userId);
        await loadEverything();
        await loadAdminDashboard();
        showToast('Bruger slettet');
      }
    } catch (error) {
      showToast(error.message);
    }
  });
}

$('#globalMessageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#globalMessageInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    const data = await api('/api/global/messages', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    input.value = '';
    upsertGlobalMessage(data.message);
    renderGlobalMessages({ forceBottom: true });
  } catch (error) {
    showToast(error.message);
  }
});

if (globalMessagesList) {
  globalMessagesList.addEventListener('click', async (event) => {
    const deleteMessageButton = event.target.closest('[data-delete-global-message]');
    const reportMessageButton = event.target.closest('[data-report-global-message]');

    try {
      if (reportMessageButton) {
        event.preventDefault();
        event.stopPropagation();
        await createReport('global-message', { messageId: reportMessageButton.dataset.reportGlobalMessage });
        return;
      }

      if (deleteMessageButton) {
        if (!confirm('Slet denne globale chatbesked for alle?')) return;
        const messageId = deleteMessageButton.dataset.deleteGlobalMessage;
        await api(`/api/global/messages/${messageId}`, { method: 'DELETE' });
        state.globalMessages = state.globalMessages.filter((message) => message.id !== messageId);
        renderGlobalMessages();
        showToast('Global chatbesked slettet');
      }
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (globalMessagesList) {
  globalMessagesList.addEventListener('scroll', () => {
    if (isElementNearBottom(globalMessagesList)) clearGlobalNewMessages();
  });
}

if (globalNewMessagesBtn) {
  globalNewMessagesBtn.addEventListener('click', () => clearGlobalNewMessages({ scroll: true }));
}

let userSearchTimer = null;
$('#userSearch').addEventListener('input', () => {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(() => loadUsers($('#userSearch').value), 200);
});

$('#closeChatBtn').addEventListener('click', () => {
  const input = $('#messageInput');
  if (state.activeChatUser && input) {
    state.chatDrafts[state.activeChatUser.id] = input.value;
    input.dataset.chatUserId = '';
    input.value = '';
  }

  state.activeChatUser = null;
  state.activeMessages = [];
  chatPanel.classList.add('hidden');
  renderUsers();
});

$('#messageInput').addEventListener('input', () => {
  if (!state.activeChatUser) return;
  state.chatDrafts[state.activeChatUser.id] = $('#messageInput').value;

  if (state.socket) state.socket.emit('typing', { to: state.activeChatUser.id });
});

function sendPrivateMessage(text = '') {
  const input = $('#messageInput');
  const cleanMessageText = String(text || '').trim();
  if (!cleanMessageText || !state.socket || !state.activeChatUser) return;

  const to = state.activeChatUser.id;
  if (input) state.chatDrafts[to] = input.value;

  state.socket.emit('private-message', { to, text: cleanMessageText }, (response) => {
    if (!response?.ok) {
      showToast(response?.error || 'Kunne ikke sende beskeden.');
      return;
    }

    if (state.activeChatUser?.id === to && input) input.value = '';
    state.chatDrafts[to] = '';
  });
}

$('#messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#messageInput');
  sendPrivateMessage(input.value);
});

if (messagesList) {
  messagesList.addEventListener('click', async (event) => {
    const reportButton = event.target.closest('[data-report-direct-message]');
    const deleteButton = event.target.closest('[data-delete-message]');

    try {
      if (reportButton) {
        await createReport('direct-message', { messageId: reportButton.dataset.reportDirectMessage });
        return;
      }

      if (deleteButton) {
        if (!confirm('Slet denne private besked for alle? Det virker kun for dine egne beskeder inden for 15 minutter efter afsendelse.')) return;
        const messageId = deleteButton.dataset.deleteMessage;
        await api(`/api/messages/${messageId}`, { method: 'DELETE' });
        state.activeMessages = state.activeMessages.filter((message) => message.id !== messageId);
        renderChat();
        showToast('Beskeden er slettet for alle.');
      }
    } catch (error) {
      showToast(error.message);
    }
  });
}

const deleteConversationBtn = $('#deleteConversationBtn');
if (deleteConversationBtn) {
  deleteConversationBtn.addEventListener('click', async () => {
    if (!state.activeChatUser) return;
    const user = state.activeChatUser;
    if (!confirm(`Slet din private chat med ${user.name}? Den bliver kun fjernet for dig.`)) return;

    try {
      await api(`/api/conversations/${user.id}`, { method: 'DELETE' });
      state.activeMessages = [];
      state.chatDrafts[user.id] = '';
      setUnreadForUser(user.id, 0);
      state.activeChatUser = null;
      chatPanel.classList.add('hidden');
      renderUsers();
      showToast('Chatten er slettet for dig.');
    } catch (error) {
      showToast(error.message);
    }
  });
}

const reportChatUserBtn = $('#reportChatUserBtn');
if (reportChatUserBtn) {
  reportChatUserBtn.addEventListener('click', async () => {
    if (!state.activeChatUser) return;
    try {
      const contextMessage = [...state.activeMessages]
        .reverse()
        .find((message) => message.from === state.activeChatUser.id || message.to === state.activeChatUser.id);
      await createReport('user', {
        userId: state.activeChatUser.id,
        contextMessageId: contextMessage?.id || ''
      });
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function markConversationRead(userId) {
  if (!userId) return;
  setUnreadForUser(userId, 0);
  renderUsers();

  try {
    await api(`/api/messages/${userId}/read`, { method: 'POST' });
  } catch {
    // A later users refresh will repair the badge if this request fails.
  }
}

function renderStats() {
  const online = state.users.filter((user) => user.online).length;
  $('#globalCount').textContent = String(state.globalMessages.length);
  $('#userCount').textContent = String(state.users.length);
  $('#onlineCount').textContent = String(online);
  $('#onlinePill').textContent = `${online} online`;
  $('#globalStatus').textContent = `${state.globalMessages.length} beskeder`;
}

function renderMe() {
  if (!state.me) return;
  $('#myName').textContent = state.me.name;
  $('#myUsername').textContent = `@${state.me.username}`;
  $('#profileName').value = state.me.name;
  $('#profileBio').value = state.me.bio || '';
  applyAvatarElement($('#myAvatar'), state.me, 'large');
  renderAdminTools();
}


function renderGlobalChatMessage(message) {
  const mine = message.authorId === state.me?.id;
  const authorName = message.author?.name || 'Ukendt';
  return `
    <article class="global-chat-message ${mine ? 'mine' : ''}" data-global-message-id="${escapeHtml(message.id)}">
      ${avatarHtml(message.author || authorName, 'chat-avatar')}
      <div class="global-chat-bubble">
        <div class="global-chat-meta">
          <strong>${escapeHtml(authorName)}</strong>
          <span>@${escapeHtml(message.author?.username || 'ukendt')} · ${escapeHtml(formatTime(message.createdAt))}</span>
        </div>
        <p>${escapeHtml(message.text)}</p>
        <div class="global-chat-actions">
          <button class="ghost tiny report-button" type="button" data-report-global-message="${escapeHtml(message.id)}">Rapportér</button>
          ${canDeleteMessage(message.authorId) ? `<button class="admin-delete" type="button" data-delete-global-message="${escapeHtml(message.id)}">Slet</button>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderGlobalMessages({ forceBottom = false } = {}) {
  renderStats();
  if (!globalMessagesList) return;
  const scrollSnapshot = getScrollSnapshot(globalMessagesList);
  const shouldForceBottom = Boolean(forceBottom || state.globalChatNeedsBottomScroll);

  if (!state.globalMessages.length) {
    globalMessagesList.classList.remove('is-detail-mode');
    globalMessagesList.innerHTML = '<div class="empty">Der er ingen globale chatbeskeder endnu. Skriv den første.</div>';
    restoreMessageScroll(globalMessagesList, scrollSnapshot, { forceBottom: shouldForceBottom });
    if (shouldForceBottom) scheduleGlobalChatBottomScroll();
    return;
  }

  globalMessagesList.classList.remove('is-detail-mode');
  globalMessagesList.innerHTML = state.globalMessages.map((message) => renderGlobalChatMessage(message)).join('');
  restoreMessageScroll(globalMessagesList, scrollSnapshot, { forceBottom: shouldForceBottom });
  if (shouldForceBottom) {
    state.globalChatNeedsBottomScroll = false;
    scheduleGlobalChatBottomScroll();
  }
}

function renderUsers() {
  renderStats();

  if (!state.users.length) {
    usersList.innerHTML = '';
    return;
  }

  usersList.innerHTML = state.users.map((user) => {
    const isActive = state.activeChatUser?.id === user.id;
    const bio = String(user.bio || '').trim() || 'Ingen bio endnu.';
    return `
      <button class="user-row ${isActive ? 'active' : ''} ${Number(user.unreadCount) > 0 ? 'has-unread' : ''}" data-user-id="${escapeHtml(user.id)}">
        ${avatarHtml(user)}
        <div class="user-row-main">
          <strong>${escapeHtml(user.name)}</strong>
          <span>@${escapeHtml(user.username)}</span>
          <span class="user-bio">${escapeHtml(bio)}</span>
        </div>
        ${Number(user.unreadCount) > 0 ? `<span class="unread-badge" aria-label="${escapeHtml(user.unreadCount)} ulæste private beskeder">${escapeHtml(unreadBadgeText(user.unreadCount))}</span>` : ''}
        <span class="status-dot ${user.online ? 'online' : ''}"></span>
      </button>
    `;
  }).join('');

  usersList.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = state.users.find((candidate) => candidate.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

function messageReadStatus(message) {
  if (!state.me || message.from !== state.me.id) return '';
  const readBy = Array.isArray(message.readBy) ? message.readBy : [];
  return (message.isReadByRecipient || readBy.includes(message.to)) ? 'Læst' : 'Sendt';
}

function markMessagesReadLocally({ conversationId, readByUserId, readMessageIds = [] } = {}) {
  if (!readByUserId || !Array.isArray(state.activeMessages)) return false;
  const ids = new Set(Array.isArray(readMessageIds) ? readMessageIds : []);
  let changed = false;

  state.activeMessages.forEach((message) => {
    const sameConversation = !conversationId || message.conversationId === conversationId;
    const targetMessage = !ids.size || ids.has(message.id);
    if (!sameConversation || !targetMessage) return;
    if (!Array.isArray(message.readBy)) message.readBy = [];
    if (!message.readBy.includes(readByUserId)) {
      message.readBy.push(readByUserId);
      changed = true;
    }
    if (message.to === readByUserId) {
      message.isReadByRecipient = true;
      changed = true;
    }
  });

  return changed;
}

function renderChat({ forceBottom = false } = {}) {
  const user = state.activeChatUser;
  if (!user) return;
  const scrollSnapshot = getScrollSnapshot(messagesList);

  applyAvatarElement($('#chatAvatar'), user);
  $('#chatName').textContent = user.name;
  $('#chatStatus').textContent = user.online ? 'Online nu' : 'Offline';
  const chatBio = $('#chatBio');
  if (chatBio) chatBio.textContent = String(user.bio || '').trim() || 'Ingen bio endnu.';
  chatPanel.classList.remove('hidden');

  if (!state.activeMessages.length) {
    messagesList.innerHTML = '<div class="empty">Der er ingen private beskeder endnu. Start samtalen.</div>';
  } else {
    messagesList.innerHTML = state.activeMessages.map((message) => `
      <div class="message ${message.from === state.me.id ? 'mine' : ''}">
        <div class="message-content">
          ${directMessageBodyHtml(message)}
          ${message.from !== state.me.id ? `<button class="message-report" type="button" data-report-direct-message="${escapeHtml(message.id)}">Rapportér</button>` : ''}
          ${canDeletePrivateMessageForEveryone(message) ? `<button class="message-delete" type="button" data-delete-message="${escapeHtml(message.id)}" aria-label="${escapeHtml(deletePrivateMessageLabel(message))}" title="${escapeHtml(deletePrivateMessageLabel(message))}">×</button>` : ''}
        </div>
        <small>${escapeHtml(formatTime(message.createdAt))}${message.from === state.me.id ? ` · <span class="message-receipt ${messageReadStatus(message) === 'Læst' ? 'read' : ''}">${escapeHtml(messageReadStatus(message))}</span>` : ''}</small>
      </div>
    `).join('');
  }

  const input = $('#messageInput');
  if (input) {
    const draft = state.chatDrafts[user.id] || '';
    if (input.dataset.chatUserId !== user.id) {
      input.value = draft;
      input.dataset.chatUserId = user.id;
    } else if (document.activeElement !== input && input.value !== draft) {
      input.value = draft;
    }
  }

  restoreMessageScroll(messagesList, scrollSnapshot, { forceBottom });
}

async function openChat(user) {
  state.activeChatUser = user;
  state.activeMessages = [];
  renderUsers();
  renderChat({ forceBottom: true });

  try {
    const data = await api(`/api/messages/${user.id}`);
    state.activeChatUser = data.user;
    const latestUser = state.users.find((candidate) => candidate.id === data.user.id);
    if (latestUser) {
      latestUser.unreadCount = 0;
      state.activeChatUser.online = latestUser.online;
    }
    state.activeMessages = data.messages;
    renderUsers();
    renderChat({ forceBottom: true });
    $('#messageInput').focus();
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdminTools() {
  const adminActive = $('#adminActive');
  const adminClaimForm = $('#adminClaimForm');
  const adminModerationPanel = $('#adminModerationPanel');
  if (!adminActive || !adminClaimForm) return;

  adminActive.classList.toggle('hidden', !state.me?.isAdmin);
  adminClaimForm.classList.toggle('hidden', Boolean(state.me?.isAdmin));
  if (adminModerationPanel) adminModerationPanel.classList.toggle('hidden', !state.me?.isAdmin);
  const adminNavButton = $('#adminNavButton');
  if (adminNavButton) adminNavButton.classList.toggle('hidden', !state.me?.isAdmin);
  if (appScreen.dataset.view === 'admin' && !state.me?.isAdmin) appScreen.dataset.view = 'global';
  document.querySelectorAll('[data-app-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.appNav === (appScreen.dataset.view || 'global'));
  });
  renderAdminStats();
  renderAdminUsers();
  renderAdminMessageViewer();
  renderAdminReportViewer();
}

function upsertAdminUser(user) {
  if (!user) return;
  const index = state.adminUsers.findIndex((candidate) => candidate.id === user.id);
  if (index >= 0) state.adminUsers[index] = user;
  else state.adminUsers.push(user);
  state.adminUsers.sort((a, b) => Number(b.online) - Number(a.online) || Number(Boolean(b.banned)) - Number(Boolean(a.banned)) || Number(b.stats?.openReportsAgainstCount || 0) - Number(a.stats?.openReportsAgainstCount || 0) || a.name.localeCompare(b.name));
}

function renderAdminStats() {
  if (!adminStatsGrid || !state.me?.isAdmin) return;
  const stats = state.adminStats || {};
  const cards = [
    { label: 'Brugere', value: stats.usersTotal, sub: `${formatNumber(stats.onlineUsers)} online · ${formatNumber(stats.bannedUsers)} banned` },
    { label: 'Åbne rapporter', value: stats.openReports, sub: `${formatNumber(stats.reportsTotal)} rapporter i alt` },
    { label: 'Muted', value: stats.mutedUsers, sub: `${formatNumber(stats.spamWarnings)} aktive spam-advarsler` },
    { label: 'Global chat', value: stats.globalChatMessages ?? stats.globalPosts, sub: stats.latestGlobalPostAt ? `Seneste ${formatTime(stats.latestGlobalPostAt)}` : 'Ingen globale chatbeskeder endnu' },
    { label: 'Private beskeder', value: stats.directMessages, sub: stats.latestDirectMessageAt ? `Seneste ${formatTime(stats.latestDirectMessageAt)}` : 'Ingen private beskeder endnu' }
  ];

  adminStatsGrid.innerHTML = cards.map((card) => `
    <div class="admin-stat-card">
      <strong>${card.value === undefined || card.value === null ? '–' : escapeHtml(formatNumber(card.value))}</strong>
      <span>${escapeHtml(card.label)}</span>
      <small>${escapeHtml(card.sub || '')}</small>
    </div>
  `).join('');
}

function renderAdminUsers() {
  if (!adminUsersList || !state.me?.isAdmin) return;

  if (!state.adminUsers.length) {
    adminUsersList.innerHTML = '<div class="empty small-empty">Ingen brugere matcher filteret.</div>';
    return;
  }

  adminUsersList.innerHTML = state.adminUsers.map((user) => {
    const isMe = user.id === state.me.id;
    const isProtectedAdmin = user.isAdmin && !isMe;
    const status = displayAdminStatus(user);
    const stats = user.stats || {};
    const created = user.createdAt ? formatExactDate(user.createdAt) : 'Ukendt oprettelse';
    const lastActivity = stats.lastActivityAt ? formatTime(stats.lastActivityAt) : 'Ingen aktivitet';
    const openReports = Number(stats.openReportsAgainstCount || 0);
    return `
      <article class="admin-user-row ${user.banned ? 'banned' : ''} ${user.muted ? 'muted-row' : ''} ${openReports ? 'reported' : ''}">
        <div class="admin-user-main">
          ${avatarHtml(user, 'small-avatar')}
          <div>
            <strong>${escapeHtml(user.name)}${isMe ? ' (dig)' : ''}</strong>
            <span>@${escapeHtml(user.username)} · ${escapeHtml(displayRole(user.role))} · <em class="admin-status ${escapeHtml(adminStatusClass(user))}">${escapeHtml(status)}</em></span>
            <small>Oprettet: ${escapeHtml(created)} · Seneste aktivitet: ${escapeHtml(lastActivity)}</small>
            ${user.banReason ? `<small class="admin-warning-line">Ban-grund: ${escapeHtml(user.banReason)}</small>` : ''}
            ${user.muted ? `<small class="admin-warning-line">Muted indtil ${escapeHtml(formatExactDate(user.mutedUntil))}${user.muteReason ? ` · ${escapeHtml(user.muteReason)}` : ''}</small>` : ''}
            ${user.lastSpamWarningReason ? `<small class="admin-warning-line">Seneste spam: ${escapeHtml(user.lastSpamWarningReason)}</small>` : ''}
          </div>
        </div>
        <div class="admin-user-metrics" aria-label="Brugerstatistik">
          <span>${formatNumber(stats.globalPostsCount)} global chat</span>
          <span>${formatNumber(stats.commentsCount)} hist. kommentarer</span>
          <span>${formatNumber(stats.privateMessagesCount)} DM</span>
          <span class="${Number(user.spamWarnings || 0) ? 'hot' : ''}">${formatNumber(user.spamWarnings || 0)} spam-advarsler</span>
          <span class="${openReports ? 'hot' : ''}">${formatNumber(openReports)} åbne rapporter</span>
        </div>
        <div class="admin-user-actions">
          <button class="ghost tiny" type="button" data-admin-kick="${escapeHtml(user.id)}" ${isMe || user.banned ? 'disabled' : ''}>Log ud</button>
          ${user.muted
            ? `<button class="secondary tiny" type="button" data-admin-unmute="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin ? 'disabled' : ''}>Fjern mute</button>`
            : `<button class="ghost tiny" type="button" data-admin-mute="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin || user.banned ? 'disabled' : ''}>Mute</button>`}
          ${user.banned
            ? `<button class="secondary tiny" type="button" data-admin-unban="${escapeHtml(user.id)}">Fjern ban</button>`
            : `<button class="ghost danger tiny" type="button" data-admin-ban="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin ? 'disabled' : ''}>Ban</button>`}
          <button class="ghost danger tiny" type="button" data-admin-delete-user="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin ? 'disabled' : ''}>Slet</button>
        </div>
      </article>
    `;
  }).join('');
}

function adminMessageParticipants(item) {
  if (item.kind === 'direct-message') return `${item.fromUser?.name || 'Ukendt'} → ${item.toUser?.name || 'Ukendt'}`;
  if (item.kind === 'global-message') return `${item.author?.name || 'Ukendt'} i global chat`;
  if (item.kind === 'global-comment') return `${item.author?.name || 'Ukendt'} skrev en historisk kommentar`;
  return item.author?.name || 'Ukendt';
}

function adminMessageMeta(item) {
  const parts = [item.source || item.label, formatTime(item.createdAt)];
  if (item.kind === 'direct-message') parts.push('privat');
  if (item.kind === 'global-message') parts.push('global chat');
  if (item.kind === 'global-comment') parts.push('historisk kommentar');
  return parts.filter(Boolean).join(' · ');
}

let adminMessagesRefreshTimer = null;
function queueAdminMessagesRefresh() {
  if (!state.me?.isAdmin || !state.adminMessages.length) return;
  clearTimeout(adminMessagesRefreshTimer);
  adminMessagesRefreshTimer = setTimeout(() => {
    loadAdminMessages().catch(() => {});
  }, 700);
}

function renderAdminMessageViewer() {
  if (!adminMessageViewer) return;
  const isAdmin = Boolean(state.me?.isAdmin);
  adminMessageViewer.classList.toggle('hidden', !isAdmin);
  if (!isAdmin) return;

  const shownCount = state.adminMessages.length;
  const totalCount = Number(state.adminMessagesTotalCount || shownCount);
  const count = $('#adminMessageCount');
  if (count) {
    const privateCount = Number(state.adminPrivateMessagesCount || 0);
    const globalText = totalCount > shownCount
      ? `${formatNumber(shownCount)} af ${formatNumber(totalCount)} globale`
      : `${formatNumber(shownCount)} globale`;
    count.textContent = privateCount
      ? `${globalText} · ${formatNumber(privateCount)} private skjult`
      : globalText;
  }

  if (loadMoreAdminMessagesBtn) {
    loadMoreAdminMessagesBtn.classList.toggle('hidden', !state.adminMessagesHasMore);
    loadMoreAdminMessagesBtn.textContent = state.adminMessagesHasMore
      ? `Indlæs flere (${formatNumber(totalCount - shownCount)} tilbage)`
      : 'Alle beskeder er indlæst';
  }

  if (!adminMessagesList) return;

  if (!shownCount) {
    adminMessagesList.innerHTML = '<div class="empty admin-message-empty">Klik på “Indlæs beskeder” for at gennemgå globale TSN-beskeder. Private beskeder vises ikke.</div>';
    adminMessagesList.scrollTop = 0;
    return;
  }

  adminMessagesList.innerHTML = state.adminMessages.map((item, index) => `
    <article class="admin-message-item ${escapeHtml(item.kind)}" data-admin-message-row="${index + 1}">
      <div class="admin-message-topline">
        <span class="admin-message-label">${escapeHtml(item.label)}</span>
        <span class="admin-message-time">${escapeHtml(formatExactDate(item.createdAt))}</span>
      </div>
      <div class="admin-message-main">
        <strong>${escapeHtml(adminMessageParticipants(item))}</strong>
        <button class="admin-delete small" type="button" data-admin-delete-message-item="${escapeHtml(item.id)}">Slet</button>
      </div>
      <div class="admin-message-meta">${escapeHtml(adminMessageMeta(item))}</div>
      <p class="admin-message-body">${escapeHtml(item.body || '')}</p>
      ${item.parentBody ? `<p class="admin-parent-excerpt"><strong>Svar på:</strong><br>${escapeHtml(item.parentBody)}</p>` : ''}
    </article>
  `).join('');
}

function renderAdminReportViewer() {
  if (!adminReportViewer) return;
  const isAdmin = Boolean(state.me?.isAdmin);
  adminReportViewer.classList.toggle('hidden', !isAdmin);
  if (!isAdmin) return;

  const count = $('#adminReportCount');
  const openCount = state.adminReports.filter((report) => report.status !== 'resolved').length;
  if (count) count.textContent = `${state.adminReports.length} rapport${state.adminReports.length === 1 ? '' : 'er'} · ${openCount} åbne`;
  if (!adminReportsList) return;

  if (!state.adminReports.length) {
    adminReportsList.innerHTML = '<div class="empty">Ingen rapporter matcher filteret.</div>';
    return;
  }

  adminReportsList.innerHTML = state.adminReports.map((report) => {
    const target = report.target || {};
    const reporter = report.reporter?.name || 'Ukendt';
    const targetAuthor = target.author?.name || target.toUser?.name || 'Ukendt';
    const isResolved = report.status === 'resolved';
    const evidenceNote = target.snapshotSaved
      ? ` · gemt ved rapport${target.originalExists ? '' : ' · original slettet'}`
      : '';
    return `
      <article class="admin-report-item ${isResolved ? 'resolved' : ''}">
        <div class="admin-message-topline">
          <span class="admin-message-label">${escapeHtml(target.label || reportTypeLabel(report.type))}</span>
          <span>${escapeHtml(formatExactDate(report.createdAt))} · ${escapeHtml(report.statusLabel || report.status || 'åben')}${escapeHtml(evidenceNote)}</span>
        </div>
        <div class="admin-message-main admin-report-titleline">
          <strong>Rapporteret af ${escapeHtml(reporter)} · mål: ${escapeHtml(targetAuthor)}</strong>
          <div class="admin-report-actions">
            ${isResolved ? `<button class="secondary tiny" type="button" data-admin-reopen-report="${escapeHtml(report.id)}">Genåbn</button>` : `<button class="secondary tiny" type="button" data-admin-resolve-report="${escapeHtml(report.id)}">Markér løst</button>`}
            <button class="ghost danger tiny" type="button" data-admin-delete-report-target="${escapeHtml(report.id)}" ${target.exists ? '' : 'disabled'}>${report.type === 'user' ? 'Ban bruger' : 'Slet mål'}</button>
          </div>
        </div>
        <div class="admin-report-grid">
          <p class="admin-message-body"><strong>Grund:</strong><br>${escapeHtml(report.reason || '')}</p>
          <p class="admin-parent-excerpt"><strong>Rapporteret indhold:</strong><br>${escapeHtml(target.body || '')}</p>
        </div>
        ${target.parentBody ? `<p class="admin-parent-excerpt">Svar på: ${escapeHtml(target.parentBody)}</p>` : ''}
        ${target.contextBody ? `<p class="admin-parent-excerpt"><strong>Rapporteret privat besked:</strong><br>${escapeHtml(target.contextBody)}</p>` : ''}
      </article>
    `;
  }).join('');
}

async function loadAdminStats() {
  if (!state.me?.isAdmin || !adminStatsGrid) return;
  const data = await api('/api/admin/stats');
  state.adminStats = data.stats || null;
  renderAdminStats();
}

async function loadAdminReports() {
  if (!state.me?.isAdmin || !adminReportsList) return;
  const status = $('#adminReportStatus')?.value || 'open';
  const type = $('#adminReportType')?.value || 'all';
  const q = $('#adminReportSearch')?.value || '';
  const data = await api(`/api/admin/reports?status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
  state.adminReports = data.reports || [];
  if (data.stats) state.adminStats = data.stats;
  renderAdminStats();
  renderAdminReportViewer();
}

async function loadAdminUsers() {
  if (!state.me?.isAdmin || !adminUsersList) return;
  const q = $('#adminUserSearch')?.value || '';
  const status = $('#adminUserStatus')?.value || 'all';
  const data = await api(`/api/admin/users?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
  state.adminUsers = data.users || [];
  if (data.stats) state.adminStats = data.stats;
  renderAdminStats();
  renderAdminUsers();
}

async function loadAdminDashboard() {
  if (!state.me?.isAdmin) return;
  await Promise.all([loadAdminUsers(), loadAdminReports(), loadAdminStats()]);
}

async function loadAdminMessages(options = {}) {
  if (!state.me?.isAdmin || !adminMessagesList) return;
  const append = Boolean(options.append);
  const type = $('#adminMessageType')?.value || 'all';
  const q = $('#adminMessageSearch')?.value || '';
  const limit = 60;
  const offset = append ? Number(state.adminMessagesNextOffset || state.adminMessages.length || 0) : 0;
  const button = append ? loadMoreAdminMessagesBtn : loadAdminMessagesBtn;

  if (button) button.disabled = true;
  if (!append) {
    state.adminMessages = [];
    state.adminMessagesTotalCount = 0;
    state.adminMessagesNextOffset = 0;
    state.adminMessagesHasMore = false;
    state.adminPrivateMessagesCount = 0;
    renderAdminMessageViewer();
  }

  try {
    const data = await api(`/api/admin/messages?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
    const incoming = data.items || [];

    if (append) {
      const existingIds = new Set(state.adminMessages.map((item) => item.id));
      state.adminMessages = [
        ...state.adminMessages,
        ...incoming.filter((item) => !existingIds.has(item.id))
      ];
    } else {
      state.adminMessages = incoming;
      adminMessagesList.scrollTop = 0;
    }

    state.adminMessagesTotalCount = Number(data.totalCount || state.adminMessages.length);
    state.adminPrivateMessagesCount = Number(data.privateMessagesCount || 0);
    state.adminMessagesNextOffset = Number(data.nextOffset || state.adminMessages.length);
    state.adminMessagesHasMore = Boolean(data.hasMore);
    renderAdminMessageViewer();
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteAdminMessageItem(item) {
  if (item.kind === 'global-message') {
    await api(`/api/global/messages/${item.messageId}`, { method: 'DELETE' });
    return;
  }
  if (item.kind === 'global-comment') {
    await api(`/api/global/messages/${item.messageId}/comments/${item.commentId}`, { method: 'DELETE' });
    return;
  }
  if (item.kind === 'direct-message') {
    await api(`/api/messages/${item.messageId}`, { method: 'DELETE' });
    return;
  }
  throw new Error('Beskedtypen understøttes ikke.');
}

async function loadUsers(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const data = await api(`/api/users${query}`);
  state.users = dedupeUsers(data.users || []);

  if (state.activeChatUser) {
    const updated = state.users.find((candidate) => candidate.id === state.activeChatUser.id);
    if (updated) state.activeChatUser = updated;
  }

  renderUsers();
  renderChat();
}

async function loadGlobalMessages() {
  const data = await api('/api/global/messages');
  state.globalMessages = data.messages || [];
  state.globalNewMessageCount = 0;
  state.globalChatNeedsBottomScroll = true;
  renderGlobalMessages({ forceBottom: true });
  updateGlobalNewMessagesButton();
}

async function loadEverything() {
  await Promise.all([loadGlobalMessages(), loadUsers($('#userSearch').value)]);
  if (state.me?.isAdmin) {
    await loadAdminDashboard();
    renderAdminMessageViewer();
    renderAdminReportViewer();
  }
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();

  state.socket = io({ auth: { token: state.token } });

  state.socket.on('connect', () => {
    loadUsers($('#userSearch').value).catch(() => {});
  });

  state.socket.on('presence', ({ userId, online }) => {
    const user = state.users.find((candidate) => candidate.id === userId);
    if (user) user.online = online;

    if (state.activeChatUser?.id === userId) {
      state.activeChatUser.online = online;
      renderChat();
    }

    if (state.me?.isAdmin) {
      const adminUser = state.adminUsers.find((candidate) => candidate.id === userId);
      if (adminUser) {
        adminUser.online = online;
        renderAdminUsers();
      }
    }

    renderUsers();
  });

  state.socket.on('global-message', (message) => {
    handleIncomingGlobalMessage(message);
    queueAdminMessagesRefresh();
    if (state.me?.isAdmin && state.adminReports.length) loadAdminReports().catch(() => {});
  });

  state.socket.on('global-message-updated', (message) => {
    handleIncomingGlobalMessage(message);
    queueAdminMessagesRefresh();
    if (state.me?.isAdmin && state.adminReports.length) loadAdminReports().catch(() => {});
  });

  state.socket.on('global-message-deleted', ({ messageId }) => {
    if (messageId === '__reload__') {
      loadEverything().catch(() => {});
      return;
    }
    const before = state.globalMessages.length;
    state.globalMessages = state.globalMessages.filter((message) => message.id !== messageId);
    if (state.globalMessages.length !== before) renderGlobalMessages();
    queueAdminMessagesRefresh();
    if (state.me?.isAdmin && state.adminReports.length) loadAdminReports().catch(() => {});
  });

  state.socket.on('private-message', (message) => {
    queueAdminMessagesRefresh();
    if (state.me?.isAdmin && state.adminReports.length) loadAdminReports().catch(() => {});
    const activeId = state.activeChatUser?.id;
    const isActiveConversation =
      activeId &&
      ((message.from === state.me.id && message.to === activeId) ||
       (message.from === activeId && message.to === state.me.id));

    if (isActiveConversation) {
      const exists = state.activeMessages.some((candidate) => candidate.id === message.id);
      if (!exists) state.activeMessages.push(message);
      renderChat({ forceBottom: message.from === state.me?.id });
      if (message.to === state.me.id) markConversationRead(message.from).catch(() => {});
    } else if (message.to === state.me.id) {
      const sender = state.users.find((user) => user.id === message.from);
      if (!incrementUnreadForUser(message.from)) {
        loadUsers($('#userSearch').value).catch(() => {});
      } else {
        renderUsers();
      }
      showToast(`Ny privat besked fra ${sender?.name || 'en person'}`);
    }
  });

  state.socket.on('messages-read', ({ userId, unreadCount, conversationId, readByUserId, readMessageIds }) => {
    setUnreadForUser(userId, unreadCount || 0);
    const changed = markMessagesReadLocally({ conversationId, readByUserId, readMessageIds });
    renderUsers();
    if (changed) renderChat();
  });

  state.socket.on('message-deleted', ({ messageId }) => {
    const before = state.activeMessages.length;
    state.activeMessages = state.activeMessages.filter((message) => message.id !== messageId);
    if (state.activeMessages.length !== before) renderChat();
    loadUsers($('#userSearch').value).catch(() => {});
    queueAdminMessagesRefresh();
    if (state.me?.isAdmin && state.adminReports.length) loadAdminReports().catch(() => {});
  });

  state.socket.on('conversation-deleted', ({ userId }) => {
    if (state.activeChatUser?.id === userId) {
      state.activeMessages = [];
      state.chatDrafts[userId] = '';
      state.activeChatUser = null;
      chatPanel.classList.add('hidden');
    }
    setUnreadForUser(userId, 0);
    renderUsers();
  });

  let typingTimer = null;
  state.socket.on('typing', ({ from }) => {
    if (!state.activeChatUser || from !== state.activeChatUser.id) return;
    $('#typingLabel').classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => $('#typingLabel').classList.add('hidden'), 1200);
  });

  state.socket.on('force-logout', ({ reason }) => {
    forceLocalLogout(reason || 'Du er blevet logget ud af en admin.');
  });

  state.socket.on('profile-updated', ({ user }) => {
    mergeUpdatedPublicUser(user);
    rerenderAfterProfileUpdate();
    if (user?.id === state.me?.id && user.muted) {
      showToast(user.mutedUntil ? `Du er muted indtil ${formatExactDate(user.mutedUntil)}.` : 'Du er muted.');
    }
  });


  state.socket.on('connect_error', (error) => {
    const message = error?.message || 'Chatforbindelsen fejlede. Log ind igen.';
    if (message.toLowerCase().includes('banned') || message.toLowerCase().includes('expired')) {
      forceLocalLogout(message);
      return;
    }
    showToast('Chatforbindelsen fejlede. Log ind igen.');
  });
}

async function initApp() {
  try {
    const meData = await api('/api/me');
    state.me = meData.user;
    renderMe();
    showApp();
    connectSocket();
  } catch (error) {
    setToken(null);
    showAuth();
    throw new Error(error?.message || 'Login fejlede. Prøv igen.');
  }

  try {
    await loadEverything();
  } catch (error) {
    console.error('TSN blev indlæst, men noget appdata kunne ikke indlæses:', error);
    showToast(error?.message ? `Logget ind. Noget data kunne ikke indlæses: ${error.message}` : 'Logget ind. Noget data kunne ikke indlæses.');
  }
}


setInterval(() => {
  if (state.me && state.activeChatUser && state.activeMessages.some((message) => message.from === state.me.id)) {
    renderChat();
  }
}, 30000);

if (state.token) {
  initApp().catch((error) => {
    authError.textContent = error.message;
  });
} else {
  showAuth();
}
