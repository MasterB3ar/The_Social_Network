const state = {
  token: localStorage.getItem('tsn_token'),
  me: null,
  users: [],
  posts: [],
  socket: null,
  activeChatUser: null,
  activeMessages: [],
  layers: [],
  activeLayer: null,
  layerPosts: []
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
const layersList = $('#layersList');
const layerRoom = $('#layerRoom');
const layerPostsList = $('#layerPostsList');

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

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 2400);
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
  if (state.socket) state.socket.disconnect();
  setToken(null);
  state.me = null;
  state.users = [];
  state.posts = [];
  showAuth();
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
  state.activeChatUser = null;
  state.activeMessages = [];
  chatPanel.classList.add('hidden');
  renderUsers();
});

$('#messageInput').addEventListener('input', () => {
  if (state.socket && state.activeChatUser) {
    state.socket.emit('typing', { to: state.activeChatUser.id });
  }
});

$('#messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#messageInput');
  const text = input.value.trim();
  if (!text || !state.socket || !state.activeChatUser) return;

  state.socket.emit('private-message', {
    to: state.activeChatUser.id,
    text
  }, (response) => {
    if (!response?.ok) showToast(response?.error || 'Could not send message.');
  });

  input.value = '';
});

if (layersList) {
  layersList.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-layer-unlock]');
    if (!form) return;
    event.preventDefault();

    const layerId = Number(form.dataset.layerUnlock);
    const input = form.querySelector('input');
    const password = input.value.trim();
    if (!password) return;

    try {
      const data = await api(`/api/layers/${layerId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      state.me = data.user;
      state.layers = data.layers;
      input.value = '';
      renderLayers();
      await openLayer(layerId);
      showToast(`Layer ${layerId} unlocked`);
    } catch (error) {
      showToast(error.message);
    }
  });

  layersList.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-layer-open]');
    if (!openButton) return;
    openLayer(Number(openButton.dataset.layerOpen));
  });
}

const closeLayerBtn = $('#closeLayerBtn');
if (closeLayerBtn) {
  closeLayerBtn.addEventListener('click', () => {
    state.activeLayer = null;
    state.layerPosts = [];
    layerRoom.classList.add('hidden');
    renderLayers();
  });
}

const layerPostInput = $('#layerPostInput');
if (layerPostInput) {
  layerPostInput.addEventListener('input', () => {
    $('#layerPostCounter').textContent = `${layerPostInput.value.length}/600`;
  });
}

const layerPostBtn = $('#layerPostBtn');
if (layerPostBtn) {
  layerPostBtn.addEventListener('click', async () => {
    if (!state.activeLayer) return;
    const input = $('#layerPostInput');
    const body = input.value.trim();
    if (!body) return;

    try {
      const data = await api(`/api/layers/${state.activeLayer.id}/posts`, {
        method: 'POST',
        body: JSON.stringify({ body })
      });
      input.value = '';
      $('#layerPostCounter').textContent = '0/600';
      state.layerPosts.unshift(data.post);
      renderLayerRoom();
      showToast(`Posted to Layer ${state.activeLayer.id}`);
    } catch (error) {
      showToast(error.message);
    }
  });
}


function renderLayers() {
  if (!layersList) return;

  const unlockedCount = state.layers.filter((layer) => layer.unlocked).length;
  $('#layerProgress').textContent = `${unlockedCount}/3 unlocked`;

  if (!state.layers.length) {
    layersList.innerHTML = '<div class="empty">Layers are loading...</div>';
    return;
  }

  layersList.innerHTML = state.layers.map((layer) => {
    const isActive = state.activeLayer?.id === layer.id;

    if (layer.unlocked) {
      return `
        <article class="layer-card unlocked ${isActive ? 'active' : ''}">
          <div class="layer-number">L${escapeHtml(layer.id)}</div>
          <div class="layer-main">
            <strong>${escapeHtml(layer.name)}</strong>
            <span>${escapeHtml(layer.tagline)}</span>
          </div>
          <button class="secondary" type="button" data-layer-open="${escapeHtml(layer.id)}">
            ${isActive ? 'Open' : 'Enter'}
          </button>
        </article>
      `;
    }

    if (!layer.available) {
      return `
        <article class="layer-card locked disabled">
          <div class="layer-number">L${escapeHtml(layer.id)}</div>
          <div class="layer-main">
            <strong>${escapeHtml(layer.name)}</strong>
            <span>Locked. Unlock Layer ${escapeHtml(layer.id - 1)} first.</span>
          </div>
          <button class="ghost" type="button" disabled>Locked</button>
        </article>
      `;
    }

    return `
      <article class="layer-card locked">
        <div class="layer-number">L${escapeHtml(layer.id)}</div>
        <div class="layer-main">
          <strong>${escapeHtml(layer.name)}</strong>
          <span>${escapeHtml(layer.tagline)}</span>
          <form class="layer-unlock-form" data-layer-unlock="${escapeHtml(layer.id)}">
            <input type="password" placeholder="Layer ${escapeHtml(layer.id)} password" autocomplete="off" />
            <button class="primary" type="submit">Unlock</button>
          </form>
        </div>
      </article>
    `;
  }).join('');
}

function renderLayerRoom() {
  if (!state.activeLayer || !layerRoom) return;

  $('#activeLayerLabel').textContent = `Layer ${state.activeLayer.id}`;
  $('#activeLayerName').textContent = state.activeLayer.name;
  $('#activeLayerTagline').textContent = state.activeLayer.tagline;
  layerRoom.classList.remove('hidden');

  if (!state.layerPosts.length) {
    layerPostsList.innerHTML = '<div class="empty">No posts inside this layer yet.</div>';
    return;
  }

  layerPostsList.innerHTML = state.layerPosts.map((post) => `
    <article class="layer-post">
      <div class="post-person">
        <div class="avatar">${escapeHtml(initials(post.author?.name || 'User'))}</div>
        <div>
          <strong>${escapeHtml(post.author?.name || 'Unknown')}</strong>
          <span>@${escapeHtml(post.author?.username || 'unknown')} · ${escapeHtml(formatTime(post.createdAt))}</span>
        </div>
      </div>
      <p>${escapeHtml(post.body)}</p>
    </article>
  `).join('');
}

async function loadLayers() {
  if (!layersList) return;
  const data = await api('/api/layers');
  state.layers = data.layers;
  renderLayers();
}

async function openLayer(layerId) {
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  if (!layer) return;
  if (!layer.unlocked) {
    showToast(`Unlock Layer ${layerId} first`);
    return;
  }

  state.activeLayer = layer;
  state.layerPosts = [];
  renderLayers();
  renderLayerRoom();

  try {
    const data = await api(`/api/layers/${layerId}/posts`);
    state.activeLayer = data.layer;
    state.layerPosts = data.posts;
    renderLayers();
    renderLayerRoom();
    $('#layerPostInput').focus();
  } catch (error) {
    showToast(error.message);
  }
}

function renderMe() {
  if (!state.me) return;
  $('#myName').textContent = state.me.name;
  $('#myUsername').textContent = `@${state.me.username}`;
  $('#profileName').value = state.me.name;
  $('#profileBio').value = state.me.bio || '';
  $('#myAvatar').textContent = initials(state.me.name);
  $('#composerAvatar').textContent = initials(state.me.name);
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
          <span class="post-time">${escapeHtml(formatTime(post.createdAt))}</span>
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
              <div>
                <strong>${escapeHtml(comment.author?.name || 'Unknown')}</strong>
                <p>${escapeHtml(comment.body)}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <form class="comment-form" data-comment-form="${escapeHtml(post.id)}">
          <input placeholder="Write a comment..." maxlength="240" />
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
    return `
      <button class="user-row ${isActive ? 'active' : ''}" data-user-id="${escapeHtml(user.id)}">
        <div class="avatar">${escapeHtml(initials(user.name))}</div>
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <span>@${escapeHtml(user.username)}</span>
        </div>
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
  chatPanel.classList.remove('hidden');

  if (!state.activeMessages.length) {
    messagesList.innerHTML = '<div class="empty">No messages yet. Start the conversation.</div>';
  } else {
    messagesList.innerHTML = state.activeMessages.map((message) => `
      <div class="message ${message.from === state.me.id ? 'mine' : ''}">
        <span>${escapeHtml(message.text)}</span>
        <small>${escapeHtml(formatTime(message.createdAt))}</small>
      </div>
    `).join('');
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
    if (latestUser) state.activeChatUser.online = latestUser.online;
    state.activeMessages = data.messages;
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
  await Promise.all([loadPosts(), loadUsers($('#userSearch').value), loadLayers()]);
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
    } else if (message.to === state.me.id) {
      const sender = state.users.find((user) => user.id === message.from);
      showToast(`New message from ${sender?.name || 'someone'}`);
    }
  });

  let typingTimer = null;
  state.socket.on('typing', ({ from }) => {
    if (!state.activeChatUser || from !== state.activeChatUser.id) return;
    $('#typingLabel').classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => $('#typingLabel').classList.add('hidden'), 1200);
  });

  state.socket.on('connect_error', () => {
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
