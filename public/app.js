const state = {
  token: localStorage.getItem('tsn_token'),
  me: null,
  users: [],
  posts: [],
  socket: null,
  activeChatUser: null,
  activeMessages: [],
  rooms: [],
  activeRoom: null,
  roomMessages: [],
  chatDrafts: {},
  commentDrafts: {},
  roomSettingDrafts: {},
  adminUsers: []
};

const $ = (selector) => document.querySelector(selector);
const authScreen = $('#authScreen');
const appScreen = $('#appScreen');
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const authError = $('#authError');
const postsList = $('#postsList');
const usersList = $('#usersList');
const chatPanel = $('#chatPanel');
const messagesList = $('#messagesList');
const toast = $('#toast');
const roomsList = $('#roomsList');
const roomPanel = $('#roomPanel');
const roomMessagesList = $('#roomMessagesList');
const adminUsersList = $('#adminUsersList');

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

function canDeleteOwnOrAdmin(authorId) {
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 2400);
}

function forceLocalLogout(message = 'You have been logged out.') {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  setToken(null);
  state.me = null;
  state.users = [];
  state.posts = [];
  state.activeChatUser = null;
  state.activeMessages = [];
  state.rooms = [];
  state.activeRoom = null;
  state.roomMessages = [];
  state.adminUsers = [];
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
    if (data.logout) {
      forceLocalLogout(data.error || 'Your session ended.');
    }
    throw new Error(data.error || 'Something went wrong.');
  }

  return data;
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

async function finishAuth(data, message = 'Logged in') {
  setToken(data.token);
  await initApp();
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
        email: form.get('email'),
        password: form.get('password')
      })
    });
    await finishAuth(data, 'Account created and logged in');
  } catch (error) {
    authError.textContent = error.message;
  }
});

const guestLoginBtn = document.querySelector('#guestLoginBtn');
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

$('#logoutBtn').addEventListener('click', () => {
  forceLocalLogout('Logged out');
});

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
      renderPosts();
      renderRoomPanel();
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

$('#postInput').addEventListener('input', () => {
  $('#postCounter').textContent = `${$('#postInput').value.length}/600`;
});

$('#postBtn').addEventListener('click', async () => {
  const body = $('#postInput').value.trim();
  if (!body) return;

  try {
    const data = await api('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    $('#postInput').value = '';
    $('#postCounter').textContent = '0/600';
    upsertPost(data.post);
    renderPosts();
  } catch (error) {
    showToast(error.message);
  }
});

postsList.addEventListener('click', async (event) => {
  const deletePostButton = event.target.closest('[data-delete-post]');
  if (deletePostButton) {
    if (!confirm('Delete this post?')) return;
    try {
      const postId = deletePostButton.dataset.deletePost;
      await api(`/api/posts/${postId}`, { method: 'DELETE' });
      state.posts = state.posts.filter((post) => post.id !== postId);
      renderPosts();
      showToast('Post deleted');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const deleteCommentButton = event.target.closest('[data-delete-comment]');
  if (deleteCommentButton) {
    if (!confirm('Delete this comment?')) return;
    try {
      const postId = deleteCommentButton.dataset.postId;
      const commentId = deleteCommentButton.dataset.deleteComment;
      const data = await api(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
      upsertPost(data.post);
      renderPosts();
      showToast('Comment deleted');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const likeButton = event.target.closest('[data-like]');
  if (!likeButton) return;

  try {
    const data = await api(`/api/posts/${likeButton.dataset.like}/like`, { method: 'POST' });
    upsertPost(data.post);
    renderPosts();
  } catch (error) {
    showToast(error.message);
  }
});

postsList.addEventListener('input', (event) => {
  const form = event.target.closest('[data-comment-form]');
  if (!form) return;
  state.commentDrafts[form.dataset.commentForm] = event.target.value;
});

postsList.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-comment-form]');
  if (!form) return;
  event.preventDefault();

  const input = form.querySelector('input');
  const body = input.value.trim();
  if (!body) return;

  try {
    const postId = form.dataset.commentForm;
    const data = await api(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    input.value = '';
    state.commentDrafts[postId] = '';
    upsertPost(data.post);
    renderPosts();
  } catch (error) {
    showToast(error.message);
  }
});

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

  if (state.socket) {
    state.socket.emit('typing', { to: state.activeChatUser.id });
  }
});

$('#messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#messageInput');
  const text = input.value.trim();
  if (!text || !state.socket || !state.activeChatUser) return;

  const to = state.activeChatUser.id;
  state.chatDrafts[to] = input.value;

  state.socket.emit('private-message', {
    to,
    text
  }, (response) => {
    if (!response?.ok) {
      showToast(response?.error || 'Could not send message.');
      return;
    }

    if (state.activeChatUser?.id === to) {
      input.value = '';
    }
    state.chatDrafts[to] = '';
  });
});

if (roomsList) {
  roomsList.addEventListener('click', async (event) => {
    const openButton = event.target.closest('[data-room-open]');
    const claimButton = event.target.closest('[data-room-claim]');
    const releaseButton = event.target.closest('[data-room-release]');

    if (openButton) {
      openRoom(Number(openButton.dataset.roomOpen));
      return;
    }

    if (claimButton) {
      const roomId = Number(claimButton.dataset.roomClaim);
      try {
        const data = await api(`/api/rooms/${roomId}/claim`, { method: 'POST' });
        state.rooms = data.rooms;
        state.activeRoom = data.room;
        renderRooms();
        renderRoomPanel();
        await openRoom(roomId);
        showToast(`Room ${roomId} claimed`);
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    if (releaseButton) {
      const roomId = Number(releaseButton.dataset.roomRelease);
      if (!confirm('Release this room? This resets its custom name and removes its password.')) return;
      try {
        const data = await api(`/api/rooms/${roomId}/release`, { method: 'POST' });
        state.rooms = data.rooms;
        if (state.activeRoom?.id === roomId) {
          state.activeRoom = data.room;
          state.roomMessages = [];
        }
        renderRooms();
        renderRoomPanel();
        showToast(`Room ${roomId} released`);
      } catch (error) {
        showToast(error.message);
      }
    }
  });
}

const closeRoomBtn = $('#closeRoomBtn');
if (closeRoomBtn) {
  closeRoomBtn.addEventListener('click', () => {
    state.activeRoom = null;
    state.roomMessages = [];
    roomPanel.classList.add('hidden');
    renderRooms();
  });
}

const roomSettingsForm = $('#roomSettingsForm');
if (roomSettingsForm) {
  roomSettingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activeRoom?.canManage) return;

    const nameInput = $('#roomNameInput');
    const passwordInput = $('#roomPasswordInput');
    const body = { name: nameInput.value.trim() };
    if (passwordInput.value.trim()) body.password = passwordInput.value.trim();

    try {
      const data = await api(`/api/rooms/${state.activeRoom.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      state.rooms = data.rooms;
      state.activeRoom = data.room;
      passwordInput.value = '';
      renderRooms();
      renderRoomPanel();
      showToast('Room settings saved');
    } catch (error) {
      showToast(error.message);
    }
  });
}

const clearRoomPasswordBtn = $('#clearRoomPasswordBtn');
if (clearRoomPasswordBtn) {
  clearRoomPasswordBtn.addEventListener('click', async () => {
    if (!state.activeRoom?.canManage) return;
    if (!confirm('Remove this room password? Everyone will be able to enter the room.')) return;

    try {
      const data = await api(`/api/rooms/${state.activeRoom.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ clearPassword: true })
      });
      state.rooms = data.rooms;
      state.activeRoom = data.room;
      state.roomMessages = [];
      renderRooms();
      renderRoomPanel();
      showToast('Room password removed');
      await openRoom(state.activeRoom.id);
    } catch (error) {
      showToast(error.message);
    }
  });
}

const unlockRoomBtn = $('#unlockRoomBtn');
if (unlockRoomBtn) {
  unlockRoomBtn.addEventListener('click', async () => {
    if (!state.activeRoom) return;
    await unlockRoom(state.activeRoom);
  });
}

const roomMessageInput = $('#roomMessageInput');
if (roomMessageInput) {
  roomMessageInput.addEventListener('input', () => {
    $('#roomMessageCounter').textContent = `${roomMessageInput.value.length}/600`;
  });
}

const roomMessageBtn = $('#roomMessageBtn');
if (roomMessageBtn) {
  roomMessageBtn.addEventListener('click', async () => {
    if (!state.activeRoom) return;
    const input = $('#roomMessageInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      const data = await api(`/api/rooms/${state.activeRoom.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      input.value = '';
      $('#roomMessageCounter').textContent = '0/600';

      if (!state.roomMessages.some((message) => message.id === data.message.id)) {
        state.roomMessages.push(data.message);
      }
      renderRoomPanel();
      showToast(`Sent to Room ${state.activeRoom.id}`);
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (roomMessagesList) {
  roomMessagesList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-room-message]');
    if (!button || !state.activeRoom) return;
    if (!confirm('Delete this room message for everyone?')) return;

    try {
      const messageId = button.dataset.deleteRoomMessage;
      await api(`/api/rooms/${state.activeRoom.id}/messages/${messageId}`, { method: 'DELETE' });
      state.roomMessages = state.roomMessages.filter((message) => message.id !== messageId);
      renderRoomPanel();
      showToast('Room message deleted');
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (messagesList) {
  messagesList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-message]');
    if (!button) return;
    if (!confirm('Delete this chat message for everyone?')) return;

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


function renderRooms() {
  if (!roomsList) return;

  const claimedCount = state.rooms.filter((room) => room.claimed).length;
  const lockedCount = state.rooms.filter((room) => room.hasPassword).length;
  $('#roomProgress').textContent = `${claimedCount}/7 claimed · ${lockedCount} locked`;

  if (!state.rooms.length) {
    roomsList.innerHTML = '<div class="empty">Rooms are loading...</div>';
    return;
  }

  roomsList.innerHTML = state.rooms.map((room) => {
    const isActive = state.activeRoom?.id === room.id;
    const ownerLabel = room.owner ? `Claimed by ${escapeHtml(room.owner.name)} (@${escapeHtml(room.owner.username)})` : 'Unclaimed — be the first to claim it.';
    const canRelease = room.canManage;
    const lockLabel = room.hasPassword
      ? (room.canAccess ? 'Password protected · unlocked' : 'Password protected')
      : 'No password';

    return `
      <article class="room-card ${isActive ? 'active' : ''} ${room.claimed ? 'claimed' : 'unclaimed'} ${room.hasPassword ? 'locked-room-card' : ''}">
        <div class="room-number">${room.hasPassword && !room.canAccess ? '🔒' : `R${escapeHtml(room.id)}`}</div>
        <div class="room-main">
          <strong>${escapeHtml(room.name)}</strong>
          <span>${escapeHtml(room.tagline)}</span>
          <small>${ownerLabel}</small>
          <small>${escapeHtml(lockLabel)}</small>
        </div>
        <div class="room-actions">
          <button class="secondary" type="button" data-room-open="${escapeHtml(room.id)}">
            ${room.hasPassword && !room.canAccess ? 'Unlock' : (isActive ? 'Open' : 'Enter')}
          </button>
          ${room.claimed
            ? (canRelease ? `<button class="ghost" type="button" data-room-release="${escapeHtml(room.id)}">Release</button>` : '')
            : `<button class="primary" type="button" data-room-claim="${escapeHtml(room.id)}">Claim</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function canDeleteRoomMessage(message) {
  return Boolean(
    state.me &&
    (state.me.isAdmin || message.authorId === state.me.id || state.activeRoom?.ownerId === state.me.id)
  );
}

function renderRoomPanel() {
  if (!state.activeRoom || !roomPanel) return;

  const room = state.activeRoom;
  $('#activeRoomLabel').textContent = `Room ${room.id}`;
  $('#activeRoomName').textContent = room.name;
  $('#activeRoomTagline').textContent = room.owner
    ? `${room.tagline} Claimed by ${room.owner.name}. ${room.hasPassword ? 'This room has a password.' : 'This room has no password.'}`
    : `${room.tagline} This room is unclaimed.`;
  roomPanel.classList.remove('hidden');

  const roomSettingsForm = $('#roomSettingsForm');
  const roomLockedNotice = $('#roomLockedNotice');
  const roomComposer = roomPanel.querySelector('.room-composer');
  const roomPasswordInput = $('#roomPasswordInput');
  const roomNameInput = $('#roomNameInput');

  if (roomNameInput && roomNameInput.dataset.roomId !== String(room.id)) {
    roomNameInput.value = room.name;
    roomNameInput.dataset.roomId = String(room.id);
  }

  if (roomPasswordInput && roomPasswordInput.dataset.roomId !== String(room.id)) {
    roomPasswordInput.value = '';
    roomPasswordInput.dataset.roomId = String(room.id);
  }

  if (roomSettingsForm) roomSettingsForm.classList.toggle('hidden', !room.canManage);
  if ($('#clearRoomPasswordBtn')) $('#clearRoomPasswordBtn').disabled = !room.hasPassword;
  if (roomLockedNotice) roomLockedNotice.classList.toggle('hidden', room.canAccess);
  if (roomComposer) roomComposer.classList.toggle('hidden', !room.canAccess);
  if (roomMessagesList) roomMessagesList.classList.toggle('hidden', !room.canAccess);

  if (!room.canAccess) {
    roomMessagesList.innerHTML = '';
    return;
  }

  if (!state.roomMessages.length) {
    roomMessagesList.innerHTML = '<div class="empty">No messages in this room yet.</div>';
    return;
  }

  roomMessagesList.innerHTML = state.roomMessages.map((message) => `
    <article class="room-message">
      <div class="post-row-top">
        <div class="post-person">
          <div class="avatar">${escapeHtml(initials(message.author?.name || 'User'))}</div>
          <div>
            <strong>${escapeHtml(message.author?.name || 'Unknown')}</strong>
            <span>@${escapeHtml(message.author?.username || 'unknown')} · ${escapeHtml(formatTime(message.createdAt))}</span>
          </div>
        </div>
        ${canDeleteRoomMessage(message) ? `<button class="admin-delete" type="button" data-delete-room-message="${escapeHtml(message.id)}">Delete</button>` : ''}
      </div>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join('');
}

async function loadRooms() {
  if (!roomsList) return;
  const data = await api('/api/rooms');
  state.rooms = data.rooms;
  if (state.activeRoom) {
    const updated = state.rooms.find((candidate) => candidate.id === state.activeRoom.id);
    if (updated) {
      state.activeRoom = updated;
      if (!updated.canAccess) state.roomMessages = [];
    }
  }
  renderRooms();
  renderRoomPanel();
}

async function unlockRoom(room) {
  if (!room) return false;
  if (!room.hasPassword || room.canAccess) return true;

  const password = prompt(`Enter password for ${room.name}:`);
  if (password === null) return false;

  try {
    const data = await api(`/api/rooms/${room.id}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });

    const index = state.rooms.findIndex((candidate) => candidate.id === room.id);
    if (index >= 0) state.rooms[index] = data.room;
    state.activeRoom = data.room;
    renderRooms();
    renderRoomPanel();
    showToast('Room unlocked');
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function openRoom(roomId) {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return;

  state.activeRoom = room;
  state.roomMessages = [];
  renderRooms();
  renderRoomPanel();

  if (room.hasPassword && !room.canAccess) {
    const unlocked = await unlockRoom(room);
    if (!unlocked) return;
  }

  try {
    const data = await api(`/api/rooms/${roomId}/messages`);
    state.activeRoom = data.room;
    state.roomMessages = data.messages;
    renderRooms();
    renderRoomPanel();
    $('#roomMessageInput').focus();
  } catch (error) {
    if (error.locked) state.roomMessages = [];
    showToast(error.message);
    renderRoomPanel();
  }
}

function renderAdminTools() {
  const adminBox = $('#adminBox');
  const adminActive = $('#adminActive');
  const adminClaimForm = $('#adminClaimForm');
  const adminModerationPanel = $('#adminModerationPanel');
  if (!adminBox || !adminActive || !adminClaimForm) return;

  adminActive.classList.toggle('hidden', !state.me?.isAdmin);
  adminClaimForm.classList.toggle('hidden', Boolean(state.me?.isAdmin));
  if (adminModerationPanel) adminModerationPanel.classList.toggle('hidden', !state.me?.isAdmin);
  renderAdminUsers();
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

async function loadAdminUsers() {
  if (!state.me?.isAdmin || !adminUsersList) return;
  const data = await api('/api/admin/users');
  state.adminUsers = data.users || [];
  renderAdminUsers();
}

function renderMe() {
  if (!state.me) return;
  $('#myName').textContent = state.me.name;
  $('#myUsername').textContent = `@${state.me.username}`;
  $('#profileName').value = state.me.name;
  $('#profileBio').value = state.me.bio || '';
  $('#myAvatar').textContent = initials(state.me.name);
  $('#composerAvatar').textContent = initials(state.me.name);
  renderAdminTools();
}

function renderStats() {
  $('#postCount').textContent = state.posts.filter((post) => post.authorId === state.me?.id).length;
  $('#userCount').textContent = state.users.length;
  const online = state.users.filter((user) => user.online).length;
  $('#onlinePill').textContent = `${online} online`;
}

function renderPosts() {
  renderStats();

  if (!state.posts.length) {
    postsList.innerHTML = '<div class="empty">No posts yet. Write the first TSN post.</div>';
    return;
  }

  postsList.innerHTML = state.posts.map((post) => {
    const liked = post.likes?.includes(state.me.id);
    const authorName = post.author?.name || 'Unknown';
    const comments = post.comments || [];

    return `
      <article class="post card" data-post-id="${escapeHtml(post.id)}">
        <header class="post-header">
          <div class="post-person">
            <div class="avatar">${escapeHtml(initials(authorName))}</div>
            <div>
              <strong>${escapeHtml(authorName)}</strong>
              <span>@${escapeHtml(post.author?.username || 'unknown')}</span>
            </div>
          </div>
          <div class="post-meta-actions">
            <span class="post-time">${escapeHtml(formatTime(post.createdAt))}</span>
            ${canDeleteOwnOrAdmin(post.authorId) ? `<button class="admin-delete" type="button" data-delete-post="${escapeHtml(post.id)}">Delete</button>` : ''}
          </div>
        </header>

        <p class="post-body">${escapeHtml(post.body)}</p>

        <div class="post-actions">
          <button class="post-action ${liked ? 'active' : ''}" data-like="${escapeHtml(post.id)}">
            ${liked ? 'Liked' : 'Like'} · ${post.likes?.length || 0}
          </button>
          <span class="post-action">Comments · ${comments.length}</span>
        </div>

        <div class="comments">
          ${comments.map((comment) => `
            <div class="comment">
              <div class="avatar">${escapeHtml(initials(comment.author?.name || 'User'))}</div>
              <div class="comment-content">
                <div class="comment-head">
                  <strong>${escapeHtml(comment.author?.name || 'Unknown')}</strong>
                  ${canDeleteOwnOrAdmin(comment.authorId) ? `<button class="admin-delete small" type="button" data-post-id="${escapeHtml(post.id)}" data-delete-comment="${escapeHtml(comment.id)}">Delete</button>` : ''}
                </div>
                <p>${escapeHtml(comment.body)}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <form class="comment-form" data-comment-form="${escapeHtml(post.id)}">
          <input placeholder="Write a comment..." maxlength="240" value="${escapeHtml(state.commentDrafts[post.id] || '')}" />
          <button class="secondary" type="submit">Send</button>
        </form>
      </article>
    `;
  }).join('');
}

function renderUsers() {
  renderStats();

  if (!state.users.length) {
    usersList.innerHTML = '<div class="empty">No other users yet. Create another account in a different browser to test chat.</div>';
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
        ${Number(user.unreadCount) > 0 ? `<span class="unread-badge" aria-label="${escapeHtml(user.unreadCount)} unread direct messages">${escapeHtml(unreadBadgeText(user.unreadCount))}</span>` : ''}
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

function renderChat() {
  const user = state.activeChatUser;
  if (!user) return;

  $('#chatAvatar').textContent = initials(user.name);
  $('#chatName').textContent = user.name;
  $('#chatStatus').textContent = user.online ? 'Online now' : 'Offline';
  const chatBio = $('#chatBio');
  if (chatBio) chatBio.textContent = String(user.bio || '').trim() || 'No bio yet.';
  chatPanel.classList.remove('hidden');

  if (!state.activeMessages.length) {
    messagesList.innerHTML = '<div class="empty">No messages yet. Start the conversation.</div>';
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

  messagesList.scrollTop = messagesList.scrollHeight;
}

async function openChat(user) {
  state.activeChatUser = user;
  state.activeMessages = [];
  renderUsers();
  renderChat();

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
    renderChat();
    $('#messageInput').focus();
  } catch (error) {
    showToast(error.message);
  }
}

function upsertPost(post) {
  const index = state.posts.findIndex((candidate) => candidate.id === post.id);
  if (index >= 0) state.posts[index] = post;
  else state.posts.unshift(post);
  state.posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function loadUsers(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const data = await api(`/api/users${query}`);
  state.users = data.users;

  if (state.activeChatUser) {
    const updated = state.users.find((candidate) => candidate.id === state.activeChatUser.id);
    if (updated) state.activeChatUser = updated;
  }

  renderUsers();
  renderChat();
}

async function loadPosts() {
  const data = await api('/api/posts');
  state.posts = data.posts;
  renderPosts();
}

async function loadEverything() {
  await Promise.all([loadPosts(), loadUsers($('#userSearch').value), loadRooms()]);
  if (state.me?.isAdmin) await loadAdminUsers();
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();

  state.socket = io({
    auth: { token: state.token }
  });

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

  state.socket.on('post-created', (post) => {
    upsertPost(post);
    renderPosts();
  });

  state.socket.on('post-updated', (post) => {
    upsertPost(post);
    renderPosts();
  });

  state.socket.on('post-deleted', ({ postId }) => {
    state.posts = state.posts.filter((post) => post.id !== postId);
    renderPosts();
  });

  state.socket.on('private-message', (message) => {
    const activeId = state.activeChatUser?.id;
    const isActiveConversation =
      activeId &&
      ((message.from === state.me.id && message.to === activeId) ||
       (message.from === activeId && message.to === state.me.id));

    if (isActiveConversation) {
      const exists = state.activeMessages.some((candidate) => candidate.id === message.id);
      if (!exists) state.activeMessages.push(message);
      renderChat();
      if (message.to === state.me.id) {
        markConversationRead(message.from).catch(() => {});
      }
    } else if (message.to === state.me.id) {
      const sender = state.users.find((user) => user.id === message.from);
      if (!incrementUnreadForUser(message.from)) {
        loadUsers($('#userSearch').value).catch(() => {});
      } else {
        renderUsers();
      }
      showToast(`New message from ${sender?.name || 'someone'}`);
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
  });

  state.socket.on('room-updated', (room) => {
    const index = state.rooms.findIndex((candidate) => candidate.id === room.id);
    if (index >= 0) state.rooms[index] = room;
    else state.rooms.push(room);

    if (state.activeRoom?.id === room.id) {
      state.activeRoom = room;
      if (!room.canAccess) state.roomMessages = [];
      renderRoomPanel();
    }

    renderRooms();
  });

  state.socket.on('room-message', (message) => {
    if (state.activeRoom?.id === message.roomId) {
      const exists = state.roomMessages.some((candidate) => candidate.id === message.id);
      if (!exists) state.roomMessages.push(message);
      state.roomMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      renderRoomPanel();
    } else {
      const room = state.rooms.find((candidate) => candidate.id === message.roomId);
      showToast(`New message in ${room?.name || `Room ${message.roomId}`}`);
    }
  });

  state.socket.on('room-message-deleted', ({ roomId, messageId }) => {
    if (state.activeRoom?.id !== roomId) return;
    const before = state.roomMessages.length;
    state.roomMessages = state.roomMessages.filter((message) => message.id !== messageId);
    if (state.roomMessages.length !== before) renderRoomPanel();
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
    await loadEverything();
    connectSocket();
  } catch {
    setToken(null);
    showAuth();
  }
}

if (state.token) {
  initApp();
} else {
  showAuth();
}
