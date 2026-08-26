/**
 * NEXUS OS
 * Client Application Layer
 *
 * Nexus Buildsolutions Limited
 *
 * Responsibilities:
 * - Application bootstrapping
 * - Client state management
 * - Navigation
 * - REST API communication
 * - Authentication state
 * - Socket.IO realtime communication
 * - Connection/reconnection management
 * - Notifications
 * - Activity feed
 * - Global search
 * - Command panel
 * - Modals
 * - Sidebar/drawers
 * - User menu
 * - Offline detection
 * - Toast/system messaging
 * - Accessibility helpers
 *
 * This file intentionally contains no fake API data.
 * Server-provided data is treated as authoritative.
 */

const NEXUS = Object.freeze({
  name: "NEXUS OS",
  version: "1.0.0",
  apiBase: "/api",
  socketPath: "/socket.io",
  requestTimeout: 15000,
  reconnectDelay: 3000,
  maxReconnectAttempts: Infinity,
});

/* ============================================================
   DOM HELPERS
   ============================================================ */

const $ = (selector, root = document) => root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

const byId = (id) => document.getElementById(id);

const isElement = (value) => value instanceof Element;

const safeText = (value) =>
  value === null || value === undefined ? "" : String(value);

/* ============================================================
   APPLICATION STATE
   ============================================================ */

const state = {
  initialized: false,

  route: window.location.pathname || "/",

  user: null,
  authenticated: false,

  system: {
    status: "checking",
    database: "unknown",
    realtime: "connecting",
    services: "checking",
  },

  socket: {
    instance: null,
    connected: false,
    connecting: false,
    authenticated: false,
    reconnectAttempts: 0,
  },

  notifications: {
    items: [],
    unreadCount: 0,
  },

  activity: {
    items: [],
    loading: false,
  },

  search: {
    query: "",
    loading: false,
    results: [],
  },

  ui: {
    sidebarOpen: false,
    notificationsOpen: false,
    userMenuOpen: false,
    quickCreateOpen: false,
    commandPanelOpen: false,
  },

  request: {
    active: 0,
  },

  abortControllers: new Map(),
};

/* ============================================================
   APPLICATION EVENTS
   ============================================================ */

const events = new EventTarget();

function emit(name, detail = {}) {
  events.dispatchEvent(
    new CustomEvent(name, {
      detail,
    }),
  );
}

function on(name, callback) {
  events.addEventListener(name, callback);
  return () => events.removeEventListener(name, callback);
}

/* ============================================================
   STORAGE
   ============================================================ */

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

/* ============================================================
   CSRF / REQUEST HELPERS
   ============================================================ */

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = decodeURIComponent(cookie.slice(0, separatorIndex));

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(cookie.slice(separatorIndex + 1));
  }

  return null;
}

function getCsrfToken() {
  return (
    document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content") || getCookie("csrf-token")
  );
}

/* ============================================================
   API CLIENT
   ============================================================ */

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  buildUrl(path) {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${this.baseUrl}${normalizedPath}`;
  }

  async request(path, options = {}) {
    const {
      method = "GET",
      body,
      headers = {},
      timeout = NEXUS.requestTimeout,
      signal,
      ...fetchOptions
    } = options;

    const controller = new AbortController();

    const timeoutId = window.setTimeout(
      () => controller.abort(),
      timeout,
    );

    const requestId =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const csrfToken = getCsrfToken();

    const requestHeaders = new Headers(headers);

    requestHeaders.set("Accept", "application/json");

    requestHeaders.set("X-Requested-With", "XMLHttpRequest");

    requestHeaders.set("X-Request-ID", requestId);

    if (csrfToken) {
      requestHeaders.set("X-CSRF-Token", csrfToken);
    }

    let requestBody = body;

    if (
      body &&
      typeof body === "object" &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer)
    ) {
      requestHeaders.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }

    if (signal) {
      signal.addEventListener(
        "abort",
        () => controller.abort(),
        { once: true },
      );
    }

    state.request.active += 1;

    emit("request:start", {
      method,
      path,
      requestId,
    });

    try {
      const response = await fetch(this.buildUrl(path), {
        ...fetchOptions,
        method,
        headers: requestHeaders,
        body: requestBody,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      const contentType =
        response.headers.get("content-type") || "";

      let payload = null;

      if (contentType.includes("application/json")) {
        payload = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => "");
        payload = text || null;
      }

      if (!response.ok) {
        const error = new ApiError(
          payload?.message ||
            payload?.error?.message ||
            `Request failed with status ${response.status}.`,
          response.status,
          payload,
        );

        if (response.status === 401) {
          emit("auth:unauthorized", {
            response,
            payload,
          });
        }

        throw error;
      }

      emit("request:success", {
        method,
        path,
        requestId,
        status: response.status,
      });

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ApiError(
          "The request timed out or was cancelled.",
          408,
        );
      }

      if (
        error instanceof TypeError ||
        error?.message?.toLowerCase().includes("failed to fetch")
      ) {
        emit("network:error", {
          error,
          path,
        });
      }

      emit("request:error", {
        method,
        path,
        requestId,
        error,
      });

      throw error;
    } finally {
      window.clearTimeout(timeoutId);

      state.request.active = Math.max(
        0,
        state.request.active - 1,
      );

      emit("request:end", {
        method,
        path,
        requestId,
      });
    }
  }

  get(path, options = {}) {
    return this.request(path, {
      ...options,
      method: "GET",
    });
  }

  post(path, body, options = {}) {
    return this.request(path, {
      ...options,
      method: "POST",
      body,
    });
  }

  put(path, body, options = {}) {
    return this.request(path, {
      ...options,
      method: "PUT",
      body,
    });
  }

  patch(path, body, options = {}) {
    return this.request(path, {
      ...options,
      method: "PATCH",
      body,
    });
  }

  delete(path, options = {}) {
    return this.request(path, {
      ...options,
      method: "DELETE",
    });
  }
}

class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const api = new ApiClient(NEXUS.apiBase);

/* ============================================================
   UI STATE
   ============================================================ */

function setHidden(element, hidden) {
  if (!element) {
    return;
  }

  element.hidden = hidden;

  if (hidden) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
}

function toggleBodyLock(locked) {
  document.documentElement.classList.toggle(
    "is-scroll-locked",
    locked,
  );
}

function closeAllOverlays(except = null) {
  if (except !== "notifications") {
    closeNotifications();
  }

  if (except !== "user-menu") {
    closeUserMenu();
  }

  if (except !== "quick-create") {
    closeQuickCreate();
  }

  if (except !== "command-panel") {
    closeCommandPanel();
  }
}

/* ============================================================
   SIDEBAR
   ============================================================ */

function openSidebar() {
  const sidebar = byId("app-sidebar");
  const overlay = byId("sidebar-overlay");
  const toggle = byId("sidebar-toggle");

  if (!sidebar) {
    return;
  }

  state.ui.sidebarOpen = true;

  sidebar.classList.add("is-open");

  setHidden(overlay, false);

  toggle?.setAttribute("aria-expanded", "true");

  document.documentElement.classList.add("sidebar-is-open");
}

function closeSidebar() {
  const sidebar = byId("app-sidebar");
  const overlay = byId("sidebar-overlay");
  const toggle = byId("sidebar-toggle");

  state.ui.sidebarOpen = false;

  sidebar?.classList.remove("is-open");

  setHidden(overlay, true);

  toggle?.setAttribute("aria-expanded", "false");

  document.documentElement.classList.remove("sidebar-is-open");
}

function toggleSidebar() {
  if (state.ui.sidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

function openNotifications() {
  const panel = byId("notification-panel");
  const trigger = $("[data-action='toggle-notifications']");

  if (!panel) {
    return;
  }

  closeAllOverlays("notifications");

  state.ui.notificationsOpen = true;

  panel.classList.add("is-open");

  panel.setAttribute("aria-hidden", "false");

  trigger?.setAttribute("aria-expanded", "true");
}

function closeNotifications() {
  const panel = byId("notification-panel");
  const triggers = $$(
    "[data-action='toggle-notifications']",
  );

  state.ui.notificationsOpen = false;

  panel?.classList.remove("is-open");

  panel?.setAttribute("aria-hidden", "true");

  triggers.forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

function toggleNotifications() {
  if (state.ui.notificationsOpen) {
    closeNotifications();
  } else {
    openNotifications();
  }
}

function renderNotificationCount() {
  $$("[data-notification-count]").forEach((element) => {
    const count = Number(state.notifications.unreadCount) || 0;

    element.textContent = count > 99 ? "99+" : String(count);

    element.hidden = count <= 0;
  });
}

function renderNotifications() {
  const container = $("[data-notification-list]");

  if (!container) {
    return;
  }

  const items = Array.isArray(state.notifications.items)
    ? state.notifications.items
    : [];

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">♢</div>
        <strong>You're all caught up</strong>
        <p>
          New notifications will appear here in real time.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = "";

  const fragment = document.createDocumentFragment();

  items.forEach((notification) => {
    const item = document.createElement("article");

    item.className = "notification-item";

    if (!notification.readAt) {
      item.classList.add("is-unread");
    }

    const title = document.createElement("strong");
    title.textContent =
      notification.title || "NEXUS notification";

    const message = document.createElement("p");
    message.textContent =
      notification.message || "";

    item.append(title, message);

    if (notification.createdAt) {
      const time = document.createElement("time");

      time.dateTime = notification.createdAt;

      time.textContent = formatRelativeTime(
        notification.createdAt,
      );

      item.appendChild(time);
    }

    fragment.appendChild(item);
  });

  container.appendChild(fragment);
}

/* ============================================================
   USER MENU
   ============================================================ */

function openUserMenu() {
  const menu = byId("user-menu");
  const trigger = $("[data-action='toggle-user-menu']");

  if (!menu) {
    return;
  }

  closeAllOverlays("user-menu");

  state.ui.userMenuOpen = true;

  setHidden(menu, false);

  trigger?.setAttribute("aria-expanded", "true");
}

function closeUserMenu() {
  const menu = byId("user-menu");
  const trigger = $("[data-action='toggle-user-menu']");

  state.ui.userMenuOpen = false;

  setHidden(menu, true);

  trigger?.setAttribute("aria-expanded", "false");
}

function toggleUserMenu() {
  if (state.ui.userMenuOpen) {
    closeUserMenu();
  } else {
    openUserMenu();
  }
}

/* ============================================================
   QUICK CREATE
   ============================================================ */

function openQuickCreate() {
  const modal = byId("quick-create-modal");

  if (!modal) {
    return;
  }

  closeAllOverlays("quick-create");

  state.ui.quickCreateOpen = true;

  setHidden(modal, false);

  toggleBodyLock(true);

  const firstOption = $(".create-option", modal);

  window.setTimeout(() => {
    firstOption?.focus();
  }, 0);
}

function closeQuickCreate() {
  const modal = byId("quick-create-modal");

  state.ui.quickCreateOpen = false;

  setHidden(modal, true);

  if (
    !state.ui.commandPanelOpen
  ) {
    toggleBodyLock(false);
  }
}

/* ============================================================
   COMMAND PANEL
   ============================================================ */

function openCommandPanel(initialQuery = "") {
  const panel = byId("command-panel");
  const input = $("[data-command-input]", panel || document);

  if (!panel) {
    return;
  }

  closeAllOverlays("command-panel");

  state.ui.commandPanelOpen = true;

  setHidden(panel, false);

  toggleBodyLock(true);

  if (input) {
    input.value = initialQuery;

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  renderCommandResults(state.search.results);
}

function closeCommandPanel() {
  const panel = byId("command-panel");

  state.ui.commandPanelOpen = false;

  setHidden(panel, true);

  if (!state.ui.quickCreateOpen) {
    toggleBodyLock(false);
  }
}

function renderCommandResults(results = []) {
  const container = $("[data-command-results]");

  if (!container) {
    return;
  }

  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⌕</div>
        <strong>Search NEXUS</strong>
        <p>
          Search people, services, projects,
          properties and other available resources.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = "";

  const fragment = document.createDocumentFragment();

  results.forEach((result) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "command-result";

    button.dataset.resultId = safeText(result.id);

    const title = document.createElement("strong");

    title.textContent =
      result.title ||
      result.name ||
      "Untitled result";

    const description = document.createElement("small");

    description.textContent =
      result.description ||
      result.type ||
      "";

    button.append(title, description);

    fragment.appendChild(button);
  });

  container.appendChild(fragment);
}

/* ============================================================
   TOAST SYSTEM
   ============================================================ */

function showToast(message, options = {}) {
  const container = byId("toast-container");

  if (!container) {
    return;
  }

  const {
    type = "info",
    duration = 5000,
    title = "",
  } = options;

  const toast = document.createElement("div");

  toast.className = `toast toast--${type}`;

  toast.setAttribute("role", "status");

  const content = document.createElement("div");

  content.className = "toast__content";

  if (title) {
    const titleElement = document.createElement("strong");

    titleElement.textContent = title;

    content.appendChild(titleElement);
  }

  const messageElement = document.createElement("p");

  messageElement.textContent = safeText(message);

  content.appendChild(messageElement);

  const close = document.createElement("button");

  close.type = "button";
  close.className = "icon-button";
  close.setAttribute("aria-label", "Dismiss message");
  close.textContent = "×";

  close.addEventListener("click", () => {
    removeToast(toast);
  });

  toast.append(content, close);

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  if (duration > 0) {
    window.setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
}

function removeToast(toast) {
  if (!toast?.isConnected) {
    return;
  }

  toast.classList.remove("is-visible");

  window.setTimeout(() => {
    toast.remove();
  }, 200);
}

/* ============================================================
   SYSTEM ALERTS
   ============================================================ */

function showSystemAlert(title, message) {
  const alert = byId("system-alert");

  if (!alert) {
    return;
  }

  const titleElement =
    $("[data-system-alert-title]", alert);

  const messageElement =
    $("[data-system-alert-message]", alert);

  if (titleElement) {
    titleElement.textContent =
      title || "System notification";
  }

  if (messageElement) {
    messageElement.textContent = message || "";
  }

  setHidden(alert, false);
}

function hideSystemAlert() {
  setHidden(byId("system-alert"), true);
}

/* ============================================================
   USER / IDENTITY
   ============================================================ */

function getInitials(value) {
  const text = safeText(value).trim();

  if (!text) {
    return "N";
  }

  const parts = text
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function renderUser(user = state.user) {
  const name =
    user?.name ||
    user?.displayName ||
    user?.fullName ||
    "NEXUS User";

  const email =
    user?.email ||
    "Account";

  const role =
    user?.role ||
    user?.primaryRole ||
    "Workspace";

  $$("[data-user-name]").forEach((element) => {
    element.textContent = name;
  });

  $$("[data-user-email]").forEach((element) => {
    element.textContent = email;
  });

  $$("[data-user-role]").forEach((element) => {
    element.textContent = role;
  });

  $$("[data-user-avatar]").forEach((element) => {
    if (user?.avatarUrl) {
      element.textContent = "";

      element.style.backgroundImage =
        `url("${CSS.escape(user.avatarUrl)}")`;

      element.classList.add("has-image");
    } else {
      element.textContent = getInitials(name);

      element.style.removeProperty("background-image");

      element.classList.remove("has-image");
    }
  });
}

/* ============================================================
   AUTHENTICATION
   ============================================================ */

async function loadAuthenticationState() {
  try {
    const response = await api.get("/auth/session");

    const authenticated =
      Boolean(
        response?.authenticated ??
        response?.data?.authenticated ??
        response?.user,
      );

    state.authenticated = authenticated;

    state.user =
      response?.user ||
      response?.data?.user ||
      null;

    renderUser();

    emit("auth:ready", {
      authenticated,
      user: state.user,
    });

    return {
      authenticated,
      user: state.user,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      state.authenticated = false;
      state.user = null;

      renderUser();

      emit("auth:ready", {
        authenticated: false,
        user: null,
      });

      return {
        authenticated: false,
        user: null,
      };
    }

    /*
     * The API may not yet be running while the remaining
     * server files are being assembled. Do not manufacture
     * an authenticated user.
     */
    state.authenticated = false;
    state.user = null;

    renderUser();

    emit("auth:unavailable", {
      error,
    });

    return {
      authenticated: false,
      user: null,
    };
  }
}

async function logout() {
  try {
    await api.post("/auth/logout");

    state.authenticated = false;
    state.user = null;

    disconnectSocket();

    renderUser();

    closeAllOverlays();

    showToast("You have been signed out.", {
      type: "success",
      title: "Signed out",
    });

    navigate("/");
  } catch (error) {
    showToast(
      getErrorMessage(error, "Unable to sign out."),
      {
        type: "error",
        title: "Sign out failed",
      },
    );
  }
}

/* ============================================================
   SOCKET.IO
   ============================================================ */

function getSocketConstructor() {
  if (typeof window.io === "function") {
    return window.io;
  }

  return null;
}

function setSocketStatus(status, connected = false) {
  state.socket.connected = connected;
  state.socket.connecting =
    status === "connecting" ||
    status === "reconnecting";

  state.system.realtime = status;

  $$("[data-socket-status]").forEach((element) => {
    element.textContent = formatConnectionStatus(status);
  });

  $$("[data-realtime-status]").forEach((element) => {
    element.textContent = formatConnectionStatus(status);
  });

  $$("[data-system-realtime]").forEach((element) => {
    element.textContent =
      connected ? "Socket.IO connected" : "Socket.IO";
  });

  $$("[data-socket-indicator]").forEach((element) => {
    element.classList.toggle(
      "status-indicator--online",
      connected,
    );

    element.classList.toggle(
      "status-indicator--offline",
      status === "offline" ||
        status === "disconnected",
    );
  });

  $$("[data-realtime-indicator]").forEach((element) => {
    element.classList.toggle(
      "status-indicator--online",
      connected,
    );

    element.classList.toggle(
      "status-indicator--offline",
      status === "offline" ||
        status === "disconnected",
    );
  });

  emit("socket:status", {
    status,
    connected,
  });
}

function formatConnectionStatus(status) {
  const labels = {
    connected: "Connected",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
    offline: "Offline",
    unavailable: "Unavailable",
    error: "Connection error",
  };

  return labels[status] || "Unknown";
}

function initializeSocket() {
  const io = getSocketConstructor();

  if (!io) {
    setSocketStatus("unavailable", false);

    return null;
  }

  if (state.socket.instance) {
    return state.socket.instance;
  }

  setSocketStatus("connecting", false);

  const socket = io({
    path: NEXUS.socketPath,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: NEXUS.maxReconnectAttempts,
    reconnectionDelay: NEXUS.reconnectDelay,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.2,
    timeout: NEXUS.requestTimeout,
    transports: ["websocket", "polling"],
    withCredentials: true,
  });

  state.socket.instance = socket;

  socket.on("connect", () => {
    state.socket.reconnectAttempts = 0;

    setSocketStatus("connected", true);

    emit("socket:connected", {
      socketId: socket.id,
    });

    /*
     * Authentication is performed server-side.
     * The server may accept a session cookie or
     * issue a socket-specific authentication result.
     */
    socket.emit("client:ready", {
      version: NEXUS.version,
      client: "nexus-web",
    });
  });

  socket.on("connect_error", (error) => {
    state.socket.reconnectAttempts += 1;

    setSocketStatus("error", false);

    emit("socket:error", {
      error,
      attempts: state.socket.reconnectAttempts,
    });
  });

  socket.on("disconnect", (reason) => {
    state.socket.authenticated = false;

    setSocketStatus(
      navigator.onLine ? "disconnected" : "offline",
      false,
    );

    emit("socket:disconnected", {
      reason,
    });
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    state.socket.reconnectAttempts = attempt;

    setSocketStatus("reconnecting", false);

    emit("socket:reconnecting", {
      attempt,
    });
  });

  socket.io.on("reconnect", (attempt) => {
    state.socket.reconnectAttempts = attempt;

    setSocketStatus("connected", true);

    emit("socket:reconnected", {
      attempt,
    });
  });

  socket.io.on("reconnect_error", (error) => {
    setSocketStatus("reconnecting", false);

    emit("socket:reconnect-error", {
      error,
    });
  });

  socket.io.on("reconnect_failed", () => {
    setSocketStatus("disconnected", false);

    emit("socket:reconnect-failed");
  });

  registerSocketEvents(socket);

  return socket;
}

function disconnectSocket() {
  const socket = state.socket.instance;

  if (!socket) {
    return;
  }

  socket.disconnect();

  state.socket.instance = null;
  state.socket.connected = false;
  state.socket.authenticated = false;

  setSocketStatus("disconnected", false);
}

function registerSocketEvents(socket) {
  /*
   * Server authentication result.
   */
  socket.on("auth:success", (payload) => {
    state.socket.authenticated = true;

    emit("socket:authenticated", payload);
  });

  socket.on("auth:error", (payload) => {
    state.socket.authenticated = false;

    emit("socket:authentication-error", payload);

    showToast(
      payload?.message ||
        "Realtime authentication was not accepted.",
      {
        type: "error",
        title: "Realtime security",
      },
    );
  });

  /*
   * Presence.
   */
  socket.on("presence:update", (payload) => {
    emit("presence:update", payload);
  });

  socket.on("presence:online", (payload) => {
    emit("presence:online", payload);
  });

  socket.on("presence:offline", (payload) => {
    emit("presence:offline", payload);
  });

  /*
   * Notifications.
   */
  socket.on("notification:new", (notification) => {
    handleRealtimeNotification(notification);
  });

  socket.on("notification:read", (payload) => {
    handleNotificationRead(payload);
  });

  socket.on("notification:count", (payload) => {
    const count = Number(
      payload?.count ??
      payload?.unreadCount ??
      0,
    );

    state.notifications.unreadCount =
      Number.isFinite(count) ? count : 0;

    renderNotificationCount();

    emit("notifications:count", {
      count: state.notifications.unreadCount,
    });
  });

  /*
   * Activity.
   */
  socket.on("activity:new", (activity) => {
    prependActivity(activity);
  });

  socket.on("activity:update", (activity) => {
    updateActivity(activity);
  });

  /*
   * Messaging.
   */
  socket.on("message:new", (message) => {
    emit("message:new", message);

    addActivityFromMessage(message);
  });

  socket.on("message:delivered", (payload) => {
    emit("message:delivered", payload);
  });

  socket.on("message:read", (payload) => {
    emit("message:read", payload);
  });

  socket.on("message:typing", (payload) => {
    emit("message:typing", payload);
  });

  /*
   * Conversations.
   */
  socket.on("conversation:update", (conversation) => {
    emit("conversation:update", conversation);
  });

  /*
   * Platform events.
   */
  socket.on("system:event", (payload) => {
    handleSystemEvent(payload);
  });

  socket.on("system:status", (payload) => {
    handleSystemStatus(payload);
  });

  /*
   * Advertisement / marketplace events.
   */
  socket.on("advertisement:update", (payload) => {
    emit("advertisement:update", payload);
  });

  /*
   * Generic server event.
   *
   * This is intentionally not executed as code.
   * It only enters the internal event bus.
   */
  socket.on("nexus:event", (payload) => {
    emit("server:event", payload);
  });
}

/* ============================================================
   REALTIME NOTIFICATIONS
   ============================================================ */

function handleRealtimeNotification(notification) {
  if (!notification) {
    return;
  }

  state.notifications.items.unshift(notification);

  state.notifications.items =
    state.notifications.items.slice(0, 100);

  if (!notification.readAt) {
    state.notifications.unreadCount += 1;
  }

  renderNotificationCount();
  renderNotifications();

  showToast(
    notification.message ||
      notification.title ||
      "You have a new notification.",
    {
      type: "info",
      title:
        notification.title ||
        "New notification",
    },
  );

  emit("notification:new", notification);
}

function handleNotificationRead(payload) {
  const id = payload?.id || payload?.notificationId;

  if (!id) {
    return;
  }

  const notification =
    state.notifications.items.find(
      (item) => item.id === id,
    );

  if (notification && !notification.readAt) {
    notification.readAt =
      payload.readAt || new Date().toISOString();

    state.notifications.unreadCount =
      Math.max(
        0,
        state.notifications.unreadCount - 1,
      );
  }

  renderNotificationCount();
  renderNotifications();

  emit("notification:read", payload);
}

/* ============================================================
   ACTIVITY
   ============================================================ */

function prependActivity(activity) {
  if (!activity) {
    return;
  }

  state.activity.items.unshift(activity);

  state.activity.items =
    state.activity.items.slice(0, 100);

  renderActivity();

  emit("activity:new", activity);
}

function updateActivity(activity) {
  if (!activity?.id) {
    return;
  }

  const index = state.activity.items.findIndex(
    (item) => item.id === activity.id,
  );

  if (index === -1) {
    prependActivity(activity);
    return;
  }

  state.activity.items[index] = {
    ...state.activity.items[index],
    ...activity,
  };

  renderActivity();
}

function addActivityFromMessage(message) {
  if (!message) {
    return;
  }

  prependActivity({
    id:
      message.id ||
      `message-${Date.now()}`,
    type: "message",
    title: "New message",
    description:
      message.preview ||
      message.text ||
      "New conversation activity.",
    createdAt:
      message.createdAt ||
      new Date().toISOString(),
  });
}

function renderActivity() {
  const feed = $("[data-activity-feed]");

  if (!feed) {
    return;
  }

  const items = state.activity.items;

  if (!items.length) {
    feed.innerHTML = `
      <div class="empty-state" data-activity-empty>
        <div class="empty-state__icon">◌</div>
        <strong>Your activity will appear here</strong>
        <p>
          NEXUS will keep you informed about relevant
          activity, messages, updates and events.
        </p>
      </div>
    `;

    return;
  }

  feed.innerHTML = "";

  const fragment = document.createDocumentFragment();

  items.slice(0, 20).forEach((activity) => {
    const article = document.createElement("article");

    article.className = "activity-item";

    if (activity.id) {
      article.dataset.activityId =
        safeText(activity.id);
    }

    const icon = document.createElement("div");

    icon.className = "activity-item__icon";

    icon.textContent =
      getActivityIcon(activity.type);

    const content = document.createElement("div");

    content.className = "activity-item__content";

    const title = document.createElement("strong");

    title.textContent =
      activity.title ||
      "NEXUS activity";

    const description = document.createElement("p");

    description.textContent =
      activity.description ||
      activity.message ||
      "";

    content.append(title, description);

    if (activity.createdAt) {
      const time = document.createElement("time");

      time.dateTime = activity.createdAt;

      time.textContent =
        formatRelativeTime(activity.createdAt);

      content.appendChild(time);
    }

    article.append(icon, content);

    fragment.appendChild(article);
  });

  feed.appendChild(fragment);
}

function getActivityIcon(type) {
  const icons = {
    message: "◎",
    notification: "♢",
    project: "▦",
    service: "◇",
    property: "⌂",
    marketplace: "◌",
    construction: "▰",
    payment: "◈",
    system: "✦",
  };

  return icons[type] || "◌";
}

async function loadActivity() {
  const feed = $("[data-activity-feed]");

  if (!feed || state.activity.loading) {
    return;
  }

  state.activity.loading = true;

  feed.setAttribute("aria-busy", "true");

  try {
    const response = await api.get(
      "/activity?limit=20",
    );

    const items =
      response?.items ||
      response?.data?.items ||
      (Array.isArray(response) ? response : []);

    state.activity.items = Array.isArray(items)
      ? items
      : [];

    renderActivity();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404
    ) {
      /*
       * Endpoint may not exist until the backend
       * route is assembled. Do not manufacture data.
       */
      return;
    }

    console.warn(
      "[NEXUS] Activity request failed:",
      error,
    );
  } finally {
    state.activity.loading = false;

    feed.removeAttribute("aria-busy");
  }
}

/* ============================================================
   NOTIFICATION DATA
   ============================================================ */

async function loadNotifications() {
  try {
    const response = await api.get(
      "/notifications?limit=50",
    );

    const items =
      response?.items ||
      response?.data?.items ||
      (Array.isArray(response) ? response : []);

    state.notifications.items = Array.isArray(items)
      ? items
      : [];

    state.notifications.unreadCount =
      state.notifications.items.filter(
        (item) => !item.readAt,
      ).length;

    renderNotifications();
    renderNotificationCount();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404
    ) {
      return;
    }

    console.warn(
      "[NEXUS] Notification request failed:",
      error,
    );
  }
}

/* ============================================================
   SEARCH
   ============================================================ */

let searchTimer = null;

async function performSearch(query) {
  const normalizedQuery = safeText(query).trim();

  state.search.query = normalizedQuery;

  if (!normalizedQuery) {
    state.search.results = [];

    renderCommandResults([]);

    return;
  }

  state.search.loading = true;

  emit("search:start", {
    query: normalizedQuery,
  });

  try {
    const response = await api.get(
      `/search?q=${encodeURIComponent(
        normalizedQuery,
      )}`,
    );

    const results =
      response?.items ||
      response?.results ||
      response?.data?.items ||
      [];

    state.search.results = Array.isArray(results)
      ? results
      : [];

    renderCommandResults(state.search.results);

    emit("search:success", {
      query: normalizedQuery,
      results: state.search.results,
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404
    ) {
      state.search.results = [];

      renderCommandResults([]);

      return;
    }

    emit("search:error", {
      query: normalizedQuery,
      error,
    });
  } finally {
    state.search.loading = false;
  }
}

function scheduleSearch(query) {
  window.clearTimeout(searchTimer);

  searchTimer = window.setTimeout(() => {
    performSearch(query);
  }, 300);
}

/* ============================================================
   ROUTING
   ============================================================ */

const ROUTE_TITLES = Object.freeze({
  "/": "Overview",
  "/connect": "Connect",
  "/professionals": "Professionals",
  "/services": "Services",
  "/jobs": "Jobs",
  "/marketplace": "Marketplace",
  "/projects": "Projects",
  "/property": "Property",
  "/construction": "Construction",
  "/analytics": "Analytics",
  "/intelligence": "Intelligence",
  "/automation": "Automation",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/profile": "Profile",
  "/security": "Security",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/status": "System status",
});

function normalizeRoute(path) {
  if (!path) {
    return "/";
  }

  const url = new URL(path, window.location.origin);

  return url.pathname || "/";
}

function navigate(path, options = {}) {
  const route = normalizeRoute(path);

  const {
    replace = false,
    scroll = true,
  } = options;

  if (route !== window.location.pathname) {
    if (replace) {
      window.history.replaceState({}, "", route);
    } else {
      window.history.pushState({}, "", route);
    }
  }

  state.route = route;

  updateNavigationState(route);

  if (scroll) {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  closeSidebar();

  emit("navigation", {
    route,
  });

  return route;
}

function updateNavigationState(route) {
  $$("[data-route]").forEach((element) => {
    const target = normalizeRoute(
      element.getAttribute("data-route"),
    );

    const isActive =
      target === route ||
      (route !== "/" &&
        target !== "/" &&
        route.startsWith(`${target}/`));

    element.classList.toggle(
      "is-active",
      isActive,
    );

    if (isActive) {
      element.setAttribute(
        "aria-current",
        "page",
      );
    } else {
      element.removeAttribute("aria-current");
    }
  });

  const title =
    ROUTE_TITLES[route] ||
    document.title.replace("NEXUS OS", "").trim() ||
    "NEXUS OS";

  $$("[data-page-title]").forEach((element) => {
    element.textContent = title;
  });

  document.title =
    title === "Overview"
      ? "NEXUS OS"
      : `${title} — NEXUS OS`;
}

/*
 * The shell is intentionally a real application shell.
 *
 * We do not pretend that all future modules already exist.
 * When their server routes and client views are implemented,
 * this dispatcher becomes the integration point.
 */
function handleRoute(route) {
  updateNavigationState(route);

  emit("route:load", {
    route,
  });

  /*
   * Module pages can progressively register themselves.
   */
  window.dispatchEvent(
    new CustomEvent("nexus:route", {
      detail: {
        route,
      },
    }),
  );
}

/* ============================================================
   SYSTEM STATUS
   ============================================================ */

async function loadSystemHealth() {
  try {
    const response = await api.get("/health");

    const status =
      response?.status ||
      response?.data?.status ||
      "operational";

    state.system.status = status;

    $$("[data-platform-status]").forEach(
      (element) => {
        element.textContent =
          formatSystemStatus(status);
      },
    );

    $$("[data-platform-status-indicator]").forEach(
      (element) => {
        element.classList.toggle(
          "status-indicator--online",
          status === "ok" ||
            status === "healthy" ||
            status === "operational",
        );
      },
    );

    $$("[data-system-status]").forEach(
      (element) => {
        element.textContent =
          formatSystemStatus(status);
      },
    );

    $$("[data-system-status-indicator]").forEach(
      (element) => {
        element.classList.toggle(
          "status-indicator--online",
          status === "ok" ||
            status === "healthy" ||
            status === "operational",
        );
      },
    );

    emit("system:health", response);
  } catch (error) {
    state.system.status = "unavailable";

    $$("[data-platform-status]").forEach(
      (element) => {
        element.textContent = "Unavailable";
      },
    );

    $$("[data-system-status]").forEach(
      (element) => {
        element.textContent = "Unavailable";
      },
    );

    emit("system:health-error", {
      error,
    });
  }
}

async function loadReadiness() {
  try {
    const response =
      await api.get("/health/ready");

    state.system.services =
      response?.status ||
      response?.data?.status ||
      "ready";

    $$("[data-service-status]").forEach(
      (element) => {
        element.textContent =
          formatSystemStatus(
            state.system.services,
          );
      },
    );

    $$("[data-service-indicator]").forEach(
      (element) => {
        element.classList.toggle(
          "status-indicator--online",
          state.system.services ===
            "ok" ||
            state.system.services ===
              "healthy" ||
            state.system.services ===
              "ready" ||
            state.system.services ===
              "operational",
        );
      },
    );
  } catch (error) {
    state.system.services = "unavailable";

    $$("[data-service-status]").forEach(
      (element) => {
        element.textContent = "Unavailable";
      },
    );
  }
}

function formatSystemStatus(status) {
  const normalized =
    safeText(status).toLowerCase();

  const labels = {
    ok: "Operational",
    healthy: "Operational",
    operational: "Operational",
    ready: "Ready",
    degraded: "Degraded",
    unavailable: "Unavailable",
    error: "Error",
  };

  return labels[normalized] || safeText(status);
}

function handleSystemEvent(payload) {
  if (!payload) {
    return;
  }

  const severity =
    payload.severity ||
    "info";

  if (payload.message) {
    showToast(payload.message, {
      type: severity,
      title:
        payload.title ||
        "NEXUS system event",
    });
  }

  emit("system:event", payload);
}

function handleSystemStatus(payload) {
  if (!payload) {
    return;
  }

  const status =
    payload.status ||
    payload.state;

  if (status) {
    state.system.status = status;

    $$("[data-platform-status]").forEach(
      (element) => {
        element.textContent =
          formatSystemStatus(status);
      },
    );
  }

  emit("system:status", payload);
}

/* ============================================================
   OFFLINE / ONLINE
   ============================================================ */

function updateNetworkStatus() {
  const offline = !navigator.onLine;

  const banner = byId("offline-banner");

  setHidden(banner, !offline);

  if (offline) {
    setSocketStatus("offline", false);
  } else if (!state.socket.connected) {
    setSocketStatus("reconnecting", false);
  }

  emit("network:status", {
    online: !offline,
  });
}

/* ============================================================
   KEYBOARD ACCESSIBILITY
   ============================================================ */

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    if (state.ui.commandPanelOpen) {
      closeCommandPanel();
      return;
    }

    if (state.ui.quickCreateOpen) {
      closeQuickCreate();
      return;
    }

    if (state.ui.notificationsOpen) {
      closeNotifications();
      return;
    }

    if (state.ui.userMenuOpen) {
      closeUserMenu();
      return;
    }

    if (state.ui.sidebarOpen) {
      closeSidebar();
      return;
    }
  }

  /*
   * "/" opens global search when the user is not typing.
   */
  if (
    event.key === "/" &&
    !isTypingTarget(event.target)
  ) {
    event.preventDefault();

    openCommandPanel();

    return;
  }

  /*
   * Ctrl/Cmd + K opens command search.
   */
  if (
    event.key.toLowerCase() === "k" &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();

    openCommandPanel();

    return;
  }
}

function isTypingTarget(element) {
  if (!isElement(element)) {
    return false;
  }

  const tagName =
    element.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable
  );
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */

function handleClick(event) {
  const actionElement =
    event.target.closest("[data-action]");

  if (actionElement) {
    handleAction(
      actionElement.dataset.action,
      actionElement,
      event,
    );
  }

  const routeElement =
    event.target.closest("[data-route]");

  if (
    routeElement &&
    routeElement.tagName === "A" &&
    !event.defaultPrevented
  ) {
    const href =
      routeElement.getAttribute("href");

    if (
      href &&
      href.startsWith("/") &&
      !href.startsWith("//")
    ) {
      event.preventDefault();

      navigate(href);

      handleRoute(
        normalizeRoute(href),
      );
    }
  }

  const createOption =
    event.target.closest("[data-create-type]");

  if (createOption) {
    handleCreateAction(
      createOption.dataset.createType,
    );
  }

  const commandResult =
    event.target.closest("[data-result-id]");

  if (commandResult) {
    handleCommandResult(
      commandResult.dataset.resultId,
    );
  }
}

function handleAction(action, element, event) {
  switch (action) {
    case "open-sidebar":
      openSidebar();
      break;

    case "close-sidebar":
      closeSidebar();
      break;

    case "toggle-notifications":
      toggleNotifications();
      break;

    case "close-notifications":
      closeNotifications();
      break;

    case "toggle-user-menu":
      toggleUserMenu();
      break;

    case "open-quick-create":
      openQuickCreate();
      break;

    case "close-quick-create":
      closeQuickCreate();
      break;

    case "close-command-panel":
      closeCommandPanel();
      break;

    case "dismiss-system-alert":
      hideSystemAlert();
      break;

    case "logout":
      logout();
      break;

    case "refresh-activity":
      loadActivity();
      break;

    case "workspace-switcher":
      handleWorkspaceSwitcher(element);
      break;

    default:
      emit("action", {
        action,
        element,
        event,
      });
  }
}

function handleWorkspaceSwitcher(element) {
  const expanded =
    element.getAttribute("aria-expanded") ===
    "true";

  element.setAttribute(
    "aria-expanded",
    String(!expanded),
  );

  emit("workspace:switcher", {
    open: !expanded,
  });
}

function handleCreateAction(type) {
  closeQuickCreate();

  emit("create:requested", {
    type,
  });

  /*
   * These routes will become real module creation
   * interfaces as the corresponding backend/domain
   * modules are implemented.
   */
  const routes = {
    project: "/projects",
    service: "/services",
    advertisement: "/marketplace",
    job: "/jobs",
    property: "/property",
    message: "/connect",
  };

  const route = routes[type];

  if (route) {
    navigate(route);

    handleRoute(route);
  }
}

function handleCommandResult(id) {
  if (!id) {
    return;
  }

  emit("search:result-selected", {
    id,
  });

  closeCommandPanel();
}

/* ============================================================
   SEARCH FORM
   ============================================================ */

function initializeSearch() {
  const form = byId("global-search");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const input =
      $("[data-search-input]", form);

    const query =
      input?.value?.trim() || "";

    openCommandPanel(query);

    performSearch(query);
  });

  const input =
    $("[data-search-input]", form);

  input?.addEventListener("input", () => {
    scheduleSearch(input.value);
  });
}

function initializeCommandSearch() {
  const input =
    $("[data-command-input]");

  input?.addEventListener("input", () => {
    scheduleSearch(input.value);
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      performSearch(input.value);
    }
  });
}

/* ============================================================
   SYSTEM CLOCK / YEAR
   ============================================================ */

function renderCurrentYear() {
  const year = new Date().getFullYear();

  $$("[data-current-year]").forEach(
    (element) => {
      element.textContent = year;
    },
  );
}

/* ============================================================
   ERROR HANDLING
   ============================================================ */

function getErrorMessage(
  error,
  fallback = "Something went wrong.",
) {
  if (error instanceof ApiError) {
    return (
      error.payload?.message ||
      error.payload?.error?.message ||
      error.message ||
      fallback
    );
  }

  if (error?.message) {
    return error.message;
  }

  return fallback;
}

function installGlobalErrorHandlers() {
  window.addEventListener(
    "error",
    (event) => {
      console.error(
        "[NEXUS] Unhandled client error:",
        event.error || event.message,
      );

      emit("client:error", {
        type: "error",
        error:
          event.error ||
          new Error(event.message),
      });
    },
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error(
        "[NEXUS] Unhandled promise rejection:",
        event.reason,
      );

      emit("client:error", {
        type: "unhandledrejection",
        error: event.reason,
      });
    },
  );
}

/* ============================================================
   INITIAL DATA BOOTSTRAP
   ============================================================ */

async function bootstrapServerState() {
  /*
   * These operations intentionally run independently.
   *
   * A failure in one dependency must not prevent the
   * rest of the application from initializing.
   */
  await Promise.allSettled([
    loadSystemHealth(),
    loadReadiness(),
    loadAuthenticationState(),
    loadNotifications(),
    loadActivity(),
  ]);
}

/* ============================================================
   EVENT INITIALIZATION
   ============================================================ */

function initializeEventListeners() {
  document.addEventListener(
    "click",
    handleClick,
  );

  document.addEventListener(
    "keydown",
    handleGlobalKeydown,
  );

  window.addEventListener(
    "popstate",
    () => {
      state.route =
        window.location.pathname || "/";

      handleRoute(state.route);
    },
  );

  window.addEventListener(
    "online",
    updateNetworkStatus,
  );

  window.addEventListener(
    "offline",
    updateNetworkStatus,
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      emit("visibility:change", {
        visible:
          document.visibilityState ===
          "visible",
      });

      if (
        document.visibilityState ===
        "visible"
      ) {
        /*
         * Recheck server health when the user
         * returns to the application.
         */
        loadSystemHealth();
      }
    },
  );
}

/* ============================================================
   APPLICATION BOOT
   ============================================================ */

async function boot() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  const loader = byId("app-loader");

  try {
    renderCurrentYear();

    updateNetworkStatus();

    updateNavigationState(
      state.route,
    );

    initializeEventListeners();

    initializeSearch();

    initializeCommandSearch();

    installGlobalErrorHandlers();

    /*
     * Initialize Socket.IO immediately.
     *
     * There is no mock websocket implementation.
     * If /socket.io/socket.io.js is unavailable,
     * the application reports realtime as unavailable
     * and continues safely.
     */
    initializeSocket();

    /*
     * Load authoritative state from the server.
     */
    await bootstrapServerState();

    handleRoute(state.route);

    emit("application:ready", {
      version: NEXUS.version,
      route: state.route,
      authenticated: state.authenticated,
      realtime:
        state.socket.connected,
    });
  } catch (error) {
    console.error(
      "[NEXUS] Application bootstrap failed:",
      error,
    );

    emit("application:error", {
      error,
    });

    showSystemAlert(
      "NEXUS OS encountered an initialization issue",
      getErrorMessage(
        error,
        "Some application services could not be initialized.",
      ),
    );
  } finally {
    /*
     * Never leave the loading screen permanently
     * blocking the application because one optional
     * dependency failed.
     */
    if (loader) {
      loader.classList.add(
        "is-loaded",
      );

      window.setTimeout(() => {
        setHidden(loader, true);
      }, 350);
    }
  }
}

/* ============================================================
   PUBLIC NEXUS CLIENT API
   ============================================================ */

window.NEXUS = Object.freeze({
  version: NEXUS.version,

  state,

  api,

  events,

  on,

  emit,

  navigate,

  openSidebar,

  closeSidebar,

  openNotifications,

  closeNotifications,

  openQuickCreate,

  closeQuickCreate,

  openCommandPanel,

  closeCommandPanel,

  showToast,

  showSystemAlert,

  hideSystemAlert,

  loadActivity,

  loadNotifications,

  loadSystemHealth,

  loadReadiness,

  performSearch,

  initializeSocket,

  disconnectSocket,

  logout,
});

/* ============================================================
   START APPLICATION
   ============================================================ */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    boot,
    { once: true },
  );
} else {
  boot();
}
