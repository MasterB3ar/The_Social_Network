// Defensive fallback for older/cached click-handler code paths.
var warnButton = null;

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
  friends: [],
  friendIncoming: [],
  friendOutgoing: [],
  notifications: [],
  unreadNotifications: 0,
  privateUnreadTotal: 0,
  globalMentionCount: 0,
  lastGlobalPingBy: '',
  globalNewMessageCount: 0,
  globalChatHasOpened: false,
  globalChatNeedsBottomScroll: false,
  privateChatNeedsBottomScroll: false,
  activePrivateConversationId: '',
  mediaLibrary: [],
  mediaSearchResults: [],
  mediaSearchWarnings: [],
  mediaSearchQuery: '',
  mediaSearchKind: 'all',
  mediaSearchLoading: false,
  mediaWebSearchEnabled: false,
  mediaWebProviders: [],
  selectedGlobalMediaId: '',
  selectedPrivateMediaId: '',
  call: null,
  ringtone: null,
  outgoingCallTimeout: null,
  incomingCallTimeout: null,
  recoveryRequests: [],
  adminRecoveryRequests: [],
  pendingRecoveryMerge: null,
  callConfig: null,
  callConfigLoading: null,
  callTimerInterval: null
};
state.home = null;
state.leaderboard = [];
state.events = [];
state.polls = [];


const PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS = 15 * 60 * 1000;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // Legacy limit for old uploaded image messages only. New messages use approved website media.

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
const friendsPanel = $('#friendsPanel');
const friendList = $('#friendList');
const friendIncomingList = $('#friendIncomingList');
const friendOutgoingList = $('#friendOutgoingList');
const notificationsPanel = $('#notificationsPanel');
const notificationsList = $('#notificationsList');
const notificationBadge = $('#notificationBadge');
const privateUnreadBadge = $('#privateUnreadBadge');
const globalMentionBadge = $('#globalMentionBadge');
const globalPingBanner = $('#globalPingBanner');
const homePanel = $('#homePanel');
const leaderboardList = $('#leaderboardList');
const activityFeedList = $('#activityFeedList');
const tsnsWidget = $('#tsnsWidget');
const homeEventBox = $('#homeEventBox');
const homePollBox = $('#homePollBox');
const eventsPanel = $('#eventsPanel');
const eventsList = $('#eventsList');
const pollsList = $('#pollsList');
const globalImagePreview = $('#globalImagePreview');
const privateImagePreview = $('#privateImagePreview');
const globalMediaPickerBtn = $('#globalMediaPickerBtn');
const privateMediaPickerBtn = $('#privateMediaPickerBtn');
const globalMediaPicker = $('#globalMediaPicker');
const privateMediaPicker = $('#privateMediaPicker');
const startVoiceCallBtn = $('#startVoiceCallBtn');
const startVideoCallBtn = $('#startVideoCallBtn');
const callOverlay = $('#callOverlay');
const callEyebrow = $('#callEyebrow');
const callTitle = $('#callTitle');
const callStatusText = $('#callStatusText');
const localVideo = $('#localVideo');
const remoteVideo = $('#remoteVideo');
const remoteAudioAvatar = $('#remoteAudioAvatar');
const remoteCallName = $('#remoteCallName');
const localAudioAvatar = $('#localAudioAvatar');
const callNetworkText = $('#callNetworkText');
const callTimerText = $('#callTimerText');
const callQualityText = $('#callQualityText');
const callTypeBadge = $('#callTypeBadge');
const callFullscreenBtn = $('#callFullscreenBtn');
const incomingCallActions = $('#incomingCallActions');
const activeCallActions = $('#activeCallActions');
const acceptCallBtn = $('#acceptCallBtn');
const declineCallBtn = $('#declineCallBtn');
const endCallBtn = $('#endCallBtn');
const muteCallBtn = $('#muteCallBtn');
const cameraCallBtn = $('#cameraCallBtn');
const closeCallBtn = $('#closeCallBtn');

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

function imageAttachmentHtml(attachment, extraClass = '') {
  if (!attachment || attachment.type !== 'image') return '';
  const src = attachment.url || attachment.dataUrl || attachment.thumbnailUrl;
  if (!src) return '';
  const name = attachment.name || 'Billede';
  const provider = attachment.provider || attachment.attribution || '';
  return `
    <figure class="message-image ${escapeHtml(extraClass)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer" />
      <figcaption>${escapeHtml(name)}${provider ? ` · ${escapeHtml(provider)}` : ''}</figcaption>
    </figure>
  `;
}

function messageBodyHtml(message) {
  const text = message?.text ? `<span>${renderTextWithMentions(message.text)}</span>` : '';
  const image = imageAttachmentHtml(message?.attachment);
  return `${text}${image}` || '<span></span>';
}

function directMessageBodyHtml(message) {
  const body = messageBodyHtml(message);
  const transferNote = String(message?.transferNote || '').trim();
  return `${body}${transferNote ? `<em class="message-transfer-note">${escapeHtml(transferNote)}</em>` : ''}`;
}

function joinedDaysLabel(user) {
  const days = Math.max(0, Number(user?.joinedDays) || 0);
  if (days === 0) return 'Medlem i dag';
  if (days === 1) return 'Medlem i 1 dag';
  return `Medlem i ${formatNumber(days)} dage`;
}

function badgeHtml(user) {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  if (!badges.length) return '';
  return `<div class="badge-row">${badges.slice(0, 5).map((badge) => `<span class="profile-badge" title="${escapeHtml(badge.title || badge.label)}">${escapeHtml(badge.label)}</span>`).join('')}</div>`;
}

function renderTextWithMentions(text) {
  return escapeHtml(text).replace(/(^|\s)@([a-zA-Z0-9_.-]{2,32})/g, '$1<span class="mention">@$2</span>');
}

function selectedSafeMediaId(kind) {
  return kind === 'private' ? state.selectedPrivateMediaId : state.selectedGlobalMediaId;
}

function allMediaItems() {
  const byId = new Map();
  [...(state.mediaLibrary || []), ...(state.mediaSearchResults || [])].forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return [...byId.values()];
}

function selectedSafeMedia(kind) {
  const selectedId = selectedSafeMediaId(kind);
  return allMediaItems().find((item) => item.id === selectedId) || null;
}

function buildImageAttachment(kind) {
  const selected = selectedSafeMedia(kind);
  if (!selected) return null;
  return {
    type: 'image',
    libraryId: selected.id,
    name: selected.name,
    kind: selected.kind
  };
}

function mediaItemButtonHtml(item, kind) {
  const selectedId = selectedSafeMediaId(kind);
  const thumb = item.thumbnailUrl || item.dataUrl || item.url || '';
  const label = item.label || item.name || 'Medie';
  const provider = item.provider || 'Web';
  const mediaKind = item.kind === 'gif' ? 'GIF' : 'Foto';
  return `
    <button class="safe-media-item ${item.id === selectedId ? 'selected' : ''}" type="button" data-safe-media-kind="${escapeHtml(kind)}" data-safe-media-id="${escapeHtml(item.id)}" aria-label="Vælg ${escapeHtml(label)}">
      <span class="safe-media-thumb">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer" />
        <span class="safe-media-kind-pill">${escapeHtml(mediaKind)}</span>
      </span>
      <span class="safe-media-meta">
        <span class="safe-media-name">${escapeHtml(label)}</span>
        <span class="safe-media-provider">${escapeHtml(provider)}</span>
      </span>
      <span class="safe-media-select-label">${item.id === selectedId ? 'Valgt ✓' : 'Vælg'}</span>
    </button>
  `;
}

function renderSafeMediaPicker(kind) {
  const picker = kind === 'private' ? privateMediaPicker : globalMediaPicker;
  if (!picker) return;
  picker.classList.remove('media-search-collapsed');
  const webItems = Array.isArray(state.mediaSearchResults) ? state.mediaSearchResults : [];
  const warnings = Array.isArray(state.mediaSearchWarnings) ? state.mediaSearchWarnings : [];
  const webProviderLabel = state.mediaWebProviders?.length ? state.mediaWebProviders.join(' + ') : 'GIPHY/Pixabay';
  const selected = selectedSafeMedia(kind);
  const selectedThumb = selected ? (selected.thumbnailUrl || selected.dataUrl || selected.url || '') : '';
  picker.innerHTML = `
    <div class="media-search-panel media-search-panel-polished">
      <div class="media-search-title">
        <div class="media-search-title-main">
          <span class="media-search-icon">🖼️</span>
          <div>
            <strong>Find GIFs/fotos</strong>
            <span>${state.mediaWebSearchEnabled ? `Aktiv: ${escapeHtml(webProviderLabel)}` : 'Websøgning ikke sat op endnu'}</span>
          </div>
        </div>
        <span class="media-search-safety-pill">Kun godkendte kilder</span>
      </div>
      <div class="media-search-form" data-media-search-form="${escapeHtml(kind)}">
        <label class="media-search-input-wrap">
          <span>Søg</span>
          <input name="q" value="${escapeHtml(state.mediaSearchQuery || '')}" placeholder="Søg fx: funny, cat, gg, party..." autocomplete="off" />
        </label>
        <label class="media-search-select-wrap">
          <span>Type</span>
          <select name="kind">
            <option value="all" ${state.mediaSearchKind === 'all' ? 'selected' : ''}>Alt</option>
            <option value="gif" ${state.mediaSearchKind === 'gif' ? 'selected' : ''}>GIFs</option>
            <option value="picture" ${state.mediaSearchKind === 'picture' ? 'selected' : ''}>Fotos</option>
          </select>
        </label>
        <button class="primary media-search-submit" type="button" data-media-search-submit="1" ${state.mediaSearchLoading ? 'disabled' : ''}>${state.mediaSearchLoading ? 'Søger...' : 'Søg'}</button>
      </div>
      ${selected ? `
        <div class="media-selected-card">
          <img src="${escapeHtml(selectedThumb)}" alt="${escapeHtml(selected.label || selected.name || 'Valgt medie')}" referrerpolicy="no-referrer" />
          <div>
            <strong>${escapeHtml(selected.label || selected.name || 'Valgt medie')}</strong>
            <span>${selected.kind === 'gif' ? 'GIF' : 'Foto'} · ${escapeHtml(selected.provider || 'Web')}</span>
          </div>
          <button type="button" class="ghost tiny" data-clear-image="${escapeHtml(kind)}">Fjern</button>
        </div>
      ` : ''}
      <p class="media-search-note">Brugere kan ikke uploade egne billeder. Vælg et resultat fra GIPHY/Pixabay, og tryk derefter Send.</p>
      ${warnings.length ? `<div class="media-search-warning">${warnings.map(escapeHtml).join('<br>')}</div>` : ''}
    </div>
    <div class="safe-media-scroll-area">
      ${webItems.length ? `
        <div class="safe-media-section-title"><span>Web-resultater</span><strong>${webItems.length}</strong></div>
        <div class="safe-media-grid">${webItems.map((item) => mediaItemButtonHtml(item, kind)).join('')}</div>
      ` : `
        <div class="safe-media-empty media-empty-polished">
          <strong>Ingen medier endnu</strong>
          <span>Søg efter GIFs eller fotos fra GIPHY/Pixabay for at vælge noget at sende.</span>
        </div>
      `}
    </div>
  `;
  requestAnimationFrame(() => resetMediaSearchHeader(picker));
}
function renderSafeMediaPickers() {
  renderSafeMediaPicker('global');
  renderSafeMediaPicker('private');
}

function updateImagePreview(kind) {
  const preview = kind === 'private' ? privateImagePreview : globalImagePreview;
  if (!preview) return;
  const selected = selectedSafeMedia(kind);
  if (!selected) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <span>📷 ${escapeHtml(selected.label || selected.name)} · ${selected.kind === 'gif' ? 'GIF' : 'Billede'}${selected.provider ? ` · ${escapeHtml(selected.provider)}` : ''}</span>
    <button type="button" class="image-remove-button" data-clear-image="${escapeHtml(kind)}">Fjern</button>
  `;
}

function clearImageSelection(kind) {
  if (kind === 'private') state.selectedPrivateMediaId = '';
  else state.selectedGlobalMediaId = '';
  updateImagePreview(kind);
  renderSafeMediaPicker(kind);
}

async function loadMediaLibrary() {
  try {
    const data = await api('/api/media-library');
    state.mediaLibrary = Array.isArray(data.items) ? data.items : [];
    state.mediaWebSearchEnabled = Boolean(data.webSearchEnabled);
    state.mediaWebProviders = Array.isArray(data.webProviders) ? data.webProviders : [];
    renderSafeMediaPickers();
  } catch (error) {
    console.warn('Safe media library failed to load:', error.message);
    state.mediaLibrary = [];
    renderSafeMediaPickers();
  }
}

async function searchWebMedia(kind, formData) {
  const query = String(formData.get('q') || '').trim();
  const selectedKind = String(formData.get('kind') || 'all');
  state.mediaSearchQuery = query;
  state.mediaSearchKind = ['gif', 'picture', 'all'].includes(selectedKind) ? selectedKind : 'all';
  state.mediaSearchLoading = true;
  renderSafeMediaPicker(kind);
  try {
    const data = await api(`/api/media-search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(state.mediaSearchKind)}`);
    state.mediaSearchResults = Array.isArray(data.items) ? data.items : [];
    state.mediaSearchWarnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
    if (!state.mediaSearchResults.length && !state.mediaSearchWarnings.length) {
      state.mediaSearchWarnings = ['Ingen resultater. Prøv et andet søgeord.'];
    }
  } catch (error) {
    state.mediaSearchResults = [];
    state.mediaSearchWarnings = [error.message];
  } finally {
    state.mediaSearchLoading = false;
    renderSafeMediaPicker(kind);
  }
}

const REACTION_EMOJIS = ['👍', '😂', '🔥', '💀', '❤️'];

function reactionCount(reactions, emoji) {
  const item = (Array.isArray(reactions) ? reactions : []).find((reaction) => reaction.emoji === emoji);
  return Number(item?.count) || 0;
}

function reactionActive(reactions, emoji) {
  const item = (Array.isArray(reactions) ? reactions : []).find((reaction) => reaction.emoji === emoji);
  return Boolean(item?.reactedByMe);
}

function reactionPeople(reactions, emoji) {
  const item = (Array.isArray(reactions) ? reactions : []).find((reaction) => reaction.emoji === emoji);
  return Array.isArray(item?.reactedBy) ? item.reactedBy : [];
}

function reactionPeopleText(reactions, emoji) {
  const people = reactionPeople(reactions, emoji);
  if (!people.length) return '';
  return people.map((person) => person?.name || person?.username || 'Ukendt bruger').join(', ');
}

function reactionPeopleListHtml(reactions) {
  const items = reactionItems(reactions);
  if (!items.length) return '<p class="reaction-people-empty">Ingen reaktioner endnu.</p>';
  return items.map((reaction) => {
    const peopleText = reactionPeopleText(reactions, reaction.emoji);
    const label = peopleText || `${formatNumber(reaction.count)} reaktioner`;
    return `
      <div class="reaction-people-row">
        <span class="reaction-people-emoji">${escapeHtml(reaction.emoji)}</span>
        <div>
          <strong>${escapeHtml(formatNumber(reaction.count))} ${Number(reaction.count) === 1 ? 'reaktion' : 'reaktioner'}</strong>
          <p>${escapeHtml(label)}</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderReactionBar(reactions, idValue, type) {
  const attr = type === 'direct' ? 'data-react-direct-message' : 'data-react-global-message';
  return `<div class="reaction-bar">${REACTION_EMOJIS.map((emoji) => {
    const count = reactionCount(reactions, emoji);
    const active = reactionActive(reactions, emoji);
    return `<button class="reaction-button ${active ? 'active' : ''}" type="button" ${attr}="${escapeHtml(idValue)}" data-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}${count ? `<span>${formatNumber(count)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

function reactionItems(reactions) {
  return (Array.isArray(reactions) ? reactions : [])
    .filter((reaction) => Number(reaction?.count) > 0)
    .slice(0, 5);
}

function renderReactionSummary(reactions) {
  const items = reactionItems(reactions);
  if (!items.length) return '';

  const chips = items.map((reaction) => {
    const peopleText = reactionPeopleText(reactions, reaction.emoji);
    const title = peopleText ? `${reaction.emoji} ${peopleText}` : `${reaction.count} reaktioner`;
    return `
      <span class="reaction-summary-chip ${reaction.reactedByMe ? 'active' : ''}" title="${escapeHtml(title)}">
        <span class="reaction-summary-emoji">${escapeHtml(reaction.emoji)}</span>
        <strong>${escapeHtml(formatNumber(reaction.count))}</strong>
      </span>
    `;
  }).join('');

  return `<div class="reaction-summary" aria-label="Reaktioner på beskeden">${chips}</div>`;
}

function notificationTypeIcon(type) {
  const icons = {
    private: '💬',
    mention: '@',
    reaction: '✨',
    friend: '🤝',
    warning: '⚠️',
    admin: '🛡️',
    'account-recovery': '🔐'
  };
  return icons[String(type || '').toLowerCase()] || '🔔';
}

function notificationTypeLabel(type) {
  const labels = {
    private: 'Privat besked',
    mention: 'Mention',
    reaction: 'Reaktion',
    friend: 'Venner',
    warning: 'Advarsel',
    admin: 'Admin',
    'account-recovery': 'Kontogendannelse'
  };
  return labels[String(type || '').toLowerCase()] || 'Info';
}

function friendStatusLabel(status) {
  if (status === 'friends') return 'Venner';
  if (status === 'pending-out') return 'Sendt';
  if (status === 'pending-in') return 'Acceptér';
  return 'Tilføj ven';
}

function friendActionForStatus(status) {
  if (status === 'friends') return 'remove';
  if (status === 'pending-in') return 'accept';
  if (status === 'pending-out') return 'decline';
  return 'request';
}

function updateBadgeElement(element, count) {
  if (!element) return;
  const number = Math.max(0, Number(count) || 0);
  element.classList.toggle('hidden', number <= 0);
  element.textContent = number > 99 ? '99+' : String(number);
}

function calculatePrivateUnreadTotal() {
  return state.users.reduce((sum, user) => sum + (Number(user.unreadCount) || 0), 0);
}

function updateContextBadges() {
  state.privateUnreadTotal = calculatePrivateUnreadTotal();
  updateBadgeElement(privateUnreadBadge, state.privateUnreadTotal);
  updateBadgeElement(globalMentionBadge, state.globalMentionCount);
  updateBadgeElement(notificationBadge, state.unreadNotifications);
}

function updateNotificationBadge() {
  updateContextBadges();
}

function mentionsCurrentUser(message) {
  if (!message || !state.me?.username) return false;
  if (message.authorId === state.me.id) return false;
  const text = String(message.text || message.body || '');
  const username = String(state.me.username || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)@${username}(?=\\b|$)`, 'i').test(text);
}

function showGlobalPingBanner(authorName) {
  if (!globalPingBanner) {
    showToast(`Du blev pinget i global chat af: ${authorName || 'en bruger'}`);
    return;
  }
  globalPingBanner.innerHTML = `
    <button class="ping-banner-button" type="button" data-open-pinged-global>
      <span>🔔</span>
      <strong>Du blev pinget i global chat af: ${escapeHtml(authorName || 'en bruger')}</strong>
      <em>Tryk for at åbne</em>
    </button>
  `;
  globalPingBanner.classList.remove('hidden');
}

function clearGlobalMentionBadge({ scroll = false } = {}) {
  state.globalMentionCount = 0;
  state.lastGlobalPingBy = '';
  updateContextBadges();
  if (globalPingBanner) globalPingBanner.classList.add('hidden');
  if (scroll) {
    switchAppView('global');
    requestGlobalChatBottomOnOpen();
  }
}

function renderProfilePreview() {
  const preview = $('#profilePreview');
  if (!preview || !state.me) return;
  preview.innerHTML = `
    <div class="profile-banner-text">${escapeHtml(state.me.banner || 'Ingen bannertekst endnu')}</div>
    <div class="profile-preview-main">
      ${avatarHtml(state.me, 'large')}
      <div>
        <strong>${escapeHtml(state.me.name)}</strong>
        <span>@${escapeHtml(state.me.username)} · ${escapeHtml(joinedDaysLabel(state.me))}</span>
        <p>${escapeHtml(state.me.statusText || 'Ingen status endnu.')}</p>
        ${badgeHtml(state.me)}
        <div class="xp-mini">Level ${escapeHtml(state.me.level || 1)} · ${escapeHtml(formatNumber(state.me.xp || 0))} XP · ${escapeHtml(state.me.loginStreak || 0)} dages streak</div>
      </div>
    </div>
  `;
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


function schedulePrivateChatBottomScroll() {
  if (!messagesList) return;

  const apply = () => scrollElementToBottom(messagesList);
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 80);
  setTimeout(apply, 180);
  setTimeout(apply, 360);
  setTimeout(apply, 700);
}

function requestPrivateChatBottomOnOpen() {
  state.privateChatNeedsBottomScroll = true;
  schedulePrivateChatBottomScroll();
}

function stabilizePrivateChatMediaScroll({ forceBottom = false, snapshot = null } = {}) {
  if (!messagesList) return;
  const media = messagesList.querySelectorAll('img, video');
  if (!media.length) return;

  media.forEach((element) => {
    const eventName = element.tagName === 'VIDEO' ? 'loadedmetadata' : 'load';
    element.addEventListener(eventName, () => {
      if (forceBottom || !snapshot || snapshot.wasNearBottom) {
        scrollElementToBottom(messagesList);
      } else {
        restoreMessageScroll(messagesList, snapshot);
      }
    }, { once: true });
  });
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
  const allowedViews = new Set(['home', 'profile', 'global', 'private', 'friends', 'events', 'admin']);
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
    clearGlobalMentionBadge();
    const firstOpen = !state.globalChatHasOpened;
    const enteringGlobal = previousView !== 'global';
    if (firstOpen || enteringGlobal) {
      state.globalChatHasOpened = true;
      requestAnimationFrame(requestGlobalChatBottomOnOpen);
    }
  }


  if (activeView === 'home') {
    loadHome().catch((error) => showToast(error.message));
  }

  if (activeView === 'events') {
    Promise.all([loadEvents(), loadPolls(), loadLeaderboard()]).catch((error) => showToast(error.message));
  }

  if (activeView === 'friends') {
    loadFriends().catch((error) => showToast(error.message));
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
  switchAppView(appScreen.dataset.view || 'home');
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
  cleanupCall();
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
  state.friends = [];
  state.friendIncoming = [];
  state.friendOutgoing = [];
  state.notifications = [];
  state.unreadNotifications = 0;
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



document.addEventListener('submit', async (event) => {
  if (event.target?.id === 'recoveryRequestForm') {
    event.preventDefault();
    const form = event.target;
    try {
      await api('/api/recovery/request', { method: 'POST', body: JSON.stringify({ oldUsername: form.elements.oldUsername.value, note: form.elements.note.value }) });
      form.reset();
      await loadRecoveryRequests();
      showToast('Gendannelsesanmodning sendt til admin.');
    } catch (error) { showToast(error.message); }
  }
  if (event.target?.id === 'recoveryResetForm') {
    event.preventDefault();
    const form = event.target;
    try {
      const data = await api('/api/recovery/reset', { method: 'POST', body: JSON.stringify({ requestId: form.elements.requestId.value, resetCode: form.elements.resetCode.value, newPassword: form.elements.newPassword.value }) });
      form.reset();
      showToast(data.message || 'Adgangskoden er nulstillet. Log ind på den gamle konto.');
    } catch (error) { showToast(error.message); }
  }
});

document.addEventListener('click', async (event) => {
  const fill = event.target.closest('[data-fill-recovery]');
  if (fill) {
    const request = state.recoveryRequests.find((candidate) => candidate.id === fill.dataset.fillRecovery);
    const form = $('#recoveryResetForm');
    if (request && form) {
      form.elements.requestId.value = request.id;
      form.elements.resetCode.value = request.resetCode || '';
      showToast('Gendannelseskoden er sat ind. Vælg en ny adgangskode til den gamle konto.');
    }
    return;
  }
  if (event.target?.id === 'refreshRecoveryBtn') {
    loadRecoveryRequests().catch((error) => showToast(error.message));
    return;
  }
  if (event.target?.id === 'refreshAdminRecoveryBtn') {
    loadAdminRecoveryRequests().catch((error) => showToast(error.message));
    return;
  }
  const approve = event.target.closest('[data-admin-recovery-approve]');
  const deny = event.target.closest('[data-admin-recovery-deny]');
  if (approve || deny) {
    const requestId = approve?.dataset.adminRecoveryApprove || deny?.dataset.adminRecoveryDeny;
    const action = approve ? 'approve' : 'deny';
    const adminNote = action === 'deny' ? (prompt('Hvorfor afvises anmodningen?') || '') : '';
    try {
      await api(`/api/admin/recovery-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ action, adminNote }) });
      await loadAdminRecoveryRequests();
      showToast(action === 'approve' ? 'Gendannelse godkendt' : 'Gendannelse afvist');
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target?.id === 'confirmRecoveryMergeBtn') {
    try {
      const data = await api('/api/recovery/merge/confirm', { method: 'POST' });
      state.me = data.user || state.me;
      state.pendingRecoveryMerge = data.merge || null;
      document.getElementById('recoveryMergeModal')?.remove();
      renderMe();
      await loadEverything();
      if (state.pendingRecoveryMerge) showRecoveryMergeModal(state.pendingRecoveryMerge);
      else await checkPendingRecoveryMerge();
      showToast(`Kontiene er sammenlagt. ${Number(data.movedMessages || 0)} beskeder blev overført.`);
    } catch (error) { showToast(error.message); }
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
        bio: $('#profileBio').value,
        statusText: $('#profileStatus')?.value || '',
        banner: $('#profileBanner')?.value || ''
      })
    });
    state.me = data.user;
    renderMe();
    renderProfilePreview();
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
    const adminWarnButton = event.target.closest('[data-admin-warn]');
    const badgesButton = event.target.closest('[data-admin-badges]');

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

      if (adminWarnButton) {
        const userId = adminWarnButton.dataset.adminWarn;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const reason = prompt(`Advar ${user?.name || 'denne bruger'}? Skriv grund:`, 'Regelbrud');
        if (reason === null) return;
        const data = await api(`/api/admin/users/${userId}/warn`, {
          method: 'POST',
          body: JSON.stringify({ reason })
        });
        upsertAdminUser(data.user);
        if (data.stats) state.adminStats = data.stats;
        renderAdminUsers();
        renderAdminStats();
        await loadUsers($('#userSearch').value);
        showToast('Advarsel sendt');
      }

      if (badgesButton) {
        const userId = badgesButton.dataset.adminBadges;
        const user = state.adminUsers.find((candidate) => candidate.id === userId);
        const customBadges = (Array.isArray(user?.badges) ? user.badges : [])
          .map((badge) => badge.label)
          .filter((label) => label && label.toLowerCase() !== 'member');
        const value = prompt(
          `Særlige badges til ${user?.name || 'denne bruger'} (komma-separeret). Lad feltet være tomt for kun Member:`,
          customBadges.join(', ')
        );
        if (value === null) return;
        const badges = value.split(',').map((badge) => badge.trim()).filter(Boolean);
        const data = await api(`/api/admin/users/${userId}/badges`, {
          method: 'PUT',
          body: JSON.stringify({ badges })
        });
        upsertAdminUser(data.user);
        if (data.stats) state.adminStats = data.stats;
        renderAdminUsers();
        renderAdminStats();
        await loadUsers($('#userSearch').value);
        if (data.user?.id === state.me?.id) state.me = { ...state.me, ...data.user };
        renderMe();
        showToast('Badges opdateret');
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

function getMessageByPopupType(type, messageId) {
  const source = type === 'direct' ? state.activeMessages : state.globalMessages;
  return (Array.isArray(source) ? source : []).find((message) => message.id === messageId) || null;
}

function messagePopupAuthor(message, type) {
  if (type === 'global') return message?.author?.name || 'Ukendt';
  if (!state.me) return 'TSN';
  return message?.from === state.me.id ? state.me.name : (state.activeChatUser?.name || 'Privat chat');
}

function ensureMessageActionOverlay() {
  let overlay = document.getElementById('messageActionOverlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'messageActionOverlay';
  overlay.className = 'message-action-overlay hidden';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
  overlay.addEventListener('click', handleMessageActionOverlayClick);
  return overlay;
}

function closeMessageActionPopup() {
  const overlay = document.getElementById('messageActionOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '';
}

function openMessageActionPopup(type, messageId) {
  const message = getMessageByPopupType(type, messageId);
  if (!message) return;
  const overlay = ensureMessageActionOverlay();
  const author = messagePopupAuthor(message, type);
  const timestamp = formatExactDate(message.createdAt);
  const canReport = type === 'global' || message.from !== state.me?.id;
  const canDelete = type === 'global' ? canDeleteMessage(message.authorId) : canDeletePrivateMessageForEveryone(message);
  const reportAttr = type === 'global' ? `data-popup-report-global="${escapeHtml(message.id)}"` : `data-popup-report-direct="${escapeHtml(message.id)}"`;
  const deleteAttr = type === 'global' ? `data-popup-delete-global="${escapeHtml(message.id)}"` : `data-popup-delete-direct="${escapeHtml(message.id)}"`;

  overlay.innerHTML = `
    <div class="message-action-card" role="dialog" aria-modal="true" aria-label="Beskedmenu">
      <div class="message-action-head">
        <div>
          <p class="eyebrow mini">Besked</p>
          <h3>${escapeHtml(author)}</h3>
          <span>${escapeHtml(timestamp)}</span>
        </div>
        <button class="icon-button action-close-button" type="button" data-close-message-popup aria-label="Luk">×</button>
      </div>

      <div class="message-action-preview">
        ${messageBodyHtml(message)}
      </div>

      <div class="message-action-section-title">Vælg en reaktion</div>
      <div class="message-action-reactions" aria-label="Reaktioner">
        ${REACTION_EMOJIS.map((emoji) => {
          const active = reactionActive(message.reactions, emoji);
          const count = reactionCount(message.reactions, emoji);
          const peopleText = reactionPeopleText(message.reactions, emoji);
          const title = peopleText ? `${emoji} ${peopleText}` : `${emoji} Ingen endnu`;
          return `<button class="popup-reaction-button ${active ? 'active' : ''}" type="button" data-popup-react="${escapeHtml(type)}" data-message-id="${escapeHtml(message.id)}" data-emoji="${escapeHtml(emoji)}" title="${escapeHtml(title)}"><span>${escapeHtml(emoji)}</span>${count ? `<strong>${escapeHtml(formatNumber(count))}</strong>` : ''}</button>`;
        }).join('')}
      </div>

      <div class="message-action-section-title">Hvem reagerede?</div>
      <div class="reaction-people-list" aria-label="Brugere der reagerede">
        ${reactionPeopleListHtml(message.reactions)}
      </div>

      <div class="message-action-footer">
        ${canReport ? `<button class="message-secondary-action" type="button" ${reportAttr}>Rapportér</button>` : ''}
        ${canDelete ? `<button class="message-danger-action" type="button" ${deleteAttr}>Slet</button>` : ''}
      </div>
    </div>
  `;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.querySelector('[data-close-message-popup]')?.focus();
}

async function handleMessageActionOverlayClick(event) {
  const overlay = event.currentTarget;
  if (event.target === overlay || event.target.closest('[data-close-message-popup]')) {
    closeMessageActionPopup();
    return;
  }

  const reactButton = event.target.closest('[data-popup-react]');
  const reportGlobal = event.target.closest('[data-popup-report-global]');
  const reportDirect = event.target.closest('[data-popup-report-direct]');
  const deleteGlobal = event.target.closest('[data-popup-delete-global]');
  const deleteDirect = event.target.closest('[data-popup-delete-direct]');

  try {
    if (reactButton) {
      const type = reactButton.dataset.popupReact;
      const messageId = reactButton.dataset.messageId;
      const endpoint = type === 'direct' ? `/api/messages/${messageId}/reactions` : `/api/global/messages/${messageId}/reactions`;
      const data = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ emoji: reactButton.dataset.emoji })
      });
      if (type === 'direct') {
        const index = state.activeMessages.findIndex((message) => message.id === data.message.id);
        if (index >= 0) state.activeMessages[index] = data.message;
        renderChat();
      } else {
        upsertGlobalMessage(data.message);
        renderGlobalMessages();
      }
      openMessageActionPopup(type, messageId);
      return;
    }

    if (reportGlobal) {
      await createReport('global-message', { messageId: reportGlobal.dataset.popupReportGlobal });
      closeMessageActionPopup();
      return;
    }

    if (reportDirect) {
      await createReport('direct-message', { messageId: reportDirect.dataset.popupReportDirect });
      closeMessageActionPopup();
      return;
    }

    if (deleteGlobal) {
      if (!confirm('Slet denne globale chatbesked for alle?')) return;
      const messageId = deleteGlobal.dataset.popupDeleteGlobal;
      await api(`/api/global/messages/${messageId}`, { method: 'DELETE' });
      state.globalMessages = state.globalMessages.filter((message) => message.id !== messageId);
      renderGlobalMessages();
      closeMessageActionPopup();
      showToast('Global chatbesked slettet');
      return;
    }

    if (deleteDirect) {
      if (!confirm('Slet denne private besked for alle? Det virker kun for dine egne beskeder inden for 15 minutter efter afsendelse.')) return;
      const messageId = deleteDirect.dataset.popupDeleteDirect;
      await api(`/api/messages/${messageId}`, { method: 'DELETE' });
      state.activeMessages = state.activeMessages.filter((message) => message.id !== messageId);
      renderChat();
      closeMessageActionPopup();
      showToast('Beskeden er slettet for alle.');
    }
  } catch (error) {
    showToast(error.message);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMessageActionPopup();
});

$('#globalMessageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#globalMessageInput');
  const text = input.value.trim();

  try {
    const attachment = buildImageAttachment('global');
    if (!text && !attachment) return;
    const data = await api('/api/global/messages', {
      method: 'POST',
      body: JSON.stringify({ text, attachment })
    });
    input.value = '';
    clearImageSelection('global');
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
    const reactButton = event.target.closest('[data-react-global-message]');
    const messageCard = event.target.closest('[data-open-global-message-menu]');

    try {
      if (reactButton) {
        event.preventDefault();
        event.stopPropagation();
        const messageId = reactButton.dataset.reactGlobalMessage;
        const data = await api(`/api/global/messages/${messageId}/reactions`, {
          method: 'POST',
          body: JSON.stringify({ emoji: reactButton.dataset.emoji })
        });
        upsertGlobalMessage(data.message);
        renderGlobalMessages();
        return;
      }

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
        return;
      }

      if (messageCard) {
        openMessageActionPopup('global', messageCard.dataset.openGlobalMessageMenu);
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

if (globalPingBanner) {
  globalPingBanner.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-pinged-global]')) clearGlobalMentionBadge({ scroll: true });
  });
}

if (globalMessagesList) {
  globalMessagesList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const messageCard = event.target.closest('[data-open-global-message-menu]');
    if (!messageCard) return;
    event.preventDefault();
    openMessageActionPopup('global', messageCard.dataset.openGlobalMessageMenu);
  });
}

if (messagesList) {
  messagesList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const messageCard = event.target.closest('[data-open-direct-message-menu]');
    if (!messageCard) return;
    event.preventDefault();
    openMessageActionPopup('direct', messageCard.dataset.openDirectMessageMenu);
  });
}

if (globalMediaPickerBtn) globalMediaPickerBtn.addEventListener('click', () => {
  globalMediaPicker?.classList.toggle('hidden');
  renderSafeMediaPicker('global');
});
if (privateMediaPickerBtn) privateMediaPickerBtn.addEventListener('click', () => {
  privateMediaPicker?.classList.toggle('hidden');
  renderSafeMediaPicker('private');
});
function runMediaSearchFromPanel(panel) {
  if (!panel) return;
  const kind = panel.dataset.mediaSearchForm === 'private' ? 'private' : 'global';
  const data = new FormData();
  const queryInput = panel.querySelector('input[name="q"]');
  const kindSelect = panel.querySelector('select[name="kind"]');
  data.set('q', queryInput?.value || '');
  data.set('kind', kindSelect?.value || 'all');
  searchWebMedia(kind, data);
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-media-search-form]');
  if (!form) return;
  event.preventDefault();
  runMediaSearchFromPanel(form);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const panel = event.target.closest('[data-media-search-form]');
  if (!panel) return;
  event.preventDefault();
  runMediaSearchFromPanel(panel);
});

function applyMediaSearchHeaderOffset(picker, area, nextOffset) {
  if (!picker || !area) return;
  const panel = picker.querySelector('.media-search-panel');
  if (!panel) return;
  const height = Math.max(90, Math.ceil(panel.scrollHeight || panel.offsetHeight || 180));
  const offset = Math.max(0, Math.min(height, Number(nextOffset || 0)));
  const progress = height ? Math.max(0, Math.min(1, offset / height)) : 0;
  picker.style.setProperty('--media-search-height', `${height}px`);
  picker.style.setProperty('--media-search-shift', `${offset}px`);
  picker.style.setProperty('--media-search-progress', String(progress));
  panel.style.opacity = String(Math.max(0, Math.min(1, 1 - progress * 1.25)));
  panel.style.pointerEvents = progress > 0.88 ? 'none' : '';
  picker.classList.toggle('media-search-follow-hidden', progress > 0.88);
  area.dataset.mediaHeaderOffset = String(offset);
}

function resetMediaSearchHeader(picker) {
  if (!picker) return;
  const area = picker.querySelector('.safe-media-scroll-area');
  if (!area) return;
  applyMediaSearchHeaderOffset(picker, area, 0);
}

document.addEventListener('scroll', (event) => {
  const area = event.target?.closest?.('.safe-media-scroll-area');
  if (!area) return;
  const picker = area.closest('.safe-media-picker');
  if (!picker) return;
  picker.classList.remove('media-search-collapsed');
  const current = area.scrollTop || 0;
  const last = Number(area.dataset.lastScrollTop || '0');
  const delta = current - last;
  const panel = picker.querySelector('.media-search-panel');
  const height = Math.max(90, Math.ceil(panel?.scrollHeight || panel?.offsetHeight || 180));
  let offset = Number(area.dataset.mediaHeaderOffset || '0');

  if (current <= 4) {
    offset = 0;
  } else if (Math.abs(delta) > 0.5) {
    // Follow the scroll movement: faster/larger scrolls move the header farther.
    offset += delta;
  }

  offset = Math.max(0, Math.min(height, offset));
  applyMediaSearchHeaderOffset(picker, area, offset);
  area.dataset.lastScrollTop = String(current);
}, true);

document.addEventListener('click', (event) => {
  const searchButton = event.target.closest('[data-media-search-submit]');
  if (searchButton) {
    event.preventDefault();
    runMediaSearchFromPanel(searchButton.closest('[data-media-search-form]'));
    return;
  }
  const mediaButton = event.target.closest('[data-safe-media-id]');
  if (mediaButton) {
    const kind = mediaButton.dataset.safeMediaKind === 'private' ? 'private' : 'global';
    if (kind === 'private') state.selectedPrivateMediaId = mediaButton.dataset.safeMediaId || '';
    else state.selectedGlobalMediaId = mediaButton.dataset.safeMediaId || '';
    updateImagePreview(kind);
    renderSafeMediaPicker(kind);
    (kind === 'private' ? privateMediaPicker : globalMediaPicker)?.classList.add('hidden');
    return;
  }
  const clearButton = event.target.closest('[data-clear-image]');
  if (clearButton) clearImageSelection(clearButton.dataset.clearImage);
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
  clearImageSelection('private');

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

async function sendPrivateMessage(text = '') {
  const input = $('#messageInput');
  const cleanMessageText = String(text || '').trim();
  if (!state.socket || !state.activeChatUser) return;

  let attachment = null;
  try {
    attachment = buildImageAttachment('private');
  } catch (error) {
    showToast(error.message);
    return;
  }
  if (!cleanMessageText && !attachment) return;

  const to = state.activeChatUser.id;
  if (input) state.chatDrafts[to] = input.value;

  state.socket.emit('private-message', { to, text: cleanMessageText, attachment }, (response) => {
    if (!response?.ok) {
      showToast(response?.error || 'Kunne ikke sende beskeden.');
      return;
    }

    if (state.activeChatUser?.id === to && input) input.value = '';
    state.chatDrafts[to] = '';
    clearImageSelection('private');
  });
}

$('#messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#messageInput');
  sendPrivateMessage(input.value).catch((error) => showToast(error.message));
});

if (messagesList) {
  messagesList.addEventListener('click', async (event) => {
    const reportButton = event.target.closest('[data-report-direct-message]');
    const deleteButton = event.target.closest('[data-delete-message]');
    const reactButton = event.target.closest('[data-react-direct-message]');
    const messageCard = event.target.closest('[data-open-direct-message-menu]');

    try {
      if (reactButton) {
        const messageId = reactButton.dataset.reactDirectMessage;
        const data = await api(`/api/messages/${messageId}/reactions`, {
          method: 'POST',
          body: JSON.stringify({ emoji: reactButton.dataset.emoji })
        });
        const index = state.activeMessages.findIndex((message) => message.id === data.message.id);
        if (index >= 0) state.activeMessages[index] = data.message;
        renderChat();
        return;
      }

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
        return;
      }

      if (messageCard) {
        openMessageActionPopup('direct', messageCard.dataset.openDirectMessageMenu);
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

const chatFriendBtn = $('#chatFriendBtn');
if (chatFriendBtn) {
  chatFriendBtn.addEventListener('click', async () => {
    if (!state.activeChatUser) return;
    const status = state.activeChatUser.friendStatus || 'none';
    const action = friendActionForStatus(status);
    await performFriendAction(state.activeChatUser.id, action).catch((error) => showToast(error.message));
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


function ensureRecoveryUi() {
  const profileSidebar = document.querySelector('.sidebar[data-route-view="profile"]');
  if (profileSidebar && !$('#accountRecoveryPanel')) {
    const panel = document.createElement('section');
    panel.id = 'accountRecoveryPanel';
    panel.className = 'account-recovery card mini-panel';
    panel.innerHTML = `
      <div class="section-heading compact-heading"><div><p class="eyebrow mini">Kontogendannelse</p><h3>Glemt adgangskode?</h3><p>Admins kan ikke vise gamle adgangskoder. De kan godkende en sikker engangskode, så du kan nulstille den gamle konto og sammenlægge dine to konti.</p></div><button id="refreshRecoveryBtn" class="ghost tiny" type="button">Opdater</button></div>
      <form id="recoveryRequestForm" class="mini-admin-form">
        <input name="oldUsername" placeholder="Gammelt brugernavn, fx user1" autocomplete="off" />
        <textarea name="note" rows="2" maxlength="300" placeholder="Skriv kort, hvorfor det er din gamle konto"></textarea>
        <button class="secondary tiny" type="submit">Send gendannelsesanmodning</button>
      </form>
      <form id="recoveryResetForm" class="mini-admin-form">
        <strong>Når admin har godkendt</strong>
        <input name="requestId" placeholder="Anmodnings-ID" autocomplete="off" />
        <input name="resetCode" placeholder="Gendannelseskode" autocomplete="one-time-code" />
        <input name="newPassword" type="password" placeholder="Ny adgangskode til den gamle konto" autocomplete="new-password" />
        <button class="primary tiny" type="submit">Nulstil den gamle konto sikkert</button>
      </form>
      <div id="recoveryRequestsList" class="recovery-list"></div>
    `;
    const dangerZone = profileSidebar.querySelector('.danger-zone');
    profileSidebar.insertBefore(panel, dangerZone || profileSidebar.querySelector('#adminBox') || null);
  }
  const adminPanel = $('#adminModerationPanel');
  if (adminPanel && !$('#adminRecoveryPanel')) {
    const panel = document.createElement('div');
    panel.id = 'adminRecoveryPanel';
    panel.className = 'admin-recovery-panel admin-subpanel';
    panel.innerHTML = `
      <div class="admin-moderation-head"><div><strong>Kontogendannelse</strong><span>Godkend sikre engangskoder. Gamle adgangskoder kan aldrig ses.</span></div><button id="refreshAdminRecoveryBtn" class="secondary tiny" type="button">Opdater gendannelse</button></div>
      <div id="adminRecoveryList" class="admin-recovery-list"></div>
    `;
    adminPanel.appendChild(panel);
  }
}

function recoveryStatusLabel(status) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'pending') return 'Afventer';
  if (value === 'approved') return 'Godkendt';
  if (value === 'denied') return 'Afvist';
  if (value === 'used') return 'Brugt';
  if (value === 'completed') return 'Gennemført';
  return value;
}

function renderRecoveryRequests() {
  ensureRecoveryUi();
  const list = $('#recoveryRequestsList');
  if (!list) return;
  if (!state.recoveryRequests.length) {
    list.innerHTML = '<div class="empty small-empty">Ingen gendannelsesanmodninger endnu.</div>';
    return;
  }
  list.innerHTML = state.recoveryRequests.map((request) => `
    <article class="recovery-card status-${escapeHtml(request.status)}">
      <div><strong>@${escapeHtml(request.oldUsername || request.oldUser?.username || 'ukendt')}</strong><span>${escapeHtml(recoveryStatusLabel(request.status))}</span></div>
      <p>${escapeHtml(request.note || '')}</p>
      ${request.resetCode ? `<div class="recovery-code"><small>Gendannelseskode</small><code>${escapeHtml(request.resetCode)}</code><button class="ghost tiny" type="button" data-fill-recovery="${escapeHtml(request.id)}">Brug kode</button></div>` : ''}
      ${request.adminNote ? `<p class="muted-small">Admin: ${escapeHtml(request.adminNote)}</p>` : ''}
    </article>
  `).join('');
}

function renderAdminRecoveryRequests() {
  ensureRecoveryUi();
  const list = $('#adminRecoveryList');
  if (!list) return;
  if (!state.adminRecoveryRequests.length) {
    list.innerHTML = '<div class="empty small-empty">Ingen gendannelsesanmodninger.</div>';
    return;
  }
  list.innerHTML = state.adminRecoveryRequests.map((request) => `
    <article class="admin-user recovery-admin-card status-${escapeHtml(request.status)}">
      <div class="admin-user-main"><strong>${escapeHtml(request.requester?.name || 'Ukendt')} vil gendanne @${escapeHtml(request.oldUsername || request.oldUser?.username || 'ukendt')}</strong><span>${escapeHtml(recoveryStatusLabel(request.status))} · ${escapeHtml(formatTime(request.createdAt))}</span></div>
      <p>${escapeHtml(request.note || 'Ingen note')}</p>
      ${request.resetCode ? `<p class="muted-small">Koden er oprettet og synlig for brugeren, der sendte anmodningen.</p>` : ''}
      <div class="admin-user-actions">
        <button class="secondary tiny" type="button" data-admin-recovery-approve="${escapeHtml(request.id)}">Godkend</button>
        <button class="ghost tiny danger" type="button" data-admin-recovery-deny="${escapeHtml(request.id)}">Afvis</button>
      </div>
    </article>
  `).join('');
}

async function loadRecoveryRequests() {
  if (!state.me) return;
  const data = await api('/api/recovery/my-requests');
  state.recoveryRequests = data.requests || [];
  renderRecoveryRequests();
}

async function loadAdminRecoveryRequests() {
  if (!state.me?.isAdmin) return;
  const data = await api('/api/admin/recovery-requests?status=all');
  state.adminRecoveryRequests = data.requests || [];
  renderAdminRecoveryRequests();
}

async function checkPendingRecoveryMerge() {
  if (!state.me) return;
  try {
    const data = await api('/api/recovery/pending-merge');
    state.pendingRecoveryMerge = data.recoveryMerge || null;
    if (state.pendingRecoveryMerge) showRecoveryMergeModal(state.pendingRecoveryMerge);
  } catch {}
}

function showRecoveryMergeModal(merge) {
  if (!merge || $('#recoveryMergeModal')) return;
  const modal = document.createElement('section');
  modal.id = 'recoveryMergeModal';
  modal.className = 'rules-panel recovery-merge-modal';
  modal.innerHTML = `
    <div class="rules-card card recovery-merge-card">
      <p class="eyebrow mini">Kontosammenlægning</p>
      <h2>Dine to konti bliver sammenlagt nu</h2>
      <p>Alle beskeder fra din nye konto (${escapeHtml(merge.secondaryUser?.username || 'User2')}) bliver flyttet til din gamle konto (${escapeHtml(merge.primaryUser?.username || 'User1')}). Alle stats bliver også overført til den gamle konto (${escapeHtml(merge.primaryUser?.username || 'User1')}).</p><p class="muted-small">Når du trykker Fortsæt, bliver den nye midlertidige konto fjernet, og du fortsætter på den gamle konto.</p>
      <button id="confirmRecoveryMergeBtn" class="primary" type="button">Fortsæt</button>
    </div>`;
  document.body.appendChild(modal);
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
  const joined = $('#myJoined');
  if (joined) joined.textContent = joinedDaysLabel(state.me);
  const badges = $('#myBadges');
  if (badges) badges.innerHTML = badgeHtml(state.me).replace(/^<div class="badge-row">|<\/div>$/g, '');
  const xpLine = $('#myXpLine');
  if (xpLine) xpLine.textContent = `Level ${state.me.level || 1} · ${formatNumber(state.me.xp || 0)} XP · ${state.me.loginStreak || 0} dages streak`;
  const xpFill = $('#myXpFill');
  if (xpFill) {
    const current = Number(state.me.xp || 0);
    const next = Math.max(current + 1, Number(state.me.nextLevelXp || 75));
    const prev = Math.pow(Math.max(0, Number(state.me.level || 1) - 1), 2) * 75;
    xpFill.style.width = `${Math.max(2, Math.min(100, ((current - prev) / Math.max(1, next - prev)) * 100))}%`;
  }
  $('#profileName').value = state.me.name;
  $('#profileBio').value = state.me.bio || '';
  if ($('#profileStatus')) $('#profileStatus').value = state.me.statusText || '';
  if ($('#profileBanner')) $('#profileBanner').value = state.me.banner || '';
  applyAvatarElement($('#myAvatar'), state.me, 'large');
  renderProfilePreview();
  renderAdminTools();
  ensureRecoveryUi();
  renderRecoveryRequests();
  renderAdminRecoveryRequests();
}


function renderGlobalChatMessage(message) {
  const mine = message.authorId === state.me?.id;
  const authorName = message.author?.name || 'Ukendt';
  return `
    <article class="global-chat-message ${mine ? 'mine' : ''}" data-global-message-id="${escapeHtml(message.id)}" data-open-global-message-menu="${escapeHtml(message.id)}" tabindex="0" role="button" aria-label="Åbn beskedmenu">
      ${avatarHtml(message.author || authorName, 'chat-avatar')}
      <div class="global-chat-bubble">
        <div class="global-chat-meta">
          <strong>${escapeHtml(authorName)}</strong>
          <span>@${escapeHtml(message.author?.username || 'ukendt')} · ${escapeHtml(formatTime(message.createdAt))}</span>
        </div>
        <div class="message-body">${messageBodyHtml(message)}</div>
        ${renderReactionSummary(message.reactions)}
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
    const status = String(user.statusText || '').trim();
    const action = friendActionForStatus(user.friendStatus || 'none');
    return `
      <article class="user-row user-row-card ${isActive ? 'active' : ''} ${Number(user.unreadCount) > 0 ? 'has-unread' : ''}" data-user-card-id="${escapeHtml(user.id)}">
        <button class="user-open-button" type="button" data-open-chat-user="${escapeHtml(user.id)}">
          ${avatarHtml(user)}
          <div class="user-row-main">
            <strong>${escapeHtml(user.name)}</strong>
            <span>@${escapeHtml(user.username)} · ${escapeHtml(joinedDaysLabel(user))}</span>
            ${status ? `<span class="user-status-text">${escapeHtml(status)}</span>` : ''}
            <span class="user-bio">${escapeHtml(bio)}</span>
            ${badgeHtml(user)}
          </div>
          ${Number(user.unreadCount) > 0 ? `<span class="unread-badge" aria-label="${escapeHtml(user.unreadCount)} ulæste private beskeder">${escapeHtml(unreadBadgeText(user.unreadCount))}</span>` : ''}
          <span class="status-dot ${user.online ? 'online' : ''}"></span>
        </button>
        <div class="user-row-actions">
          <button class="ghost tiny" type="button" data-friend-action="${escapeHtml(action)}" data-friend-user="${escapeHtml(user.id)}">${escapeHtml(friendStatusLabel(user.friendStatus || 'none'))}</button>
        </div>
      </article>
    `;
  }).join('');

  usersList.querySelectorAll('[data-open-chat-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = state.users.find((candidate) => candidate.id === button.dataset.openChatUser);
      if (user) openChat(user);
    });
  });

  usersList.querySelectorAll('[data-friend-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await performFriendAction(button.dataset.friendUser, button.dataset.friendAction).catch((error) => showToast(error.message));
    });
  });
  updateContextBadges();
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
  const conversationId = user.id || '';
  const changedConversation = state.activePrivateConversationId !== conversationId;
  if (changedConversation) {
    state.activePrivateConversationId = conversationId;
    state.privateChatNeedsBottomScroll = true;
  }
  const scrollSnapshot = getScrollSnapshot(messagesList);
  const shouldForceBottom = Boolean(forceBottom || state.privateChatNeedsBottomScroll || changedConversation);

  applyAvatarElement($('#chatAvatar'), user);
  $('#chatName').textContent = user.name;
  $('#chatStatus').textContent = user.online ? 'Online nu' : 'Offline';
  const chatBio = $('#chatBio');
  if (chatBio) chatBio.textContent = [String(user.statusText || '').trim(), String(user.bio || '').trim()].filter(Boolean).join(' · ') || 'Ingen bio endnu.';
  const friendButton = $('#chatFriendBtn');
  if (friendButton) friendButton.textContent = friendStatusLabel(user.friendStatus || 'none');
  chatPanel.classList.remove('hidden');

  if (!state.activeMessages.length) {
    messagesList.innerHTML = '<div class="empty">Der er ingen private beskeder endnu. Start samtalen.</div>';
  } else {
    messagesList.innerHTML = state.activeMessages.map((message) => `
      <div class="message ${message.from === state.me.id ? 'mine' : ''} ${message.transferNote ? 'transferred-message' : ''}" data-open-direct-message-menu="${escapeHtml(message.id)}" tabindex="0" role="button" aria-label="Åbn beskedmenu">
        <div class="message-content">
          ${directMessageBodyHtml(message)}
          ${renderReactionSummary(message.reactions)}
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

  restoreMessageScroll(messagesList, scrollSnapshot, { forceBottom: shouldForceBottom });
  stabilizePrivateChatMediaScroll({ forceBottom: shouldForceBottom, snapshot: scrollSnapshot });
  if (shouldForceBottom) {
    state.privateChatNeedsBottomScroll = false;
    schedulePrivateChatBottomScroll();
  }
}

async function openChat(user) {
  state.activeChatUser = user;
  state.activeMessages = [];
  requestPrivateChatBottomOnOpen();
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
  document.body.classList.toggle('is-admin', Boolean(state.me?.isAdmin));
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
            ${badgeHtml(user)}
            ${user.lastSpamWarningReason ? `<small class="admin-warning-line">Seneste spam: ${escapeHtml(user.lastSpamWarningReason)}</small>` : ''}
            ${Number(user.warningCount) > 0 ? `<small class="admin-warning-line">Admin-advarsler: ${escapeHtml(user.warningCount)}${user.latestWarningReason ? ` · ${escapeHtml(user.latestWarningReason)}` : ''}</small>` : ''}
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
          <button class="ghost tiny" type="button" data-admin-warn="${escapeHtml(user.id)}" ${isMe || isProtectedAdmin ? 'disabled' : ''}>Advar</button>
          <button class="ghost tiny" type="button" data-admin-badges="${escapeHtml(user.id)}">Badges</button>
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
  if (item.kind === 'direct-message') return `${item.fromUser?.name || 'Ukendt'} → ${item.toUser?.name || 'Ukendt'} · Verified AI`;
  if (item.kind === 'global-message') return `${item.author?.name || 'Ukendt'} i global chat`;
  if (item.kind === 'global-comment') return `${item.author?.name || 'Ukendt'} skrev en historisk kommentar`;
  return item.author?.name || 'Ukendt';
}

function adminMessageMeta(item) {
  const parts = [item.source || item.label, formatTime(item.createdAt)];
  if (item.kind === 'direct-message') parts.push(item.verifiedAiEvidence ? 'privat · Verified AI' : 'privat');
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
      ? `${globalText} · ${formatNumber(privateCount)} private i alt · Verified AI kan læses`
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
    adminMessagesList.innerHTML = '<div class="empty admin-message-empty">Klik på “Indlæs beskeder” for at gennemgå globale beskeder og private beskeder fra Verified AI-brugere.</div>';
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
      ${item.verifiedAiEvidence ? '<p class="admin-parent-excerpt verified-ai-notice"><strong>Verified AI:</strong> Denne private besked er synlig, fordi afsenderen har badget Verified AI.</p>' : ''}
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


function renderFriendMiniCard(user, kind = 'friend') {
  if (!user) return '';
  const primaryAction = kind === 'incoming' ? 'accept' : kind === 'outgoing' ? 'decline' : 'remove';
  const secondary = kind === 'incoming' ? `<button class="ghost tiny" type="button" data-friend-action="decline" data-friend-user="${escapeHtml(user.id)}">Afvis</button>` : '';
  return `
    <article class="growth-user-card">
      ${avatarHtml(user)}
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>@${escapeHtml(user.username)} · ${escapeHtml(joinedDaysLabel(user))}</span>
        ${badgeHtml(user)}
      </div>
      <div class="inline-actions">
        <button class="secondary tiny" type="button" data-open-chat-user="${escapeHtml(user.id)}">Chat</button>
        <button class="ghost tiny" type="button" data-friend-action="${escapeHtml(primaryAction)}" data-friend-user="${escapeHtml(user.id)}">${primaryAction === 'accept' ? 'Acceptér' : primaryAction === 'decline' ? 'Annullér' : 'Fjern'}</button>
        ${secondary}
      </div>
    </article>
  `;
}

function bindGrowthPanelActions(root) {
  if (!root) return;
  root.querySelectorAll('[data-open-chat-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = [...state.users, ...state.friends, ...state.friendIncoming, ...state.friendOutgoing].find((candidate) => candidate.id === button.dataset.openChatUser);
      if (user) {
        switchAppView('private');
        openChat(user);
      }
    });
  });
  root.querySelectorAll('[data-friend-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await performFriendAction(button.dataset.friendUser, button.dataset.friendAction).catch((error) => showToast(error.message));
    });
  });
}

function renderFriends() {
  if (friendList) {
    friendList.innerHTML = state.friends.length ? state.friends.map((user) => renderFriendMiniCard(user, 'friend')).join('') : '<div class="empty small-empty">Du har ingen venner endnu.</div>';
    bindGrowthPanelActions(friendList);
  }
  if (friendIncomingList) {
    friendIncomingList.innerHTML = state.friendIncoming.length ? state.friendIncoming.map((user) => renderFriendMiniCard(user, 'incoming')).join('') : '<div class="empty small-empty">Ingen nye anmodninger.</div>';
    bindGrowthPanelActions(friendIncomingList);
  }
  if (friendOutgoingList) {
    friendOutgoingList.innerHTML = state.friendOutgoing.length ? state.friendOutgoing.map((user) => renderFriendMiniCard(user, 'outgoing')).join('') : '<div class="empty small-empty">Ingen sendte anmodninger.</div>';
    bindGrowthPanelActions(friendOutgoingList);
  }
}

async function loadFriends() {
  if (!friendsPanel) return;
  const data = await api('/api/friends');
  state.friends = data.friends || [];
  state.friendIncoming = data.incoming || [];
  state.friendOutgoing = data.outgoing || [];
  renderFriends();
}

async function performFriendAction(userId, action) {
  if (!userId || !action) return;
  let path = `/api/friends/${userId}/request`;
  let method = 'POST';
  if (action === 'accept') path = `/api/friends/${userId}/accept`;
  if (action === 'decline') path = `/api/friends/${userId}/decline`;
  if (action === 'remove') {
    path = `/api/friends/${userId}`;
    method = 'DELETE';
  }
  const data = await api(path, { method });
  if (data.user) mergeUpdatedPublicUser(data.user);
  await Promise.all([loadUsers($('#userSearch').value), loadFriends().catch(() => {})]);
  renderChat();
  showToast(data.status === 'friends' ? 'I er nu venner' : action === 'remove' ? 'Ven fjernet' : action === 'decline' ? 'Anmodning afvist/annulleret' : 'Venneanmodning sendt');
}

function renderNotifications() {
  updateNotificationBadge();
  if (!notificationsList) return;
  const unreadCount = state.notifications.filter((notification) => !notification.read).length;
  if (!state.notifications.length) {
    notificationsList.innerHTML = `
      <div class="notification-inbox-shell">
        <div class="notification-summary-card empty-summary">
          <div>
            <span class="notification-summary-icon">🔔</span>
          </div>
          <div>
            <strong>Ingen notifikationer endnu</strong>
            <p>Når nogen nævner dig, reagerer, sender en venneanmodning eller skriver privat, vises det her.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  notificationsList.innerHTML = `
    <div class="notification-inbox-shell">
      <div class="notification-summary-card">
        <div class="notification-summary-icon">🔔</div>
        <div class="notification-summary-copy">
          <strong>${escapeHtml(formatNumber(unreadCount))} ulæste</strong>
          <p>${escapeHtml(formatNumber(state.notifications.length))} notifikationer i alt</p>
        </div>
      </div>
      <div class="notification-feed">
        ${state.notifications.map((notification) => `
          <article class="notification-card ${notification.read ? 'is-read' : 'unread'}">
            <div class="notification-status-dot" aria-hidden="true"></div>
            <div class="notification-icon" aria-hidden="true">${escapeHtml(notificationTypeIcon(notification.type))}</div>
            <div class="notification-main">
              <div class="notification-topline">
                <strong>${escapeHtml(notification.title || 'TSN')}</strong>
                <time>${escapeHtml(formatExactDate(notification.createdAt))}</time>
              </div>
              <p>${escapeHtml(notification.body || '')}</p>
              <div class="notification-meta-row">
                <span class="notification-type-pill">${escapeHtml(notificationTypeLabel(notification.type))}</span>
                ${notification.read ? '<span class="notification-read-state">Læst</span>' : `<button class="notification-read-btn" type="button" data-read-notification="${escapeHtml(notification.id)}">Markér læst</button>`}
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  `;

  notificationsList.querySelectorAll('[data-read-notification]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api(`/api/notifications/${button.dataset.readNotification}/read`, { method: 'POST' });
      const item = state.notifications.find((notification) => notification.id === button.dataset.readNotification);
      if (item) item.read = true;
      state.unreadNotifications = state.notifications.filter((notification) => !notification.read).length;
      renderNotifications();
    });
  });
}

async function loadNotifications() {
  const data = await api('/api/notifications');
  state.notifications = data.notifications || [];
  state.unreadNotifications = Number(data.unreadCount) || state.notifications.filter((notification) => !notification.read).length;
  renderNotifications();
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
  await Promise.all([loadAdminUsers(), loadAdminReports(), loadAdminStats(), loadAdminRecoveryRequests().catch(() => {})]);
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


function renderHome() {
  if (!homePanel) return;
  const home = state.home || {};
  const stock = home.stock || {};
  const me = home.user || state.me || {};
  if (tsnsWidget) {
    const change = Number(stock.changePercent || 0);
    tsnsWidget.innerHTML = `<div class="tsns-price-line"><strong>${escapeHtml(formatNumber(stock.price || 100))}</strong><span class="trend-${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}">${change > 0 ? '+' : ''}${escapeHtml(change.toFixed ? change.toFixed(2) : change)}%</span></div><p>${escapeHtml(stock.disclaimer || 'TSN-S aktivitet baseret på TSN.')}</p><div class="mini-metrics"><span>${escapeHtml(stock.metrics?.onlineUsers || 0)} online</span><span>${escapeHtml(stock.metrics?.globalChatMessagesPerHour || 0)} global/t</span><span>${escapeHtml(stock.metrics?.privateMessagesPerHour || 0)} privat/t</span></div>`;
  }
  const homeProfile = $('#homeProfileCard');
  if (homeProfile) homeProfile.innerHTML = `${avatarHtml(me, 'large')}<div><strong>${escapeHtml(me.name || 'TSN')}</strong><span>@${escapeHtml(me.username || 'user')}</span><div class="xp-mini">Level ${escapeHtml(me.level || 1)} · ${escapeHtml(formatNumber(me.xp || 0))} XP · ${escapeHtml(me.loginStreak || 0)} dages streak</div>${badgeHtml(me)}</div>`;
  if (homeEventBox) homeEventBox.innerHTML = home.activeEvent ? renderEventCard(home.activeEvent) : '<div class="empty small-empty">Ingen aktive events endnu.</div>';
  if (homePollBox) homePollBox.innerHTML = home.activePoll ? renderPollCard(home.activePoll) : '<div class="empty small-empty">Ingen aktive afstemninger endnu.</div>';
  if (activityFeedList) {
    const items = Array.isArray(home.activity) ? home.activity : [];
    activityFeedList.innerHTML = items.length ? items.map((item) => `<article class="activity-feed-item"><span>${escapeHtml(activityIcon(item.type))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || '')}</p><small>${escapeHtml(formatTime(item.createdAt))}</small></div></article>`).join('') : '<div class="empty small-empty">Ingen aktivitet endnu.</div>';
  }
  renderLeaderboard(home.leaderboard || state.leaderboard || []);
}

function activityIcon(type) { return ({ 'global-chat': '🌐', 'private-chat': '💬', friend: '🤝', event: '⭐', poll: '📊', 'level-up': '🏆' })[String(type || '')] || '✨'; }

function renderLeaderboard(list = state.leaderboard) {
  if (!leaderboardList) return;
  const rows = Array.isArray(list) ? list : [];
  leaderboardList.innerHTML = rows.length ? rows.map((row, index) => `<article class="leaderboard-row"><span class="leaderboard-rank">#${index + 1}</span>${avatarHtml(row.user || 'TSN')}<div><strong>${escapeHtml(row.user?.name || 'Ukendt')}</strong><span>@${escapeHtml(row.user?.username || 'user')} · Level ${escapeHtml(row.level || 1)} · ${escapeHtml(formatNumber(row.xp || 0))} XP</span></div><em>${escapeHtml(formatNumber(row.score || row.xp || 0))}</em></article>`).join('') : '<div class="empty small-empty">Ingen leaderboard-data endnu.</div>';
}

function renderEventCard(event) {
  return `<article class="event-card ${event.joinedByMe ? 'joined' : ''}"><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.description || 'Ingen beskrivelse.')}</p></div><div class="event-meta"><span>${escapeHtml(event.startsAt ? formatExactDate(event.startsAt) : 'Ingen tid sat')}</span><span>${escapeHtml(event.participantCount || 0)} deltager${Number(event.participantCount) === 1 ? '' : 'e'}</span></div><button class="secondary tiny" type="button" data-join-event="${escapeHtml(event.id)}" ${event.joinedByMe ? 'disabled' : ''}>${event.joinedByMe ? 'Deltager' : 'Deltag'}</button></article>`;
}

function renderPollCard(poll) {
  const total = Math.max(1, Number(poll.totalVotes || 0));
  return `<article class="poll-card"><strong>${escapeHtml(poll.question)}</strong><div class="poll-options">${(poll.options || []).map((option) => { const pct = Math.round((Number(option.count || 0) / total) * 100); return `<button type="button" class="poll-option ${poll.myVote === option.id ? 'selected' : ''}" data-vote-poll="${escapeHtml(poll.id)}" data-option-id="${escapeHtml(option.id)}"><span>${escapeHtml(option.text)}</span><b>${escapeHtml(option.count || 0)}</b><i style="width:${pct}%"></i></button>`; }).join('')}</div><small>${escapeHtml(poll.totalVotes || 0)} stemmer${poll.votedByMe ? ' · du har stemt' : ''}</small></article>`;
}

function renderEventsAndPolls() {
  if (eventsList) eventsList.innerHTML = state.events.length ? state.events.map((event) => renderEventCard(event)).join('') : '<div class="empty small-empty">Ingen events endnu.</div>';
  if (pollsList) pollsList.innerHTML = state.polls.length ? state.polls.map((poll) => renderPollCard(poll)).join('') : '<div class="empty small-empty">Ingen afstemninger endnu.</div>';
}

async function loadHome() { const data = await api('/api/home'); state.home = data; if (data.user) state.me = { ...state.me, ...data.user }; renderHome(); renderMe(); }
async function loadLeaderboard() { const data = await api('/api/leaderboard'); state.leaderboard = data.leaderboard || []; renderLeaderboard(); }
async function loadEvents() { const data = await api('/api/events'); state.events = data.events || []; renderEventsAndPolls(); }
async function loadPolls() { const data = await api('/api/polls'); state.polls = data.polls || []; renderEventsAndPolls(); }
async function joinEvent(eventId) { const data = await api(`/api/events/${eventId}/join`, { method: 'POST' }); const event = data.event; state.events = state.events.map((item) => item.id === event.id ? event : item); if (state.home?.activeEvent?.id === event.id) state.home.activeEvent = event; renderEventsAndPolls(); renderHome(); showToast('Du deltager i eventet'); }
async function votePoll(pollId, optionId) { const data = await api(`/api/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) }); const poll = data.poll; state.polls = state.polls.map((item) => item.id === poll.id ? poll : item); if (state.home?.activePoll?.id === poll.id) state.home.activePoll = poll; renderEventsAndPolls(); renderHome(); showToast('Stemme gemt'); }
async function createEventFromForm(form) { const data = await api('/api/events', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, description: form.elements.description.value, startsAt: form.elements.startsAt.value }) }); state.events = [data.event, ...state.events.filter((event) => event.id !== data.event.id)]; form.reset(); renderEventsAndPolls(); showToast('Event oprettet'); }
async function createPollFromForm(form) { const options = form.elements.options.value.split('\n').map((line) => line.trim()).filter(Boolean); const data = await api('/api/polls', { method: 'POST', body: JSON.stringify({ question: form.elements.question.value, options }) }); state.polls = [data.poll, ...state.polls.filter((poll) => poll.id !== data.poll.id)]; form.reset(); renderEventsAndPolls(); showToast('Afstemning oprettet'); }

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
  await Promise.all([loadMediaLibrary().catch(() => {}), loadGlobalMessages(), loadUsers($('#userSearch').value), loadFriends().catch(() => {}), loadHome().catch(() => {}), loadLeaderboard().catch(() => {}), loadEvents().catch(() => {}), loadPolls().catch(() => {}), loadRecoveryRequests().catch(() => {})]);
  if (state.me?.isAdmin) {
    await loadAdminDashboard();
    renderAdminMessageViewer();
    renderAdminReportViewer();
  }
}

function stopRingtone() {
  const tone = state.ringtone;
  if (!tone) return;
  try { clearInterval(tone.interval); } catch {}
  try { tone.oscillator?.stop?.(); } catch {}
  try { tone.gain?.disconnect?.(); } catch {}
  state.ringtone = null;
}

function startRingtone() {
  stopRingtone();
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    gain.connect(audioContext.destination);
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    oscillator.start();
    const pulse = () => {
      const now = audioContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.setValueAtTime(660, now + 0.16);
    };
    pulse();
    const interval = setInterval(pulse, 900);
    state.ringtone = { audioContext, oscillator, gain, interval };
  } catch (error) {
    console.warn('Ringtone unavailable:', error);
  }
}

function clearCallTimers() {
  clearTimeout(state.outgoingCallTimeout);
  clearTimeout(state.incomingCallTimeout);
  clearInterval(state.callTimerInterval);
  state.outgoingCallTimeout = null;
  state.incomingCallTimeout = null;
  state.callTimerInterval = null;
}

function armOutgoingCallTimeout(callId) {
  clearTimeout(state.outgoingCallTimeout);
  state.outgoingCallTimeout = setTimeout(() => {
    const current = state.call;
    if (!current || current.callId !== callId || current.active || current.incoming) return;
    showToast(`${callPeerName(current.peer)} svarede ikke.`);
    cleanupCall({ notify: true, reason: 'Opkaldet udløb efter 30 sekunder uden svar.' });
  }, 30000);
}

function armIncomingCallTimeout(callId) {
  clearTimeout(state.incomingCallTimeout);
  state.incomingCallTimeout = setTimeout(() => {
    const current = state.call;
    if (!current || current.callId !== callId || !current.incoming || current.active) return;
    state.socket?.emit('call-response', { to: current.peerId, callId: current.callId, accepted: false, reason: 'Intet svar' });
    showToast('Opkaldet udløb efter 30 sekunder.');
    cleanupCall();
  }, 30000);
}

const DEFAULT_CALL_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
];

async function loadCallConfig({ force = false } = {}) {
  if (!state.token) return null;
  if (state.callConfig && !force) return state.callConfig;
  if (state.callConfigLoading && !force) return state.callConfigLoading;
  state.callConfigLoading = api('/api/call-config')
    .then((data) => {
      const iceServers = Array.isArray(data.iceServers) && data.iceServers.length ? data.iceServers : DEFAULT_CALL_ICE_SERVERS;
      state.callConfig = { ...data, iceServers };
      return state.callConfig;
    })
    .catch((error) => {
      console.warn('Call config failed to load:', error.message);
      state.callConfig = {
        iceServers: DEFAULT_CALL_ICE_SERVERS,
        turnEnabled: false,
        mode: 'stun-only',
        note: 'Fallback til public STUN. Tilføj TURN på Render for bedre cross-network opkald.'
      };
      return state.callConfig;
    })
    .finally(() => {
      state.callConfigLoading = null;
    });
  return state.callConfigLoading;
}

function callIceServers() {
  return Array.isArray(state.callConfig?.iceServers) && state.callConfig.iceServers.length
    ? state.callConfig.iceServers
    : DEFAULT_CALL_ICE_SERVERS;
}

function callNetworkLabel() {
  return state.callConfig?.turnEnabled
    ? 'Netværk: STUN + TURN · virker bedst på forskellige netværk'
    : 'Netværk: Public STUN · tilføj TURN for streng NAT/mobilnet';
}

function callPeerName(peerIdOrUser) {
  if (!peerIdOrUser) return 'Ukendt bruger';
  if (typeof peerIdOrUser === 'object') return peerIdOrUser.name || peerIdOrUser.username || 'Ukendt bruger';
  const id = String(peerIdOrUser);
  if (state.activeChatUser?.id === id) return state.activeChatUser.name;
  return state.users.find((user) => user.id === id)?.name || 'Ukendt bruger';
}

function updateCallTimer() {
  if (!callTimerText || !state.call?.startedAt) return;
  const elapsed = Math.max(0, Date.now() - state.call.startedAt);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  callTimerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startCallTimer() {
  if (!state.call) return;
  if (!state.call.startedAt) state.call.startedAt = Date.now();
  updateCallTimer();
  clearInterval(state.callTimerInterval);
  state.callTimerInterval = setInterval(updateCallTimer, 1000);
}

function stopCallTimer() {
  clearInterval(state.callTimerInterval);
  state.callTimerInterval = null;
  if (callTimerText) callTimerText.textContent = '00:00';
}

function setCallStatusText(text, quality = '') {
  if (callStatusText && text) callStatusText.textContent = text;
  if (callQualityText && quality) callQualityText.textContent = quality;
}

function syncCallDockButton() {
  if (!callOverlay || !callFullscreenBtn) return;
  const expanded = callOverlay.classList.contains('call-expanded');
  callFullscreenBtn.textContent = expanded ? 'Tilbage til bjælke' : 'Pop frem';
  callFullscreenBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  callFullscreenBtn.setAttribute('aria-label', expanded ? 'Minimer opkald til bundbjælke' : 'Pop opkald frem');
}

function setCallUi({ title, status, incoming = false, active = false, kind = 'voice', peerName = '', quality = '' } = {}) {
  if (!callOverlay) return;
  const wasExpanded = callOverlay.classList.contains('call-expanded');
  callOverlay.classList.remove('hidden');
  callOverlay.classList.toggle('call-is-incoming', Boolean(incoming));
  callOverlay.classList.toggle('call-is-active', Boolean(active));
  callOverlay.classList.toggle('call-is-outgoing', !incoming && !active);
  callOverlay.classList.toggle('call-is-video', kind === 'video');
  callOverlay.classList.toggle('call-is-voice', kind !== 'video');

  if (incoming) {
    callOverlay.classList.remove('call-minimized', 'call-expanded');
  } else if (active) {
    callOverlay.classList.toggle('call-expanded', wasExpanded);
    callOverlay.classList.toggle('call-minimized', !wasExpanded);
  } else {
    callOverlay.classList.remove('call-minimized');
  }

  if (callEyebrow) callEyebrow.textContent = incoming
    ? (kind === 'video' ? 'Indgående videoopkald' : 'Indgående stemmeopkald')
    : (kind === 'video' ? 'TSN videoopkald' : 'TSN stemmeopkald');
  if (callTitle) callTitle.textContent = title || 'Opkald';
  if (callStatusText) callStatusText.textContent = status || '';
  if (callTypeBadge) callTypeBadge.textContent = kind === 'video' ? 'Video' : 'Stemme';
  if (callNetworkText) callNetworkText.textContent = callNetworkLabel();
  if (callQualityText) callQualityText.textContent = quality || (active ? 'Forbinder...' : incoming ? 'Venter på svar' : 'Ringer op');
  if (incomingCallActions) incomingCallActions.classList.toggle('hidden', !incoming);
  if (activeCallActions) activeCallActions.classList.toggle('hidden', !active);
  if (remoteAudioAvatar) remoteAudioAvatar.textContent = initials(peerName || 'TSN');
  if (remoteCallName) remoteCallName.textContent = peerName || 'Ukendt bruger';
  if (localAudioAvatar) localAudioAvatar.textContent = initials(state.me?.name || 'Mig');
  callOverlay.classList.toggle('is-video-call', kind === 'video');
  syncCallDockButton();
}

function closeCallUi() {
  if (callOverlay) {
    callOverlay.classList.add('hidden');
    callOverlay.classList.remove('call-is-incoming', 'call-is-active', 'call-is-outgoing', 'is-video-call', 'call-is-video', 'call-is-voice', 'call-expanded', 'call-minimized');
  }
  if (incomingCallActions) incomingCallActions.classList.add('hidden');
  if (activeCallActions) activeCallActions.classList.add('hidden');
  if (callStatusText) callStatusText.textContent = '';
  if (callQualityText) callQualityText.textContent = '';
  syncCallDockButton();
  stopCallTimer();
}

function emptyCallMediaResult(reason) {
  return {
    stream: new MediaStream(),
    fallback: true,
    fallbackReason: reason || 'Mikrofon/kamera kunne ikke åbnes. Opkaldet fortsætter uden lokal lyd/video.',
    hasAudio: false,
    hasVideo: false
  };
}

async function getCallMedia(kind) {
  const wantsVideo = kind === 'video';
  if (!navigator.mediaDevices?.getUserMedia) {
    return emptyCallMediaResult('Din browser gav ikke adgang til mikrofon/kamera. Opkaldet fortsætter i fallback-mode. Brug HTTPS/Render for rigtige opkald.');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    });
    return {
      stream,
      fallback: false,
      fallbackReason: '',
      hasAudio: stream.getAudioTracks().length > 0,
      hasVideo: stream.getVideoTracks().length > 0
    };
  } catch (firstError) {
    if (wantsVideo) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        return {
          stream: audioOnly,
          fallback: true,
          fallbackReason: 'Kameraet kunne ikke åbnes. Opkaldet fortsætter som lydopkald.',
          hasAudio: audioOnly.getAudioTracks().length > 0,
          hasVideo: false
        };
      } catch (secondError) {
        return emptyCallMediaResult('Mikrofon/kamera blev blokeret eller kunne ikke åbnes. Opkaldet fortsætter uden lokal lyd/video.');
      }
    }
    return emptyCallMediaResult('Mikrofonen blev blokeret eller kunne ikke åbnes. Opkaldet fortsætter uden lokal lyd.');
  }
}

function setLocalStream(stream) {
  if (localVideo) {
    localVideo.srcObject = stream || null;
    localVideo.classList.toggle('hidden', !stream || !stream.getVideoTracks().some((track) => track.enabled));
  }
}

function setRemoteStream(stream) {
  if (remoteVideo) {
    remoteVideo.srcObject = stream || null;
    remoteVideo.classList.toggle('hidden', !stream || !stream.getVideoTracks().length);
  }
}

function cleanupCall({ notify = false, reason = 'Opkald afsluttet.' } = {}) {
  const current = state.call;
  if (notify && current?.peerId && state.socket) {
    state.socket.emit('call-ended', { to: current.peerId, callId: current.callId, reason });
  }
  try { current?.pc?.close(); } catch {}
  current?.localStream?.getTracks().forEach((track) => track.stop());
  setLocalStream(null);
  setRemoteStream(null);
  state.call = null;
  clearCallTimers();
  closeCallUi();
}

async function applyQueuedIceCandidates(call = state.call) {
  if (!call?.pc || !Array.isArray(call.pendingIceCandidates) || !call.pendingIceCandidates.length) return;
  if (!call.pc.remoteDescription?.type) return;
  const queue = call.pendingIceCandidates.splice(0);
  for (const candidate of queue) {
    try {
      await call.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('Queued ICE candidate failed:', error);
    }
  }
}

async function addRemoteIceCandidate(candidate) {
  const current = state.call;
  if (!current || !candidate) return;
  current.pendingIceCandidates = Array.isArray(current.pendingIceCandidates) ? current.pendingIceCandidates : [];
  if (!current.pc || !current.pc.remoteDescription?.type) {
    current.pendingIceCandidates.push(candidate);
    return;
  }
  try {
    await current.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    current.pendingIceCandidates.push(candidate);
    console.warn('ICE candidate failed and was queued:', error);
  }
}

function createCallPeer(peerId, callId, { initiator = false } = {}) {
  const pc = new RTCPeerConnection({ iceServers: callIceServers(), iceCandidatePoolSize: 6 });
  if (initiator) {
    try {
      const channel = pc.createDataChannel('tsn-call-control');
      channel.onopen = () => {};
      channel.onerror = () => {};
    } catch {}
  }
  pc.ondatachannel = (event) => {
    if (event.channel) {
      event.channel.onmessage = () => {};
      event.channel.onerror = () => {};
    }
  };
  pc.onicecandidate = (event) => {
    if (event.candidate && state.socket) {
      state.socket.emit('call-signal', { to: peerId, callId, signal: { candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
    }
  };
  pc.ontrack = (event) => {
    const stream = event.streams?.[0];
    if (stream) {
      setRemoteStream(stream);
      setCallStatusText('Lyd/video er forbundet', 'Modtager stream');
    }
  };
  pc.oniceconnectionstatechange = () => {
    if (!state.call || state.call.callId !== callId) return;
    const iceState = pc.iceConnectionState;
    const label = iceState === 'connected' || iceState === 'completed'
      ? (state.callConfig?.turnEnabled ? 'Forbundet via internet/TURN klar' : 'Forbundet via internet/STUN')
      : iceState === 'checking'
        ? 'Finder bedste netværksrute...'
        : iceState === 'failed'
          ? 'Forbindelsen fejlede. Tilføj TURN på Render for streng NAT.'
          : `ICE: ${iceState}`;
    if (iceState === 'connected' || iceState === 'completed') startCallTimer();
    setCallStatusText(label, iceState === 'failed' ? 'Netværksfejl' : `ICE ${iceState}`);
  };
  pc.onconnectionstatechange = () => {
    if (!state.call || state.call.callId !== callId) return;
    const stateText = pc.connectionState;
    if (stateText === 'connected') {
      startCallTimer();
      setCallStatusText('Forbundet', state.callConfig?.turnEnabled ? 'Stabil cross-network' : 'Forbundet med STUN');
    } else if (stateText === 'connecting') {
      setCallStatusText('Forbinder...', 'Opretter krypteret WebRTC-forbindelse');
    } else if (['failed', 'closed', 'disconnected'].includes(stateText)) {
      setCallStatusText(stateText === 'failed' ? 'Forbindelsen fejlede' : `Status: ${stateText}`, stateText === 'failed' ? 'Prøv igen eller konfigurer TURN' : 'Forbindelsen ændrede status');
      if (stateText === 'failed') showToast('Opkaldet mistede forbindelsen. Tilføj TURN-server for bedste stabilitet udenfor samme netværk.');
    }
  };
  return pc;
}

async function startCall(kind = 'voice') {
  if (!state.socket || !state.activeChatUser) return showToast('Åbn en privat chat først.');
  if (!state.activeChatUser.online) return showToast('Brugeren skal være online for at ringe.');
  cleanupCall();
  await loadCallConfig();
  const peer = state.activeChatUser;
  const callId = `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    const media = await getCallMedia(kind);
    const localStream = media.stream;
    setLocalStream(localStream);
    const pc = createCallPeer(peer.id, callId, { initiator: true });
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    state.call = { callId, kind, peerId: peer.id, peer, pc, localStream, mediaFallback: media.fallback, incoming: false, active: false, pendingIceCandidates: [] };
    if (media.fallback) showToast(media.fallbackReason);
    setCallUi({ title: `Ringer til ${peer.name}`, status: media.fallback ? `${media.fallbackReason} Venter på svar...` : 'Venter på svar...', kind, peerName: peer.name, active: true, quality: callNetworkLabel() });
    armOutgoingCallTimeout(callId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === 'video' });
    await pc.setLocalDescription(offer);
    state.socket.emit('call-user', { to: peer.id, kind, callId, offer: pc.localDescription }, (response) => {
      if (!response?.ok) {
        showToast(response?.error || 'Kunne ikke starte opkald.');
        cleanupCall();
      }
    });
  } catch (error) {
    showToast(error?.message || 'Kunne ikke starte opkald.');
    cleanupCall();
  }
}

function showIncomingCall(payload) {
  if (!payload?.from?.id || !payload.callId) return;
  if (state.call) {
    state.socket?.emit('call-response', { to: payload.from.id, callId: payload.callId, accepted: false, reason: 'Optaget' });
    return;
  }
  loadCallConfig().catch(() => {});
  state.call = { callId: payload.callId, kind: payload.kind || 'voice', peerId: payload.from.id, peer: payload.from, offer: payload.offer, incoming: true, active: false, pc: null, localStream: null, pendingIceCandidates: [] };
  setCallUi({ title: `${payload.from.name || payload.from.username || 'En bruger'} ringer`, status: 'Indgående opkald · svar inden 30 sekunder', incoming: true, kind: payload.kind || 'voice', peerName: callPeerName(payload.from), quality: 'Klar til at forbinde' });
  startRingtone();
  armIncomingCallTimeout(payload.callId);
}

async function acceptIncomingCall() {
  stopRingtone();
  clearTimeout(state.incomingCallTimeout);
  state.incomingCallTimeout = null;
  const current = state.call;
  if (!current?.incoming || !current.offer) return;
  try {
    await loadCallConfig();
    const media = await getCallMedia(current.kind);
    const localStream = media.stream;
    setLocalStream(localStream);
    const pc = createCallPeer(current.peerId, current.callId);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    current.pc = pc;
    current.localStream = localStream;
    current.mediaFallback = media.fallback;
    current.active = true;
    if (media.fallback) showToast(media.fallbackReason);
    await pc.setRemoteDescription(new RTCSessionDescription(current.offer));
    await applyQueuedIceCandidates(current);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    state.socket.emit('call-response', { to: current.peerId, callId: current.callId, accepted: true, answer: pc.localDescription, mediaFallback: media.fallback });
    setCallUi({ title: `Opkald med ${callPeerName(current.peer)}`, status: media.fallback ? `${media.fallbackReason} Forbinder...` : 'Forbinder...', active: true, kind: current.kind, peerName: callPeerName(current.peer), quality: callNetworkLabel() });
  } catch (error) {
    showToast(error?.message || 'Kunne ikke acceptere opkald.');
    state.socket?.emit('call-response', { to: current.peerId, callId: current.callId, accepted: false, reason: 'Teknisk fejl' });
    cleanupCall();
  }
}

function declineIncomingCall() {
  stopRingtone();
  clearTimeout(state.incomingCallTimeout);
  state.incomingCallTimeout = null;
  const current = state.call;
  if (current?.incoming && current.peerId) {
    state.socket?.emit('call-response', { to: current.peerId, callId: current.callId, accepted: false, reason: 'Afvist' });
  }
  cleanupCall();
}

async function handleCallResponse(payload) {
  const current = state.call;
  if (!current || current.callId !== payload?.callId) return;
  if (!payload.accepted) {
    showToast(payload.reason || 'Opkaldet blev afvist.');
    cleanupCall();
    return;
  }
  try {
    clearTimeout(state.outgoingCallTimeout);
    state.outgoingCallTimeout = null;
    if (payload.answer && current.pc) {
      await current.pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
      await applyQueuedIceCandidates(current);
      current.active = true;
      setCallUi({ title: `Opkald med ${callPeerName(current.peer)}`, status: payload.mediaFallback ? `${callPeerName(current.peer)} bruger fallback uden fuld mikrofon/kamera. Forbinder...` : 'Forbinder...', active: true, kind: current.kind, peerName: callPeerName(current.peer), quality: callNetworkLabel() });
    }
  } catch (error) {
    showToast('Kunne ikke forbinde opkaldet.');
    cleanupCall({ notify: true, reason: 'Teknisk fejl' });
  }
}

async function handleCallSignal(payload) {
  const current = state.call;
  if (!current || current.callId !== payload?.callId || !payload.signal) return;
  try {
    if (payload.signal.candidate) await addRemoteIceCandidate(payload.signal.candidate);
  } catch (error) {
    console.warn('Call signal failed:', error);
  }
}

function toggleCallMute() {
  const current = state.call;
  const audio = current?.localStream?.getAudioTracks?.()[0];
  if (!audio) return showToast('Der er ingen mikrofon aktiv i dette opkald.');
  audio.enabled = !audio.enabled;
  if (muteCallBtn) muteCallBtn.textContent = audio.enabled ? '🎙️ Mikrofon fra' : '🔇 Mikrofon til';
}

function toggleCallCamera() {
  const current = state.call;
  const video = current?.localStream?.getVideoTracks?.()[0];
  if (!video) return showToast('Der er intet kamera aktivt i dette opkald.');
  video.enabled = !video.enabled;
  if (cameraCallBtn) cameraCallBtn.textContent = video.enabled ? '📷 Kamera fra' : '📷 Kamera til';
  setLocalStream(current.localStream);
}

function toggleCallFullscreen() {
  if (!callOverlay) return;
  const shouldExpand = !callOverlay.classList.contains('call-expanded');
  callOverlay.classList.toggle('call-expanded', shouldExpand);
  callOverlay.classList.toggle('call-minimized', !shouldExpand && !callOverlay.classList.contains('call-is-incoming'));
  syncCallDockButton();
}

if (startVoiceCallBtn) startVoiceCallBtn.addEventListener('click', () => startCall('voice'));
if (startVideoCallBtn) startVideoCallBtn.addEventListener('click', () => startCall('video'));
if (acceptCallBtn) acceptCallBtn.addEventListener('click', acceptIncomingCall);
if (declineCallBtn) declineCallBtn.addEventListener('click', declineIncomingCall);
if (endCallBtn) endCallBtn.addEventListener('click', () => cleanupCall({ notify: true, reason: 'Opkald afsluttet' }));
if (closeCallBtn) closeCallBtn.addEventListener('click', () => cleanupCall({ notify: true, reason: 'Opkald lukket' }));
if (callFullscreenBtn) callFullscreenBtn.addEventListener('click', toggleCallFullscreen);
if (muteCallBtn) muteCallBtn.addEventListener('click', toggleCallMute);
if (cameraCallBtn) cameraCallBtn.addEventListener('click', toggleCallCamera);

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
    if (mentionsCurrentUser(message)) {
      state.globalMentionCount += 1;
      state.lastGlobalPingBy = message.author?.name || message.author?.username || 'en bruger';
      updateContextBadges();
      showGlobalPingBanner(state.lastGlobalPingBy);
    }
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
      const wasNearBottom = isElementNearBottom(messagesList);
      if (!exists) state.activeMessages.push(message);
      renderChat({ forceBottom: message.from === state.me?.id || wasNearBottom });
      if (message.to === state.me.id) markConversationRead(message.from).catch(() => {});
    } else if (message.to === state.me.id) {
      const sender = state.users.find((user) => user.id === message.from);
      if (!incrementUnreadForUser(message.from)) {
        loadUsers($('#userSearch').value).catch(() => {});
      } else {
        renderUsers();
      }
      updateContextBadges();
      showToast(`Ny privat besked fra ${sender?.name || 'en person'}`);
    }
  });

  state.socket.on('messages-read', ({ userId, unreadCount, conversationId, readByUserId, readMessageIds }) => {
    setUnreadForUser(userId, unreadCount || 0);
    const changed = markMessagesReadLocally({ conversationId, readByUserId, readMessageIds });
    renderUsers();
    updateContextBadges();
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


  state.socket.on('notification', (notification) => {
    if (!notification?.id) return;
    state.notifications = [notification, ...state.notifications.filter((item) => item.id !== notification.id)].slice(0, 80);
    state.unreadNotifications = state.notifications.filter((item) => !item.read).length;
    updateContextBadges();
    if (notification.type === 'mention') {
      showGlobalPingBanner(notification.actor?.name || notification.from?.name || notification.title || 'en bruger');
    } else if (notification.type === 'private') {
      showToast(notification.title || 'Ny privat besked');
    } else if (notification.type === 'account-recovery') {
      showToast(notification.title || 'Ny kontogendannelsesanmodning');
      if (state.me?.isAdmin) loadAdminRecoveryRequests().catch(() => {});
    }
  });

  state.socket.on('user-profile-updated', (user) => {
    mergeUpdatedPublicUser(user);
    rerenderAfterProfileUpdate();
    loadFriends().catch(() => {});
  });

  state.socket.on('account-merged', async ({ primaryUser, secondaryUserId, secondaryUsername, movedMessages } = {}) => {
    if (primaryUser) mergeUpdatedPublicUser(primaryUser);
    if (state.activeChatUser?.id === secondaryUserId && primaryUser) {
      state.activeChatUser = primaryUser;
      state.activeMessages = [];
      requestPrivateChatBottomOnOpen();
      try {
        const data = await api(`/api/messages/${primaryUser.id}`);
        state.activeChatUser = data.user || primaryUser;
        state.activeMessages = data.messages || [];
      } catch {}
    }
    await loadUsers($('#userSearch')?.value || '').catch(() => {});
    renderChat({ forceBottom: true });
    if (secondaryUserId !== state.me?.id) {
      showToast(`${secondaryUsername || 'En konto'} er sammenlagt. ${Number(movedMessages || 0)} beskeder er flyttet.`);
    }
  });

  state.socket.on('private-message-updated', (message) => {
    if (!message?.id) return;
    const index = state.activeMessages.findIndex((candidate) => candidate.id === message.id);
    if (index >= 0) {
      state.activeMessages[index] = message;
      renderChat();
    }
  });


  state.socket.on('growth-updated', () => {
    loadHome().catch(() => {});
    if (appScreen.dataset.view === 'events') {
      loadEvents().catch(() => {});
      loadPolls().catch(() => {});
      loadLeaderboard().catch(() => {});
    }
  });

  state.socket.on('incoming-call', (payload) => {
    showIncomingCall(payload);
  });

  state.socket.on('call-response', (payload) => {
    handleCallResponse(payload).catch(() => showToast('Opkaldet kunne ikke forbindes.'));
  });

  state.socket.on('call-signal', (payload) => {
    handleCallSignal(payload).catch(() => {});
  });

  state.socket.on('call-ended', ({ reason }) => {
    if (state.call) showToast(reason || 'Opkaldet blev afsluttet.');
    cleanupCall();
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
    state.pendingRecoveryMerge = meData.recoveryMerge || null;
    renderMe();
    showApp();
    connectSocket();
    loadCallConfig().catch(() => {});
  } catch (error) {
    setToken(null);
    showAuth();
    throw new Error(error?.message || 'Login fejlede. Prøv igen.');
  }

  try {
    await loadEverything();
    if (state.pendingRecoveryMerge) showRecoveryMergeModal(state.pendingRecoveryMerge);
    else await checkPendingRecoveryMerge();
  } catch (error) {
    console.error('TSN blev indlæst, men noget appdata kunne ikke indlæses:', error);
    showToast(error?.message ? `Logget ind. Noget data kunne ikke indlæses: ${error.message}` : 'Logget ind. Noget data kunne ikke indlæses.');
  }
}



document.addEventListener('click', async (event) => {
  const joinButton = event.target.closest('[data-join-event]');
  if (joinButton) {
    joinButton.disabled = true;
    try { await joinEvent(joinButton.dataset.joinEvent); }
    catch (error) { showToast(error.message); joinButton.disabled = false; }
    return;
  }
  const voteButton = event.target.closest('[data-vote-poll]');
  if (voteButton) {
    try { await votePoll(voteButton.dataset.votePoll, voteButton.dataset.optionId); }
    catch (error) { showToast(error.message); }
  }
});

const refreshHomeBtn = $('#refreshHomeBtn');
if (refreshHomeBtn) refreshHomeBtn.addEventListener('click', () => Promise.all([loadHome(), loadLeaderboard(), loadEvents(), loadPolls()]).catch((error) => showToast(error.message)));
const refreshGrowthBtn = $('#refreshGrowthBtn');
if (refreshGrowthBtn) refreshGrowthBtn.addEventListener('click', () => Promise.all([loadEvents(), loadPolls(), loadLeaderboard()]).catch((error) => showToast(error.message)));
const createEventForm = $('#createEventForm');
if (createEventForm) createEventForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await createEventFromForm(createEventForm); } catch (error) { showToast(error.message); } });
const createPollForm = $('#createPollForm');
if (createPollForm) createPollForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await createPollFromForm(createPollForm); } catch (error) { showToast(error.message); } });

const refreshFriendsBtn = $('#refreshFriendsBtn');
if (refreshFriendsBtn) {
  refreshFriendsBtn.addEventListener('click', () => loadFriends().catch((error) => showToast(error.message)));
}

const refreshNotificationsBtn = $('#refreshNotificationsBtn');
if (refreshNotificationsBtn) {
  refreshNotificationsBtn.addEventListener('click', () => loadNotifications().catch((error) => showToast(error.message)));
}

const markNotificationsReadBtn = $('#markNotificationsReadBtn');
if (markNotificationsReadBtn) {
  markNotificationsReadBtn.addEventListener('click', async () => {
    await api('/api/notifications/read-all', { method: 'POST' });
    state.notifications.forEach((notification) => { notification.read = true; });
    state.unreadNotifications = 0;
    renderNotifications();
    showToast('Notifikationer markeret som læst');
  });
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
