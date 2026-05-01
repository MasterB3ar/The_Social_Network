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
  adminMessages: []
};

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
const toast = $('#toast');
const adminUsersList = $('#adminUsersList');
const adminMessageViewer = $('#adminMessageViewer');
const adminMessagesList = $('#adminMessagesList');

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

function formatTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function canDeleteMessage(authorId) {
  return Boolean(state.me && (state.me.isAdmin || authorId === state.me.id));
}

function unreadBadgeText(count) {
  const number = Number(count) || 0;
  if (number <= 0) return '';
  return number > 99 ? '99+' : String(number);
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
}

function forceLocalLogout(message = 'You have been logged out.') {
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
  renderAdminMessageViewer();
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
    if (data.logout) forceLocalLogout(data.error || 'Your session ended.');
    const error = new Error(data.error || 'Something went wrong.');
    Object.assign(error, data);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function finishAuth(data, message = 'Logged in') {
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
    await finishAuth(data, 'Logged in');
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
    await finishAuth(data, 'Account created and logged in');
  } catch (error) {
    authError.textContent = error.message;
  }
});

const guestLoginBtn = $('#guestLoginBtn');
if (guestLoginBtn) {
  guestLoginBtn.addEventListener('click', async () => {
    authError.textContent = '';
    try {
      guestLoginBtn.disabled = true;
      const data = await api('/api/auth/guest', { method: 'POST' });
      await finishAuth(data, 'Guest account created');
    } catch (error) {
      authError.textContent = error.message;
    } finally {
      guestLoginBtn.disabled = false;
    }
  });
}

document.querySelectorAll('[data-demo-login]').forEach((button) => {
  button.addEventListener('click', async () => {
    authError.textContent = '';
    try {
      button.disabled = true;
      const data = await api('/api/auth/demo', {
        method: 'POST',
        body: JSON.stringify({ username: button.dataset.demoLogin })
      });
      await finishAuth(data, 'Logged in as ' + button.textContent.trim());
    } catch (error) {
      authError.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});

$('#logoutBtn').addEventListener('click', () => forceLocalLogout('Logged out'));

$('#refreshBtn').addEventListener('click', async () => {
  await loadEverything();
  showToast('TSN refreshed');
});

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
    showToast('Profile saved');
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
      await loadAdminUsers();
      await loadAdminMessages();
      renderGlobalMessages();
      renderChat();
      showToast('Admin rights enabled');
    } catch (error) {
      showToast(error.message);
    }
  });
}

const refreshAdminUsersBtn = $('#refreshAdminUsersBtn');
if (refreshAdminUsersBtn) {
  refreshAdminUsersBtn.addEventListener('click', () => loadAdminUsers().catch((error) => showToast(error.message)));
}

const createBackupBtn = $('#createBackupBtn');
if (createBackupBtn) {
  createBackupBtn.addEventListener('click', async () => {
    const backupStatus = $('#backupStatus');
    createBackupBtn.disabled = true;
    if (backupStatus) backupStatus.textContent = 'Creating backup...';

    try {
      const data = await api('/api/admin/backup', { method: 'POST' });
      if (backupStatus) backupStatus.textContent = `Backup created: ${data.backupFile}`;
      showToast('Database backup created');
    } catch (error) {
      if (backupStatus) backupStatus.textContent = 'Backup failed';
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
    if (!confirm(`Delete this ${item.label || 'message'} for everyone?`)) return;

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
      showToast('Message deleted');
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

    try {
      if (kickButton) {
        const userId = kickButton.dataset.adminKick;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        if (!confirm(`Kick ${user?.name || 'this user'} out of TSN now?`)) return;
        const data = await api(`/api/admin/users/${userId}/kick`, { method: 'POST' });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadUsers($('#userSearch').value);
        showToast('User kicked');
      }

      if (banButton) {
        const userId = banButton.dataset.adminBan;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const reason = prompt(`Ban ${user?.name || 'this user'}? Optional reason:`) || '';
        if (!confirm(`Ban ${user?.name || 'this user'} and force logout?`)) return;
        const data = await api(`/api/admin/users/${userId}/ban`, {
          method: 'POST',
          body: JSON.stringify({ reason })
        });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadUsers($('#userSearch').value);
        showToast('User banned');
      }

      if (unbanButton) {
        const userId = unbanButton.dataset.adminUnban;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        if (!confirm(`Unban ${user?.name || 'this user'}?`)) return;
        const data = await api(`/api/admin/users/${userId}/unban`, { method: 'POST' });
        upsertAdminUser(data.user);
        renderAdminUsers();
        await loadUsers($('#userSearch').value);
        showToast('User unbanned');
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
    if (!state.globalMessages.some((message) => message.id === data.message.id)) {
      state.globalMessages.push(data.message);
    }
    renderGlobalMessages({ forceBottom: true });
  } catch (error) {
    showToast(error.message);
  }
});

if (globalMessagesList) {
  globalMessagesList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-global-message]');
    if (!button) return;
    if (!confirm('Delete this global message for everyone?')) return;

    try {
      const messageId = button.dataset.deleteGlobalMessage;
      await api(`/api/global/messages/${messageId}`, { method: 'DELETE' });
      state.globalMessages = state.globalMessages.filter((message) => message.id !== messageId);
      renderGlobalMessages();
      showToast('Global message deleted');
    } catch (error) {
      showToast(error.message);
    }
  });
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

$('#messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#messageInput');
  const text = input.value.trim();
  if (!text || !state.socket || !state.activeChatUser) return;

  const to = state.activeChatUser.id;
  state.chatDrafts[to] = input.value;

  state.socket.emit('private-message', { to, text }, (response) => {
    if (!response?.ok) {
      showToast(response?.error || 'Could not send message.');
      return;
    }

    if (state.activeChatUser?.id === to) input.value = '';
    state.chatDrafts[to] = '';
  });
});

if (messagesList) {
  messagesList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-message]');
    if (!button) return;
    if (!confirm('Delete this private message for everyone?')) return;

    try {
      const messageId = button.dataset.deleteMessage;
      await api(`/api/messages/${messageId}`, { method: 'DELETE' });
      state.activeMessages = state.activeMessages.filter((message) => message.id !== messageId);
      renderChat();
      showToast('Message deleted');
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
  $('#globalStatus').textContent = `${state.globalMessages.length} message${state.globalMessages.length === 1 ? '' : 's'}`;
}

function renderMe() {
  if (!state.me) return;
  $('#myName').textContent = state.me.name;
  $('#myUsername').textContent = `@${state.me.username}`;
  $('#profileName').value = state.me.name;
  $('#profileBio').value = state.me.bio || '';
  $('#myAvatar').textContent = initials(state.me.name);
  renderAdminTools();
}

function renderGlobalMessages({ forceBottom = false } = {}) {
  renderStats();
  if (!globalMessagesList) return;
  const scrollSnapshot = getScrollSnapshot(globalMessagesList);

  if (!state.globalMessages.length) {
    globalMessagesList.innerHTML = '<div class="empty">No global messages yet. Write the first one.</div>';
    restoreMessageScroll(globalMessagesList, scrollSnapshot, { forceBottom });
    return;
  }

  globalMessagesList.innerHTML = state.globalMessages.map((message) => {
    const mine = message.authorId === state.me?.id;
    const authorName = message.author?.name || 'Unknown';
    return `
      <article class="global-message ${mine ? 'mine' : ''}">
        <div class="post-row-top">
          <div class="post-person">
            <div class="avatar">${escapeHtml(initials(authorName))}</div>
            <div>
              <strong>${escapeHtml(authorName)}</strong>
              <span>@${escapeHtml(message.author?.username || 'unknown')} · ${escapeHtml(formatTime(message.createdAt))}</span>
            </div>
          </div>
          ${canDeleteMessage(message.authorId) ? `<button class="admin-delete" type="button" data-delete-global-message="${escapeHtml(message.id)}">Delete</button>` : ''}
        </div>
        <p>${escapeHtml(message.text)}</p>
      </article>
    `;
  }).join('');

  restoreMessageScroll(globalMessagesList, scrollSnapshot, { forceBottom });
}

function renderUsers() {
  renderStats();

  if (!state.users.length) {
    usersList.innerHTML = '<div class="empty">No other users yet. Create another account in a different browser to test private chat.</div>';
    return;
  }

  usersList.innerHTML = state.users.map((user) => {
    const isActive = state.activeChatUser?.id === user.id;
    const bio = String(user.bio || '').trim() || 'No bio yet.';
    return `
      <button class="user-row ${isActive ? 'active' : ''} ${Number(user.unreadCount) > 0 ? 'has-unread' : ''}" data-user-id="${escapeHtml(user.id)}">
        <div class="avatar">${escapeHtml(initials(user.name))}</div>
        <div class="user-row-main">
          <strong>${escapeHtml(user.name)}</strong>
          <span>@${escapeHtml(user.username)}</span>
          <span class="user-bio">${escapeHtml(bio)}</span>
        </div>
        ${Number(user.unreadCount) > 0 ? `<span class="unread-badge" aria-label="${escapeHtml(user.unreadCount)} unread private messages">${escapeHtml(unreadBadgeText(user.unreadCount))}</span>` : ''}
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

function renderChat({ forceBottom = false } = {}) {
  const user = state.activeChatUser;
  if (!user) return;
  const scrollSnapshot = getScrollSnapshot(messagesList);

  $('#chatAvatar').textContent = initials(user.name);
  $('#chatName').textContent = user.name;
  $('#chatStatus').textContent = user.online ? 'Online now' : 'Offline';
  const chatBio = $('#chatBio');
  if (chatBio) chatBio.textContent = String(user.bio || '').trim() || 'No bio yet.';
  chatPanel.classList.remove('hidden');

  if (!state.activeMessages.length) {
    messagesList.innerHTML = '<div class="empty">No private messages yet. Start the conversation.</div>';
  } else {
    messagesList.innerHTML = state.activeMessages.map((message) => `
      <div class="message ${message.from === state.me.id ? 'mine' : ''}">
        <div class="message-content">
          <span>${escapeHtml(message.text)}</span>
          ${state.me?.isAdmin ? `<button class="message-delete" type="button" data-delete-message="${escapeHtml(message.id)}" aria-label="Delete message">×</button>` : ''}
        </div>
        <small>${escapeHtml(formatTime(message.createdAt))}</small>
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
  renderAdminUsers();
  renderAdminMessageViewer();
}

function upsertAdminUser(user) {
  if (!user) return;
  const index = state.adminUsers.findIndex((candidate) => candidate.id === user.id);
  if (index >= 0) state.adminUsers[index] = user;
  else state.adminUsers.push(user);
  state.adminUsers.sort((a, b) => Number(b.online) - Number(a.online) || Number(Boolean(b.banned)) - Number(Boolean(a.banned)) || a.name.localeCompare(b.name));
}

function renderAdminUsers() {
  if (!adminUsersList || !state.me?.isAdmin) return;

  if (!state.adminUsers.length) {
    adminUsersList.innerHTML = '<div class="empty small-empty">No accounts loaded yet.</div>';
    return;
  }

  adminUsersList.innerHTML = state.adminUsers.map((user) => {
    const isMe = user.id === state.me.id;
    const isProtectedAdmin = user.isAdmin && !isMe;
    const status = user.banned ? 'Banned' : user.online ? 'Online' : 'Offline';
    return `
      <article class="admin-user-row ${user.banned ? 'banned' : ''}">
        <div class="admin-user-main">
          <div class="avatar small-avatar">${escapeHtml(initials(user.name))}</div>
          <div>
            <strong>${escapeHtml(user.name)}${isMe ? ' (you)' : ''}</strong>
            <span>@${escapeHtml(user.username)} · ${escapeHtml(user.role)} · ${escapeHtml(status)}</span>
            ${user.banReason ? `<small>Reason: ${escapeHtml(user.banReason)}</small>` : ''}
          </div>
        </div>
        <div class="admin-user-actions">
          <button class="ghost tiny" type="button" data-admin-kick="${escapeHtml(user.id)}" ${isMe || user.banned ? 'disabled' : ''}>Kick</button>
          ${user.banned
            ? `<button class="secondary tiny" type="button" data-admin-unban="${escapeHtml(user.id)}">Unban</button>`
            : `<button class="ghost danger tiny" type="button" data-admin-ban="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin ? 'disabled' : ''}>Ban</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function adminMessageParticipants(item) {
  if (item.kind === 'direct-message') return `${item.fromUser?.name || 'Unknown'} → ${item.toUser?.name || 'Unknown'}`;
  if (item.kind === 'global-message') return `${item.author?.name || 'Unknown'} in Global chat`;
  return item.author?.name || 'Unknown';
}

function adminMessageMeta(item) {
  const parts = [item.source || item.label, formatTime(item.createdAt)];
  if (item.kind === 'direct-message') parts.push('private');
  if (item.kind === 'global-message') parts.push('global');
  return parts.filter(Boolean).join(' · ');
}

function renderAdminMessageViewer() {
  if (!adminMessageViewer) return;
  const isAdmin = Boolean(state.me?.isAdmin);
  adminMessageViewer.classList.toggle('hidden', !isAdmin);
  if (!isAdmin) return;

  const count = $('#adminMessageCount');
  if (count) count.textContent = `${state.adminMessages.length} message${state.adminMessages.length === 1 ? '' : 's'}`;
  if (!adminMessagesList) return;

  if (!state.adminMessages.length) {
    adminMessagesList.innerHTML = '<div class="empty">Click “Load messages” to review stored TSN messages.</div>';
    return;
  }

  adminMessagesList.innerHTML = state.adminMessages.map((item) => `
    <article class="admin-message-item ${escapeHtml(item.kind)}">
      <div class="admin-message-topline">
        <span class="admin-message-label">${escapeHtml(item.label)}</span>
        <span>${escapeHtml(adminMessageMeta(item))}</span>
      </div>
      <div class="admin-message-main">
        <strong>${escapeHtml(adminMessageParticipants(item))}</strong>
        <button class="admin-delete small" type="button" data-admin-delete-message-item="${escapeHtml(item.id)}">Delete</button>
      </div>
      <p class="admin-message-body">${escapeHtml(item.body || '')}</p>
    </article>
  `).join('');
}

async function loadAdminUsers() {
  if (!state.me?.isAdmin || !adminUsersList) return;
  const data = await api('/api/admin/users');
  state.adminUsers = data.users || [];
  renderAdminUsers();
}

async function loadAdminMessages() {
  if (!state.me?.isAdmin || !adminMessagesList) return;
  const type = $('#adminMessageType')?.value || 'all';
  const q = $('#adminMessageSearch')?.value || '';
  const data = await api(`/api/admin/messages?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
  state.adminMessages = data.items || [];
  renderAdminMessageViewer();
}

async function deleteAdminMessageItem(item) {
  if (item.kind === 'global-message') {
    await api(`/api/global/messages/${item.messageId}`, { method: 'DELETE' });
    return;
  }
  if (item.kind === 'direct-message') {
    await api(`/api/messages/${item.messageId}`, { method: 'DELETE' });
    return;
  }
  throw new Error('Unsupported message type.');
}

async function loadUsers(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const data = await api(`/api/users${query}`);
  state.users = data.users || [];

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
  renderGlobalMessages({ forceBottom: true });
}

async function loadEverything() {
  await Promise.all([loadGlobalMessages(), loadUsers($('#userSearch').value)]);
  if (state.me?.isAdmin) {
    await loadAdminUsers();
    renderAdminMessageViewer();
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
    if (!state.globalMessages.some((candidate) => candidate.id === message.id)) {
      state.globalMessages.push(message);
      state.globalMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    renderGlobalMessages({ forceBottom: message.authorId === state.me?.id });
    if (state.me?.isAdmin && state.adminMessages.length) loadAdminMessages().catch(() => {});
  });

  state.socket.on('global-message-deleted', ({ messageId }) => {
    const before = state.globalMessages.length;
    state.globalMessages = state.globalMessages.filter((message) => message.id !== messageId);
    if (state.globalMessages.length !== before) renderGlobalMessages();
    if (state.me?.isAdmin && state.adminMessages.length) loadAdminMessages().catch(() => {});
  });

  state.socket.on('private-message', (message) => {
    if (state.me?.isAdmin && state.adminMessages.length) loadAdminMessages().catch(() => {});
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
      showToast(`New private message from ${sender?.name || 'someone'}`);
    }
  });

  state.socket.on('messages-read', ({ userId, unreadCount }) => {
    setUnreadForUser(userId, unreadCount || 0);
    renderUsers();
  });

  state.socket.on('message-deleted', ({ messageId }) => {
    const before = state.activeMessages.length;
    state.activeMessages = state.activeMessages.filter((message) => message.id !== messageId);
    if (state.activeMessages.length !== before) renderChat();
    loadUsers($('#userSearch').value).catch(() => {});
    if (state.me?.isAdmin && state.adminMessages.length) loadAdminMessages().catch(() => {});
  });

  let typingTimer = null;
  state.socket.on('typing', ({ from }) => {
    if (!state.activeChatUser || from !== state.activeChatUser.id) return;
    $('#typingLabel').classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => $('#typingLabel').classList.add('hidden'), 1200);
  });

  state.socket.on('force-logout', ({ reason }) => {
    forceLocalLogout(reason || 'You have been logged out by an admin.');
  });

  state.socket.on('connect_error', (error) => {
    const message = error?.message || 'Chat connection failed. Log in again.';
    if (message.toLowerCase().includes('banned') || message.toLowerCase().includes('expired')) {
      forceLocalLogout(message);
      return;
    }
    showToast('Chat connection failed. Log in again.');
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
    throw new Error(error?.message || 'Login failed. Please try again.');
  }

  try {
    await loadEverything();
  } catch (error) {
    console.error('TSN loaded, but some app data failed to load:', error);
    showToast(error?.message ? `Logged in. Some data failed to load: ${error.message}` : 'Logged in. Some data failed to load.');
  }
}

if (state.token) {
  initApp().catch((error) => {
    authError.textContent = error.message;
  });
} else {
  showAuth();
}
