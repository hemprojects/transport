// =============================================
// TransportTracker - Aplikacja JavaScript
// Część 1: Podstawy, API, Auth, Utils
// =============================================

(function () {
  "use strict";

  // =============================================
  // 1. KONFIGURACJA
  // =============================================
  const CONFIG = {
    API_URL: "/api",
    NOTIFICATION_CHECK_INTERVAL: 30000, // 30 sekund
    TOAST_DURATION: 4000,
    DATE_FORMAT: "pl-PL",
    STORAGE_KEYS: {
      USER: "tt_user",
      THEME: "tt_theme",
    },
  };

  // =============================================
  // 2. STAN APLIKACJI
  // =============================================
  const state = {
    currentUser: null,
    currentScreen: "loading",
    currentDate: new Date().toISOString().split("T")[0],
    currentFilter: "all",
    currentTab: "tasks",

    // Dane
    users: [],
    locations: [],
    departments: [],
    tasks: [],
    notifications: [],
    unreadNotifications: 0,

    // UI state
    isLoading: false,
    isReorderMode: false,
    reorderTaskIds: [],

    // Intervals
    notificationInterval: null,
  };

  // =============================================
  // 3. UTILS - Funkcje pomocnicze
  // =============================================
  const Utils = {
    // Format daty po polsku
    formatDate(dateStr) {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    },

    formatDateShort(dateStr) {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
        day: "numeric",
        month: "short",
      });
    },

    formatTime(timeStr) {
      if (!timeStr) return "";
      return timeStr.substring(0, 5);
    },

    formatDateTime(dateTimeStr) {
      if (!dateTimeStr) return "";
      const date = new Date(dateTimeStr);
      return date.toLocaleString(CONFIG.DATE_FORMAT, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    },

    formatRelativeTime(dateTimeStr) {
      if (!dateTimeStr) return "";
      const date = new Date(dateTimeStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "przed chwilą";
      if (diffMins < 60) return `${diffMins} min temu`;
      if (diffHours < 24) return `${diffHours} godz. temu`;
      if (diffDays < 7) return `${diffDays} dni temu`;
      return Utils.formatDateShort(dateTimeStr);
    },

    // Pobierz dzisiejszą datę
    getToday() {
      return new Date().toISOString().split("T")[0];
    },

    // Zmień datę o X dni
    addDays(dateStr, days) {
      const date = new Date(dateStr);
      date.setDate(date.getDate() + days);
      return date.toISOString().split("T")[0];
    },

    // Sprawdź czy data to dziś
    isToday(dateStr) {
      return dateStr === Utils.getToday();
    },

    // Escape HTML
    escapeHtml(text) {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },

    // Debounce
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    // Throttle
    throttle(func, limit) {
      let inThrottle;
      return function (...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => (inThrottle = false), limit);
        }
      };
    },

    // Generuj ID
    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Pobierz element DOM
    $(selector) {
      return document.querySelector(selector);
    },

    $$(selector) {
      return document.querySelectorAll(selector);
    },

    // Pokaż/ukryj element
    show(element) {
      if (typeof element === "string") element = Utils.$(element);
      if (element) element.classList.remove("hidden");
    },

    hide(element) {
      if (typeof element === "string") element = Utils.$(element);
      if (element) element.classList.add("hidden");
    },

    toggle(element, show) {
      if (typeof element === "string") element = Utils.$(element);
      if (element) element.classList.toggle("hidden", !show);
    },

    // Typ zadania - etykiety
    getTaskTypeLabel(type) {
      const labels = {
        unloading: "Rozładunek",
        transport: "Przewożenie",
        loading: "Załadunek",
      };
      return labels[type] || type;
    },

    getTaskTypeIcon(type) {
      const icons = {
        unloading: "📥",
        transport: "🚛",
        loading: "📤",
      };
      return icons[type] || "📋";
    },

    // Status - etykiety
    getStatusLabel(status) {
      const labels = {
        pending: "Oczekuje",
        in_progress: "W trakcie",
        completed: "Zakończone",
        cancelled: "Anulowane",
      };
      return labels[status] || status;
    },

    getStatusIcon(status) {
      const icons = {
        pending: "⏳",
        in_progress: "🔄",
        completed: "✅",
        cancelled: "❌",
      };
      return icons[status] || "❓";
    },

    // Priorytet - etykiety
    getPriorityLabel(priority) {
      const labels = {
        high: "Pilne",
        normal: "Normalne",
        low: "Niski",
      };
      return labels[priority] || priority;
    },

    getPriorityIcon(priority) {
      const icons = {
        high: "🔴",
        normal: "🟡",
        low: "🟢",
      };
      return icons[priority] || "⚪";
    },

    // Powód przestoju - etykiety
    getDelayReasonLabel(reason) {
      const labels = {
        no_access: "Brak dojazdu",
        waiting: "Oczekiwanie na załadunek/rozładunek",
        traffic: "Korki / utrudnienia",
        equipment: "Problem z sprzętem",
        weather: "Warunki pogodowe",
        break: "Przerwa",
        other: "Inny powód",
      };
      return labels[reason] || reason;
    },

    // Log type icon
    getLogTypeIcon(type) {
      const icons = {
        note: "📝",
        delay: "⏱️",
        problem: "⚠️",
        status_change: "🔄",
      };
      return icons[type] || "📋";
    },
  };

  // =============================================
  // 4. API - Komunikacja z serwerem
  // =============================================
  const API = {
    async request(endpoint, options = {}) {
      const url = `${CONFIG.API_URL}${endpoint}`;
      const config = {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      };

      if (options.body && typeof options.body === "object") {
        config.body = JSON.stringify(options.body);
      }

      try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Wystąpił błąd");
        }

        return data;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },

    // AUTH
    async getUsers() {
      return await this.request("/users");
    },

    async login(userId, pin) {
      return await this.request("/auth/login", {
        method: "POST",
        body: { userId: parseInt(userId), pin },
      });
    },

    // USERS
    async createUser(userData) {
      return await this.request("/users", {
        method: "POST",
        body: userData,
      });
    },

    async updateUser(id, userData) {
      return await this.request(`/users/${id}`, {
        method: "PUT",
        body: userData,
      });
    },

    async deleteUser(id) {
      return await this.request(`/users/${id}`, {
        method: "DELETE",
      });
    },

    // LOCATIONS
    async getLocations() {
      return await this.request("/locations");
    },

    async createLocation(data) {
      return await this.request("/locations", {
        method: "POST",
        body: data,
      });
    },

    async deleteLocation(id) {
      return await this.request(`/locations/${id}`, {
        method: "DELETE",
      });
    },

    // TASKS
    async getTasks(params = {}) {
      const queryParams = new URLSearchParams();
      if (params.date) queryParams.append("date", params.date);
      if (params.status) queryParams.append("status", params.status);
      if (params.userId) queryParams.append("userId", params.userId);

      const query = queryParams.toString();
      return await this.request(`/tasks${query ? "?" + query : ""}`);
    },

    async getTask(id) {
      return await this.request(`/tasks/${id}`);
    },

    async createTask(taskData) {
      return await this.request("/tasks", {
        method: "POST",
        body: taskData,
      });
    },

    async updateTask(id, taskData) {
      return await this.request(`/tasks/${id}`, {
        method: "PUT",
        body: taskData,
      });
    },

    async deleteTask(id) {
      return await this.request(`/tasks/${id}`, {
        method: "DELETE",
      });
    },

    async updateTaskStatus(id, status, userId) {
      return await this.request(`/tasks/${id}/status`, {
        method: "PUT",
        body: { status, userId },
      });
    },

    async reorderTasks(taskIds) {
      return await this.request("/tasks/reorder", {
        method: "POST",
        body: { tasks: taskIds },
      });
    },

    // TASK LOGS
    async getTaskLogs(taskId) {
      return await this.request(`/tasks/${taskId}/logs`);
    },

    async createTaskLog(taskId, logData) {
      return await this.request(`/tasks/${taskId}/logs`, {
        method: "POST",
        body: logData,
      });
    },

    // NOTIFICATIONS
    async getNotifications(userId) {
      return await this.request(`/notifications/${userId}`);
    },

    async markNotificationRead(notificationId) {
      return await this.request(`/notifications/${notificationId}/read`, {
        method: "POST",
      });
    },

    async markAllNotificationsRead(userId) {
      return await this.request(`/notifications/user/${userId}/read-all`, {
        method: "POST",
      });
    },
  };

  // =============================================
  // 5. TOAST NOTIFICATIONS
  // =============================================
  const Toast = {
    container: null,

    init() {
      this.container = Utils.$("#toast-container");
    },

    show(message, type = "info", duration = CONFIG.TOAST_DURATION) {
      if (!this.container) this.init();

      const icons = {
        success: "✓",
        error: "✕",
        warning: "⚠",
        info: "ℹ",
      };

      const toast = document.createElement("div");
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
                <span class="toast-icon">${icons[type] || icons.info}</span>
                <span class="toast-message">${Utils.escapeHtml(message)}</span>
                <button class="toast-close" aria-label="Zamknij">×</button>
            `;

      // Close button
      toast.querySelector(".toast-close").addEventListener("click", () => {
        this.remove(toast);
      });

      this.container.appendChild(toast);

      // Auto remove
      setTimeout(() => {
        this.remove(toast);
      }, duration);

      return toast;
    },

    remove(toast) {
      if (!toast || !toast.parentNode) return;
      toast.classList.add("toast-out");
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    },

    success(message) {
      return this.show(message, "success");
    },

    error(message) {
      return this.show(message, "error");
    },

    warning(message) {
      return this.show(message, "warning");
    },

    info(message) {
      return this.show(message, "info");
    },
  };

  // =============================================
  // 6. MODAL MANAGEMENT
  // =============================================
  const Modal = {
    openModals: [],

    open(modalId) {
      const modal = Utils.$(`#${modalId}`);
      if (!modal) return;

      Utils.show(modal);
      this.openModals.push(modalId);
      document.body.style.overflow = "hidden";

      // Focus first input
      setTimeout(() => {
        const firstInput = modal.querySelector(
          'input:not([type="hidden"]), select, textarea'
        );
        if (firstInput) firstInput.focus();
      }, 100);
    },

    close(modalId) {
      const modal = Utils.$(`#${modalId}`);
      if (!modal) return;

      Utils.hide(modal);
      this.openModals = this.openModals.filter((id) => id !== modalId);

      if (this.openModals.length === 0) {
        document.body.style.overflow = "";
      }

      // Reset form if exists
      const form = modal.querySelector("form");
      if (form) form.reset();
    },

    closeAll() {
      this.openModals.forEach((id) => this.close(id));
    },

    confirm(
      title,
      message,
      onConfirm,
      confirmText = "Potwierdź",
      isDanger = true
    ) {
      Utils.$("#confirm-title").textContent = title;
      Utils.$("#confirm-message").textContent = message;

      const confirmBtn = Utils.$("#confirm-action-btn");
      confirmBtn.textContent = confirmText;
      confirmBtn.className = `btn ${isDanger ? "btn-danger" : "btn-primary"}`;

      // Remove old listener
      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

      // Add new listener
      newBtn.addEventListener("click", () => {
        Modal.close("modal-confirm");
        if (typeof onConfirm === "function") {
          onConfirm();
        }
      });

      this.open("modal-confirm");
    },

    init() {
      // Close buttons
      Utils.$$("[data-close]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const modalId = btn.getAttribute("data-close");
          this.close(modalId);
        });
      });

      // Click on overlay
      Utils.$$(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", () => {
          const modal = overlay.closest(".modal");
          if (modal) this.close(modal.id);
        });
      });

      // ESC key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.openModals.length > 0) {
          this.close(this.openModals[this.openModals.length - 1]);
        }
      });
    },
  };

  // =============================================
  // 7. SCREEN MANAGEMENT
  // =============================================
  const Screen = {
    show(screenId) {
      // Hide all screens
      Utils.$$(".screen").forEach((screen) => {
        screen.classList.remove("active");
      });

      // Show target screen
      const targetScreen = Utils.$(`#screen-${screenId}`);
      if (targetScreen) {
        targetScreen.classList.add("active");
        state.currentScreen = screenId;
      }
    },
  };

  // =============================================
  // 8. AUTH - Logowanie/Wylogowanie
  // =============================================
  const Auth = {
    async init() {
      // Check saved session
      const savedUser = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
      if (savedUser) {
        try {
          state.currentUser = JSON.parse(savedUser);
          this.onLoginSuccess();
        } catch (e) {
          localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
          this.showLoginScreen();
        }
      } else {
        this.showLoginScreen();
      }
    },

    async showLoginScreen() {
      // Load users for dropdown
      try {
        state.users = await API.getUsers();
        this.populateUserSelect();
      } catch (error) {
        Toast.error("Nie udało się załadować użytkowników");
      }

      Screen.show("login");
    },

    populateUserSelect() {
      const select = Utils.$("#login-user");
      select.innerHTML = '<option value="">Wybierz użytkownika...</option>';

      // Group by role
      const admins = state.users.filter((u) => u.role === "admin");
      const drivers = state.users.filter((u) => u.role === "driver");

      if (admins.length > 0) {
        const adminGroup = document.createElement("optgroup");
        adminGroup.label = "👔 Kierownicy";
        admins.forEach((user) => {
          const option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.name;
          adminGroup.appendChild(option);
        });
        select.appendChild(adminGroup);
      }

      if (drivers.length > 0) {
        const driverGroup = document.createElement("optgroup");
        driverGroup.label = "🚗 Kierowcy";
        drivers.forEach((user) => {
          const option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.name;
          driverGroup.appendChild(option);
        });
        select.appendChild(driverGroup);
      }
    },

    async handleLogin(e) {
      e.preventDefault();

      const userId = Utils.$("#login-user").value;
      const pin = Utils.$("#login-pin").value;
      const errorEl = Utils.$("#login-error");
      const submitBtn = Utils.$("#login-submit-btn");

      if (!userId || !pin) {
        Utils.show(errorEl);
        errorEl.textContent = "Wybierz użytkownika i wpisz PIN";
        return;
      }

      // Show loading
      submitBtn.disabled = true;
      Utils.hide(submitBtn.querySelector(".btn-text"));
      Utils.show(submitBtn.querySelector(".btn-loader"));
      Utils.hide(errorEl);

      try {
        const response = await API.login(userId, pin);
        state.currentUser = response.user;
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.USER,
          JSON.stringify(response.user)
        );

        Toast.success(`Witaj, ${response.user.name}!`);
        this.onLoginSuccess();
      } catch (error) {
        Utils.show(errorEl);
        errorEl.textContent = error.message || "Nieprawidłowy PIN";
      } finally {
        submitBtn.disabled = false;
        Utils.show(submitBtn.querySelector(".btn-text"));
        Utils.hide(submitBtn.querySelector(".btn-loader"));
      }
    },

    onLoginSuccess() {
      // Clear login form
      Utils.$("#login-form").reset();

      // Load common data
      this.loadCommonData();

      if (state.currentUser.role === "admin") {
        this.initAdminPanel();
      } else {
        this.initDriverPanel();
      }
    },

    async loadCommonData() {
      try {
        const locations = await API.getLocations();
        state.locations = locations.filter((l) => l.type === "location");
        state.departments = locations.filter((l) => l.type === "department");
      } catch (error) {
        console.error("Failed to load locations:", error);
      }
    },

    initAdminPanel() {
      Utils.$("#admin-user-name").textContent = state.currentUser.name;

      // Set today's date
      state.currentDate = Utils.getToday();
      Utils.$("#admin-date-picker").value = state.currentDate;

      Screen.show("admin");

      // Load data
      AdminPanel.loadTasks();
      AdminPanel.loadUsers();
      AdminPanel.loadLocations();

      // Start notification polling
      Notifications.startPolling();
    },

    initDriverPanel() {
      Utils.$("#driver-user-name").textContent = state.currentUser.name;

      // Set today's date
      state.currentDate = Utils.getToday();
      Utils.$("#driver-date-text").textContent = Utils.formatDate(
        state.currentDate
      );

      Screen.show("driver");

      // Load tasks
      DriverPanel.loadTasks();

      // Start notification polling
      Notifications.startPolling();
    },

    logout() {
      Modal.confirm(
        "Wylogowanie",
        "Czy na pewno chcesz się wylogować?",
        () => {
          // Clear state
          state.currentUser = null;
          state.tasks = [];
          state.notifications = [];

          // Clear storage
          localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);

          // Stop polling
          Notifications.stopPolling();

          // Show login
          Toast.info("Wylogowano pomyślnie");
          this.showLoginScreen();
        },
        "Wyloguj",
        false
      );
    },

    initEventListeners() {
      // Login form
      Utils.$("#login-form").addEventListener("submit", (e) =>
        this.handleLogin(e)
      );

      // Toggle PIN visibility
      Utils.$("#toggle-pin").addEventListener("click", () => {
        const pinInput = Utils.$("#login-pin");
        const eyeIcon = Utils.$("#toggle-pin .eye-icon");
        if (pinInput.type === "password") {
          pinInput.type = "text";
          eyeIcon.textContent = "🙈";
        } else {
          pinInput.type = "password";
          eyeIcon.textContent = "👁️";
        }
      });

      // Logout buttons
      Utils.$("#driver-logout-btn").addEventListener("click", () =>
        this.logout()
      );
      Utils.$("#admin-logout-btn").addEventListener("click", () =>
        this.logout()
      );
    },
  };

  // =============================================
  // 9. NOTIFICATIONS
  // =============================================
  const Notifications = {
    async load() {
      if (!state.currentUser) return;

      try {
        const response = await API.getNotifications(state.currentUser.id);
        state.notifications = response.notifications || [];
        state.unreadNotifications = response.unreadCount || 0;
        this.updateBadge();
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    },

    updateBadge() {
      const driverBadge = Utils.$("#driver-notification-badge");
      const adminBadge = Utils.$("#admin-notification-badge");

      const badge =
        state.currentUser?.role === "admin" ? adminBadge : driverBadge;

      if (badge) {
        if (state.unreadNotifications > 0) {
          badge.textContent =
            state.unreadNotifications > 99 ? "99+" : state.unreadNotifications;
          Utils.show(badge);
        } else {
          Utils.hide(badge);
        }
      }
    },

    startPolling() {
      this.load(); // Initial load
      state.notificationInterval = setInterval(() => {
        this.load();
      }, CONFIG.NOTIFICATION_CHECK_INTERVAL);
    },

    stopPolling() {
      if (state.notificationInterval) {
        clearInterval(state.notificationInterval);
        state.notificationInterval = null;
      }
    },

    renderList() {
      const list = Utils.$("#notifications-list");
      const emptyState = Utils.$("#notifications-empty");

      if (state.notifications.length === 0) {
        list.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);
      list.innerHTML = state.notifications
        .map(
          (notif) => `
                <div class="notification-item ${
                  notif.is_read ? "" : "unread"
                }" data-id="${notif.id}" data-task-id="${notif.task_id || ""}">
                    <div class="notification-icon">${this.getIcon(
                      notif.type
                    )}</div>
                    <div class="notification-content">
                        <div class="notification-title">${Utils.escapeHtml(
                          notif.title
                        )}</div>
                        <div class="notification-message">${Utils.escapeHtml(
                          notif.message
                        )}</div>
                        <div class="notification-time">${Utils.formatRelativeTime(
                          notif.created_at
                        )}</div>
                    </div>
                    ${
                      notif.is_read
                        ? ""
                        : '<div class="notification-unread-dot"></div>'
                    }
                </div>
            `
        )
        .join("");

      // Click handlers
      list.querySelectorAll(".notification-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const id = item.dataset.id;
          const taskId = item.dataset.taskId;

          // Mark as read
          if (item.classList.contains("unread")) {
            try {
              await API.markNotificationRead(id);
              item.classList.remove("unread");
              item.querySelector(".notification-unread-dot")?.remove();
              state.unreadNotifications = Math.max(
                0,
                state.unreadNotifications - 1
              );
              this.updateBadge();
            } catch (error) {
              console.error("Failed to mark notification as read:", error);
            }
          }

          // Open task if has task_id
          if (taskId) {
            Modal.close("modal-notifications");
            if (state.currentUser.role === "admin") {
              AdminPanel.openTaskDetails(taskId);
            } else {
              DriverPanel.openTaskDetails(taskId);
            }
          }
        });
      });
    },

    getIcon(type) {
      const icons = {
        new_task: "📋",
        status_change: "🔄",
        delay: "⏱️",
        problem: "⚠️",
      };
      return icons[type] || "🔔";
    },

    async markAllRead() {
      if (!state.currentUser || state.unreadNotifications === 0) return;

      try {
        await API.markAllNotificationsRead(state.currentUser.id);
        state.notifications.forEach((n) => (n.is_read = 1));
        state.unreadNotifications = 0;
        this.updateBadge();
        this.renderList();
        Toast.success("Wszystkie powiadomienia oznaczone jako przeczytane");
      } catch (error) {
        Toast.error("Nie udało się oznaczyć powiadomień");
      }
    },

    open() {
      this.renderList();
      Modal.open("modal-notifications");
    },

    initEventListeners() {
      // Notification bell buttons
      Utils.$("#driver-notifications-btn")?.addEventListener("click", () =>
        this.open()
      );
      Utils.$("#admin-notifications-btn")?.addEventListener("click", () =>
        this.open()
      );

      // Mark all read button
      Utils.$("#mark-all-read-btn")?.addEventListener("click", () =>
        this.markAllRead()
      );
    },
  };

  // =============================================
  // 10. DATALIST HELPERS
  // =============================================
  const DataLists = {
    updateLocations() {
      const datalist = Utils.$("#datalist-locations");
      if (!datalist) return;

      datalist.innerHTML = [...state.locations, ...state.departments]
        .map((loc) => `<option value="${Utils.escapeHtml(loc.name)}">`)
        .join("");
    },

    updateDepartmentSelects() {
      const selects = [
        Utils.$("#unloading-department"),
        Utils.$("#loading-department"),
      ];

      selects.forEach((select) => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML =
          '<option value="">Wybierz dział...</option>' +
          state.departments
            .map(
              (dept) =>
                `<option value="${Utils.escapeHtml(
                  dept.name
                )}">${Utils.escapeHtml(dept.name)}</option>`
            )
            .join("");
        select.value = currentValue;
      });
    },

    updateDriverSelect() {
      const select = Utils.$("#task-assigned");
      if (!select) return;

      const drivers = state.users.filter((u) => u.role === "driver");
      const currentValue = select.value;

      select.innerHTML =
        '<option value="">Dowolny kierowca</option>' +
        drivers
          .map(
            (driver) =>
              `<option value="${driver.id}">${Utils.escapeHtml(
                driver.name
              )}</option>`
          )
          .join("");

      select.value = currentValue;
    },

    updateAll() {
      this.updateLocations();
      this.updateDepartmentSelects();
      this.updateDriverSelect();
    },
  };

  // =============================================
  // 11. INICJALIZACJA
  // =============================================
  async function init() {
    console.log("🚛 TransportTracker initializing...");

    // Initialize modules
    Toast.init();
    Modal.init();
    Auth.initEventListeners();
    Notifications.initEventListeners();

    // Show loading screen briefly
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Initialize auth (will determine which screen to show)
    await Auth.init();

    console.log("✅ TransportTracker ready!");
  }

  // Start app when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // =============================================
  // EXPORT (dla kolejnych części)
  // =============================================
  window.TransportTracker = {
    state,
    Utils,
    API,
    Toast,
    Modal,
    Screen,
    Auth,
    Notifications,
    DataLists,
    CONFIG,
  };

  // =============================================
  // 12. DRIVER PANEL
  // =============================================
  const DriverPanel = {
    async loadTasks() {
      const tasksList = Utils.$("#driver-tasks-list");
      const emptyState = Utils.$("#driver-tasks-empty");

      try {
        state.tasks = await API.getTasks({
          date: state.currentDate,
        });

        this.updateStats();
        this.renderTasks();
      } catch (error) {
        Toast.error("Nie udało się załadować zadań");
        console.error(error);
      }
    },

    updateStats() {
      const pending = state.tasks.filter((t) => t.status === "pending").length;
      const inProgress = state.tasks.filter(
        (t) => t.status === "in_progress"
      ).length;
      const completed = state.tasks.filter(
        (t) => t.status === "completed"
      ).length;

      Utils.$("#driver-stat-pending").textContent = pending;
      Utils.$("#driver-stat-progress").textContent = inProgress;
      Utils.$("#driver-stat-done").textContent = completed;
    },

    renderTasks() {
      const tasksList = Utils.$("#driver-tasks-list");
      const emptyState = Utils.$("#driver-tasks-empty");

      // Filter tasks
      let filteredTasks = state.tasks;
      if (state.currentFilter !== "all") {
        filteredTasks = state.tasks.filter(
          (t) => t.status === state.currentFilter
        );
      }

      if (filteredTasks.length === 0) {
        tasksList.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);
      tasksList.innerHTML = filteredTasks
        .map((task) => this.renderTaskCard(task))
        .join("");

      // Add event listeners
      this.attachTaskEventListeners();
    },

    renderTaskCard(task) {
      const priorityIcon = Utils.getPriorityIcon(task.priority);
      const typeIcon = Utils.getTaskTypeIcon(task.task_type);
      const typeLabel = Utils.getTaskTypeLabel(task.task_type);
      const statusIcon = Utils.getStatusIcon(task.status);
      const statusLabel = Utils.getStatusLabel(task.status);

      // Build description based on task type
      let taskDescription = "";
      if (task.task_type === "transport") {
        taskDescription = `
                    <div class="task-route">
                        <span>📍 ${Utils.escapeHtml(
                          task.location_from || "?"
                        )}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(
                          task.location_to || "?"
                        )}</span>
                    </div>
                `;
      } else {
        taskDescription = `
                    <div class="task-department">
                        <span>🏢</span>
                        <span>${Utils.escapeHtml(
                          task.department || "Nie określono"
                        )}</span>
                    </div>
                `;
      }

      // Material/description
      const materialHtml = task.material
        ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
        : "";

      // Notes preview
      const notesHtml = task.notes
        ? `
                <div class="task-notes-preview">
                    <span>💬</span>
                    <span>${Utils.escapeHtml(task.notes)}</span>
                </div>
            `
        : "";

      // Action buttons based on status
      let actionButtons = "";
      if (task.status === "pending") {
        actionButtons = `
                    <button class="task-action-btn btn-start" data-action="start" data-id="${task.id}" title="Rozpocznij">
                        ▶️
                    </button>
                `;
      } else if (task.status === "in_progress") {
        actionButtons = `
                    <button class="task-action-btn" data-action="add-log" data-id="${task.id}" title="Dodaj uwagę">
                        📝
                    </button>
                    <button class="task-action-btn btn-complete" data-action="complete" data-id="${task.id}" title="Zakończ">
                        ✅
                    </button>
                `;
      }

      return `
                <div class="task-card priority-${task.priority} status-${
        task.status
      }" data-id="${task.id}">
                    <div class="task-status-indicator status-${task.status}">
                        ${statusIcon} ${statusLabel}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-type-badge type-${
                              task.task_type
                            }">
                                ${typeIcon} ${typeLabel}
                            </span>
                            <span class="task-priority-badge priority-${
                              task.priority
                            }">
                                ${priorityIcon} ${Utils.getPriorityLabel(
        task.priority
      )}
                            </span>
                            ${
                              task.sort_order
                                ? `<span class="task-order-badge">#${task.sort_order}</span>`
                                : ""
                            }
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${
                      task.id
                    }">
                        <div class="task-title">${Utils.escapeHtml(
                          task.description
                        )}</div>
                        <div class="task-description">
                            ${taskDescription}
                            ${materialHtml}
                        </div>
                        ${notesHtml}
                    </div>
                    
                    <div class="task-footer">
                        <div class="task-meta">
                            ${
                              task.scheduled_time
                                ? `
                                <span class="task-meta-item">
                                    <span>🕐</span>
                                    <span>${Utils.formatTime(
                                      task.scheduled_time
                                    )}</span>
                                </span>
                            `
                                : ""
                            }
                            ${
                              task.assigned_name
                                ? `
                                <span class="task-meta-item">
                                    <span>👤</span>
                                    <span>${Utils.escapeHtml(
                                      task.assigned_name
                                    )}</span>
                                </span>
                            `
                                : ""
                            }
                        </div>
                        <div class="task-actions">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
    },

    attachTaskEventListeners() {
      // Task actions
      Utils.$$("#driver-tasks-list [data-action]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = el.dataset.action;
          const taskId = el.dataset.id;

          switch (action) {
            case "start":
              this.startTask(taskId);
              break;
            case "complete":
              this.completeTask(taskId);
              break;
            case "add-log":
              this.openLogModal(taskId);
              break;
            case "details":
              this.openTaskDetails(taskId);
              break;
          }
        });
      });
    },

    async startTask(taskId) {
      Modal.confirm(
        "Rozpocząć zadanie?",
        "Czy chcesz rozpocząć wykonywanie tego zadania?",
        async () => {
          try {
            await API.updateTaskStatus(
              taskId,
              "in_progress",
              state.currentUser.id
            );
            Toast.success("Zadanie rozpoczęte!");
            this.loadTasks();
          } catch (error) {
            Toast.error("Nie udało się rozpocząć zadania");
          }
        },
        "Rozpocznij",
        false
      );
    },

    async completeTask(taskId) {
      Modal.confirm(
        "Zakończyć zadanie?",
        "Czy na pewno chcesz oznaczyć zadanie jako wykonane?",
        async () => {
          try {
            await API.updateTaskStatus(
              taskId,
              "completed",
              state.currentUser.id
            );
            Toast.success("Zadanie zakończone! 🎉");
            this.loadTasks();
          } catch (error) {
            Toast.error("Nie udało się zakończyć zadania");
          }
        },
        "Zakończ",
        false
      );
    },

    openLogModal(taskId) {
      Utils.$("#log-task-id").value = taskId;
      Utils.$("#task-log-form").reset();

      // Show note fields by default
      this.toggleLogFields("note");

      Modal.open("modal-task-log");
    },

    toggleLogFields(type) {
      Utils.$$(".log-fields").forEach((el) => Utils.hide(el));
      Utils.show(`#log-fields-${type}`);
    },

    async handleLogSubmit(e) {
      e.preventDefault();

      const taskId = Utils.$("#log-task-id").value;
      const logType = document.querySelector(
        'input[name="log-type"]:checked'
      ).value;

      const logData = {
        userId: state.currentUser.id,
        logType,
      };

      // Get data based on log type
      if (logType === "note") {
        logData.message = Utils.$("#log-message").value.trim();
        if (!logData.message) {
          Toast.warning("Wpisz treść uwagi");
          return;
        }
      } else if (logType === "delay") {
        logData.delayReason = Utils.$("#delay-reason").value;
        logData.delayMinutes = parseInt(Utils.$("#delay-minutes").value) || 0;
        logData.message = Utils.$("#delay-details").value.trim();

        if (!logData.delayReason) {
          Toast.warning("Wybierz powód przestoju");
          return;
        }
      } else if (logType === "problem") {
        logData.message = Utils.$("#problem-message").value.trim();
        if (!logData.message) {
          Toast.warning("Opisz problem");
          return;
        }
      }

      try {
        await API.createTaskLog(taskId, logData);
        Modal.close("modal-task-log");
        Toast.success("Zapisano!");

        // Refresh task details if open
        const detailModal = Utils.$("#modal-task-detail");
        if (!detailModal.classList.contains("hidden")) {
          this.openTaskDetails(taskId);
        }
      } catch (error) {
        Toast.error("Nie udało się zapisać");
      }
    },

    async openTaskDetails(taskId) {
      try {
        const task = await API.getTask(taskId);
        this.renderTaskDetails(task);
        Modal.open("modal-task-detail");
      } catch (error) {
        Toast.error("Nie udało się załadować szczegółów");
      }
    },

    renderTaskDetails(task) {
      const content = Utils.$("#task-detail-content");
      const isDriver = state.currentUser.role === "driver";

      // Build info based on task type
      let locationInfo = "";
      if (task.task_type === "transport") {
        locationInfo = `
                    <div class="task-detail-row">
                        <span class="task-detail-label">Skąd</span>
                        <span class="task-detail-value">📍 ${Utils.escapeHtml(
                          task.location_from || "-"
                        )}</span>
                    </div>
                    <div class="task-detail-row">
                        <span class="task-detail-label">Dokąd</span>
                        <span class="task-detail-value">📍 ${Utils.escapeHtml(
                          task.location_to || "-"
                        )}</span>
                    </div>
                `;
      } else {
        locationInfo = `
                    <div class="task-detail-row">
                        <span class="task-detail-label">Dział</span>
                        <span class="task-detail-value">🏢 ${Utils.escapeHtml(
                          task.department || "-"
                        )}</span>
                    </div>
                `;
      }

      // Logs section
      let logsHtml = "";
      if (task.logs && task.logs.length > 0) {
        logsHtml = `
                    <div class="task-logs-section">
                        <h4>Historia i uwagi</h4>
                        ${task.logs
                          .map(
                            (log) => `
                            <div class="task-log-item log-${log.log_type}">
                                <span class="task-log-icon">${Utils.getLogTypeIcon(
                                  log.log_type
                                )}</span>
                                <div class="task-log-content">
                                    <div class="task-log-message">
                                        ${
                                          log.log_type === "delay"
                                            ? `<strong>${Utils.getDelayReasonLabel(
                                                log.delay_reason
                                              )}</strong> (${
                                                log.delay_minutes || 0
                                              } min)`
                                            : ""
                                        }
                                        ${
                                          log.message
                                            ? Utils.escapeHtml(log.message)
                                            : ""
                                        }
                                        ${
                                          log.log_type === "status_change"
                                            ? Utils.escapeHtml(log.message)
                                            : ""
                                        }
                                    </div>
                                    <div class="task-log-meta">
                                        ${Utils.escapeHtml(
                                          log.user_name || "Nieznany"
                                        )} • ${Utils.formatRelativeTime(
                              log.created_at
                            )}
                                    </div>
                                </div>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                `;
      }

      // Action buttons for driver
      let actionsHtml = "";
      if (isDriver) {
        if (task.status === "pending") {
          actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-primary btn-block" onclick="TransportTracker.DriverPanel.startTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ▶️ Rozpocznij zadanie
                            </button>
                        </div>
                    `;
        } else if (task.status === "in_progress") {
          actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-secondary" onclick="TransportTracker.DriverPanel.openLogModal(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                📝 Dodaj uwagę
                            </button>
                            <button class="btn btn-success" onclick="TransportTracker.DriverPanel.completeTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ✅ Zakończ
                            </button>
                        </div>
                    `;
        }
      } else {
        // Admin actions
        actionsHtml = `
                    <div class="task-detail-actions">
                        <button class="btn btn-secondary" onclick="TransportTracker.AdminPanel.openPriorityModal(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                            🎯 Zmień priorytet
                        </button>
                        <button class="btn btn-primary" onclick="TransportTracker.AdminPanel.editTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                            ✏️ Edytuj
                        </button>
                    </div>
                `;
      }

      content.innerHTML = `
                <div class="task-detail-header">
                    <span class="task-type-badge type-${task.task_type}">
                        ${Utils.getTaskTypeIcon(
                          task.task_type
                        )} ${Utils.getTaskTypeLabel(task.task_type)}
                    </span>
                    <span class="task-priority-badge priority-${task.priority}">
                        ${Utils.getPriorityIcon(
                          task.priority
                        )} ${Utils.getPriorityLabel(task.priority)}
                    </span>
                    <span class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(
                          task.status
                        )} ${Utils.getStatusLabel(task.status)}
                    </span>
                </div>
                
                <h3 class="task-detail-title">${Utils.escapeHtml(
                  task.description
                )}</h3>
                
                <div class="task-detail-section">
                    <h4>Szczegóły</h4>
                    ${locationInfo}
                    ${
                      task.material
                        ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Materiał</span>
                            <span class="task-detail-value">📦 ${Utils.escapeHtml(
                              task.material
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                    <div class="task-detail-row">
                        <span class="task-detail-label">Data</span>
                        <span class="task-detail-value">📅 ${Utils.formatDate(
                          task.scheduled_date
                        )}</span>
                    </div>
                    ${
                      task.scheduled_time
                        ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Godzina</span>
                            <span class="task-detail-value">🕐 ${Utils.formatTime(
                              task.scheduled_time
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                    ${
                      task.assigned_name
                        ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Przypisany</span>
                            <span class="task-detail-value">👤 ${Utils.escapeHtml(
                              task.assigned_name
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                    ${
                      task.creator_name
                        ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Utworzył</span>
                            <span class="task-detail-value">👔 ${Utils.escapeHtml(
                              task.creator_name
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                </div>
                
                ${
                  task.notes
                    ? `
                    <div class="task-detail-section">
                        <h4>Uwagi od kierownika</h4>
                        <div class="task-notes-preview">
                            <span>💬</span>
                            <span>${Utils.escapeHtml(task.notes)}</span>
                        </div>
                    </div>
                `
                    : ""
                }
                
                ${logsHtml}
                
                ${actionsHtml}
            `;
    },

    setFilter(filter) {
      state.currentFilter = filter;

      // Update active button
      Utils.$$(".filters-row .filter-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === filter);
      });

      this.renderTasks();
    },

    initEventListeners() {
      // Filter buttons
      Utils.$$("#screen-driver .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.setFilter(btn.dataset.filter);
        });
      });

      // Stats box click (filter shortcut)
      Utils.$$("#screen-driver .stat-box").forEach((box) => {
        box.addEventListener("click", () => {
          const filter = box.dataset.filter;
          if (filter) this.setFilter(filter);
        });
      });

      // Log form
      Utils.$("#task-log-form").addEventListener("submit", (e) =>
        this.handleLogSubmit(e)
      );

      // Log type change
      Utils.$$('input[name="log-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          this.toggleLogFields(radio.value);
        });
      });
    },
  };

  // =============================================
  // 13. TASK FORM (Shared between Admin)
  // =============================================
  const TaskForm = {
    currentTaskId: null,
    isEditing: false,

    open(taskId = null) {
      this.currentTaskId = taskId;
      this.isEditing = !!taskId;

      // Update title
      Utils.$("#modal-task-title").textContent = this.isEditing
        ? "Edytuj zadanie"
        : "Nowe zadanie";

      // Reset form
      Utils.$("#task-form").reset();
      Utils.$("#task-id").value = "";

      // Set default date
      Utils.$("#task-date").value = state.currentDate;

      // Update datalists
      DataLists.updateAll();

      // Show transport fields by default
      this.toggleTaskFields("transport");

      if (this.isEditing) {
        this.loadTask(taskId);
      } else {
        Modal.open("modal-task");
      }
    },

    async loadTask(taskId) {
      try {
        const task = await API.getTask(taskId);
        this.populateForm(task);
        Modal.open("modal-task");
      } catch (error) {
        Toast.error("Nie udało się załadować zadania");
      }
    },

    populateForm(task) {
      Utils.$("#task-id").value = task.id;

      // Task type
      const typeRadio = document.querySelector(
        `input[name="task-type"][value="${task.task_type}"]`
      );
      if (typeRadio) typeRadio.checked = true;
      this.toggleTaskFields(task.task_type);

      // Type-specific fields
      if (task.task_type === "transport") {
        Utils.$("#transport-material").value = task.material || "";
        Utils.$("#transport-from").value = task.location_from || "";
        Utils.$("#transport-to").value = task.location_to || "";
      } else if (task.task_type === "unloading") {
        Utils.$("#unloading-material").value =
          task.material || task.description || "";
        Utils.$("#unloading-department").value = task.department || "";
      } else if (task.task_type === "loading") {
        Utils.$("#loading-material").value =
          task.material || task.description || "";
        Utils.$("#loading-department").value = task.department || "";
      }

      // Common fields
      Utils.$("#task-date").value = task.scheduled_date || "";
      Utils.$("#task-time").value = task.scheduled_time || "";
      Utils.$("#task-notes").value = task.notes || "";
      Utils.$("#task-assigned").value = task.assigned_to || "";

      // Priority
      const priorityRadio = document.querySelector(
        `input[name="task-priority"][value="${task.priority}"]`
      );
      if (priorityRadio) priorityRadio.checked = true;
    },

    toggleTaskFields(type) {
      Utils.$$(".task-fields").forEach((el) => Utils.hide(el));
      Utils.show(`#fields-${type}`);
    },

    getFormData() {
      const taskType = document.querySelector(
        'input[name="task-type"]:checked'
      ).value;
      const priority = document.querySelector(
        'input[name="task-priority"]:checked'
      ).value;

      const data = {
        task_type: taskType,
        scheduled_date: Utils.$("#task-date").value,
        scheduled_time: Utils.$("#task-time").value || null,
        priority,
        notes: Utils.$("#task-notes").value.trim() || null,
        assigned_to: Utils.$("#task-assigned").value || null,
        created_by: state.currentUser.id,
      };

      // Type-specific data
      if (taskType === "transport") {
        data.material = Utils.$("#transport-material").value.trim();
        data.description = data.material;
        data.location_from = Utils.$("#transport-from").value.trim();
        data.location_to = Utils.$("#transport-to").value.trim();
      } else if (taskType === "unloading") {
        data.material = Utils.$("#unloading-material").value.trim();
        data.description = `Rozładunek: ${data.material}`;
        data.department = Utils.$("#unloading-department").value;
      } else if (taskType === "loading") {
        data.material = Utils.$("#loading-material").value.trim();
        data.description = `Załadunek: ${data.material}`;
        data.department = Utils.$("#loading-department").value;
      }

      return data;
    },

    validate(data) {
      if (!data.scheduled_date) {
        Toast.warning("Wybierz datę");
        return false;
      }

      if (data.task_type === "transport") {
        if (!data.material) {
          Toast.warning("Wpisz co jest przewożone");
          return false;
        }
        if (!data.location_from || !data.location_to) {
          Toast.warning("Podaj lokalizację początkową i końcową");
          return false;
        }
      } else if (data.task_type === "unloading") {
        if (!data.material) {
          Toast.warning("Wpisz nazwę/opis rozładunku");
          return false;
        }
        if (!data.department) {
          Toast.warning("Wybierz dział");
          return false;
        }
      } else if (data.task_type === "loading") {
        if (!data.material) {
          Toast.warning("Wpisz rodzaj materiału");
          return false;
        }
        if (!data.department) {
          Toast.warning("Wybierz dział");
          return false;
        }
      }

      return true;
    },

    async handleSubmit(e) {
      e.preventDefault();

      const data = this.getFormData();

      if (!this.validate(data)) {
        return;
      }

      const taskId = Utils.$("#task-id").value;

      try {
        if (taskId) {
          await API.updateTask(taskId, data);
          Toast.success("Zadanie zaktualizowane!");
        } else {
          await API.createTask(data);
          Toast.success("Zadanie dodane!");
        }

        Modal.close("modal-task");
        AdminPanel.loadTasks();
      } catch (error) {
        Toast.error("Nie udało się zapisać zadania");
      }
    },

    initEventListeners() {
      // Task type radio change
      Utils.$$('input[name="task-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          this.toggleTaskFields(radio.value);
        });
      });

      // Form submit
      Utils.$("#task-form").addEventListener("submit", (e) =>
        this.handleSubmit(e)
      );
    },
  };

  // =============================================
  // AKTUALIZACJA EXPORTU
  // =============================================
  window.TransportTracker.DriverPanel = DriverPanel;
  window.TransportTracker.TaskForm = TaskForm;

  // =============================================
  // INICJALIZACJA EVENT LISTENERÓW
  // =============================================
  DriverPanel.initEventListeners();
  TaskForm.initEventListeners();

  // =============================================
  // 14. ADMIN PANEL
  // =============================================
  const AdminPanel = {
    async loadTasks() {
      try {
        state.tasks = await API.getTasks({
          date: state.currentDate,
        });

        this.updateStats();
        this.updateDateDisplay();
        this.renderTasks();
      } catch (error) {
        Toast.error("Nie udało się załadować zadań");
        console.error(error);
      }
    },

    updateStats() {
      const pending = state.tasks.filter((t) => t.status === "pending").length;
      const inProgress = state.tasks.filter(
        (t) => t.status === "in_progress"
      ).length;
      const completed = state.tasks.filter(
        (t) => t.status === "completed"
      ).length;

      Utils.$("#admin-stat-pending").textContent = pending;
      Utils.$("#admin-stat-progress").textContent = inProgress;
      Utils.$("#admin-stat-done").textContent = completed;
    },

    updateDateDisplay() {
      const dateText = Utils.isToday(state.currentDate)
        ? `Dziś, ${Utils.formatDate(state.currentDate)}`
        : Utils.formatDate(state.currentDate);

      Utils.$("#admin-date-display").textContent = dateText;
    },

    renderTasks() {
      const tasksList = Utils.$("#admin-tasks-list");
      const emptyState = Utils.$("#admin-tasks-empty");

      if (state.tasks.length === 0) {
        tasksList.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      // Sort by sort_order, then priority
      const sortedTasks = [...state.tasks].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return (a.sort_order || 999) - (b.sort_order || 999);
        }
        const priorityOrder = { high: 1, normal: 2, low: 3 };
        return (
          (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
        );
      });

      tasksList.innerHTML = sortedTasks
        .map((task, index) => this.renderTaskCard(task, index + 1))
        .join("");

      // Add event listeners
      this.attachTaskEventListeners();

      // Init drag & drop if in reorder mode
      if (state.isReorderMode) {
        this.initDragAndDrop();
      }
    },

    renderTaskCard(task, order) {
      const priorityIcon = Utils.getPriorityIcon(task.priority);
      const typeIcon = Utils.getTaskTypeIcon(task.task_type);
      const typeLabel = Utils.getTaskTypeLabel(task.task_type);
      const statusIcon = Utils.getStatusIcon(task.status);
      const statusLabel = Utils.getStatusLabel(task.status);

      // Build description based on task type
      let taskDescription = "";
      if (task.task_type === "transport") {
        taskDescription = `
                    <div class="task-route">
                        <span>📍 ${Utils.escapeHtml(
                          task.location_from || "?"
                        )}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(
                          task.location_to || "?"
                        )}</span>
                    </div>
                `;
      } else {
        taskDescription = `
                    <div class="task-department">
                        <span>🏢</span>
                        <span>${Utils.escapeHtml(
                          task.department || "Nie określono"
                        )}</span>
                    </div>
                `;
      }

      // Material
      const materialHtml = task.material
        ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
        : "";

      // Assigned driver
      const assignedHtml = task.assigned_name
        ? `
                <span class="task-meta-item">
                    <span>👤</span>
                    <span>${Utils.escapeHtml(task.assigned_name)}</span>
                </span>
            `
        : "";

      // Logs count indicator
      const hasLogs = task.logs && task.logs.length > 0;
      const logsHtml = hasLogs
        ? `
                <span class="task-logs-indicator">
                    📋 ${task.logs.length}
                </span>
            `
        : "";

      return `
                <div class="task-card priority-${task.priority} status-${
        task.status
      }" 
                     data-id="${task.id}" 
                     draggable="${state.isReorderMode}">
                    
                    <div class="task-drag-handle">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="6" r="2"/>
                            <circle cx="15" cy="6" r="2"/>
                            <circle cx="9" cy="12" r="2"/>
                            <circle cx="15" cy="12" r="2"/>
                            <circle cx="9" cy="18" r="2"/>
                            <circle cx="15" cy="18" r="2"/>
                        </svg>
                    </div>
                    
                    <div class="task-status-indicator status-${task.status}">
                        ${statusIcon} ${statusLabel}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-order-badge">#${order}</span>
                            <span class="task-type-badge type-${
                              task.task_type
                            }">
                                ${typeIcon} ${typeLabel}
                            </span>
                            <span class="task-priority-badge priority-${
                              task.priority
                            }" 
                                  data-action="change-priority" data-id="${
                                    task.id
                                  }" 
                                  title="Kliknij aby zmienić priorytet" style="cursor: pointer;">
                                ${priorityIcon} ${Utils.getPriorityLabel(
        task.priority
      )}
                            </span>
                            ${logsHtml}
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${
                      task.id
                    }">
                        <div class="task-title">${Utils.escapeHtml(
                          task.description
                        )}</div>
                        <div class="task-description">
                            ${taskDescription}
                            ${materialHtml}
                        </div>
                    </div>
                    
                    <div class="task-footer">
                        <div class="task-meta">
                            ${
                              task.scheduled_time
                                ? `
                                <span class="task-meta-item">
                                    <span>🕐</span>
                                    <span>${Utils.formatTime(
                                      task.scheduled_time
                                    )}</span>
                                </span>
                            `
                                : ""
                            }
                            ${assignedHtml}
                        </div>
                        <div class="task-actions">
                            <button class="task-action-btn" data-action="edit" data-id="${
                              task.id
                            }" title="Edytuj">
                                ✏️
                            </button>
                            <button class="task-action-btn btn-delete" data-action="delete" data-id="${
                              task.id
                            }" title="Usuń">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
    },

    attachTaskEventListeners() {
      Utils.$$("#admin-tasks-list [data-action]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = el.dataset.action;
          const taskId = el.dataset.id;

          switch (action) {
            case "edit":
              this.editTask(taskId);
              break;
            case "delete":
              this.deleteTask(taskId);
              break;
            case "details":
              this.openTaskDetails(taskId);
              break;
            case "change-priority":
              this.openPriorityModal(taskId);
              break;
          }
        });
      });
    },

    editTask(taskId) {
      TaskForm.open(taskId);
    },

    async deleteTask(taskId) {
      const task = state.tasks.find((t) => t.id == taskId);

      Modal.confirm(
        "Usunąć zadanie?",
        `Czy na pewno chcesz usunąć zadanie "${
          task?.description || ""
        }"? Tej operacji nie można cofnąć.`,
        async () => {
          try {
            await API.deleteTask(taskId);
            Toast.success("Zadanie usunięte");
            this.loadTasks();
          } catch (error) {
            Toast.error("Nie udało się usunąć zadania");
          }
        }
      );
    },

    async openTaskDetails(taskId) {
      try {
        const task = await API.getTask(taskId);
        DriverPanel.renderTaskDetails(task);
        Modal.open("modal-task-detail");
      } catch (error) {
        Toast.error("Nie udało się załadować szczegółów");
      }
    },

    openPriorityModal(taskId) {
      Utils.$("#priority-task-id").value = taskId;

      // Highlight current priority
      const task = state.tasks.find((t) => t.id == taskId);
      Utils.$$(".priority-select-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.priority === task?.priority);
      });

      Modal.open("modal-priority");
    },

    async changePriority(taskId, newPriority) {
      try {
        const task = state.tasks.find((t) => t.id == taskId);
        if (!task) return;

        await API.updateTask(taskId, {
          ...task,
          priority: newPriority,
        });

        Modal.close("modal-priority");
        Toast.success("Priorytet zmieniony");
        this.loadTasks();
      } catch (error) {
        Toast.error("Nie udało się zmienić priorytetu");
      }
    },

    // =============================================
    // DATE NAVIGATION
    // =============================================
    changeDate(days) {
      state.currentDate = Utils.addDays(state.currentDate, days);
      Utils.$("#admin-date-picker").value = state.currentDate;
      this.loadTasks();
    },

    goToToday() {
      state.currentDate = Utils.getToday();
      Utils.$("#admin-date-picker").value = state.currentDate;
      this.loadTasks();
    },

    setDate(date) {
      state.currentDate = date;
      this.loadTasks();
    },

    // =============================================
    // REORDER MODE (Drag & Drop)
    // =============================================
    toggleReorderMode() {
      state.isReorderMode = !state.isReorderMode;

      const tasksList = Utils.$("#admin-tasks-list");
      const toggleBtn = Utils.$("#toggle-reorder-btn");
      const reorderInfo = Utils.$("#reorder-info");

      tasksList.classList.toggle("reorder-mode", state.isReorderMode);
      Utils.toggle(reorderInfo, state.isReorderMode);

      toggleBtn.innerHTML = state.isReorderMode
        ? "❌ Anuluj zmianę kolejności"
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                   </svg>
                   <span>Zmień kolejność zadań</span>`;

      if (state.isReorderMode) {
        // Store original order
        state.reorderTaskIds = state.tasks.map((t) => t.id);
        this.renderTasks();
      } else {
        this.renderTasks();
      }
    },

    cancelReorder() {
      state.isReorderMode = false;
      state.reorderTaskIds = [];

      const tasksList = Utils.$("#admin-tasks-list");
      tasksList.classList.remove("reorder-mode");
      Utils.hide("#reorder-info");

      Utils.$("#toggle-reorder-btn").innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span>Zmień kolejność zadań</span>
            `;

      this.loadTasks();
    },

    async saveReorder() {
      try {
        const taskCards = Utils.$$("#admin-tasks-list .task-card");
        const newOrder = Array.from(taskCards).map((card) =>
          parseInt(card.dataset.id)
        );

        await API.reorderTasks(newOrder);

        state.isReorderMode = false;
        state.reorderTaskIds = [];

        Utils.$("#admin-tasks-list").classList.remove("reorder-mode");
        Utils.hide("#reorder-info");
        Utils.$("#toggle-reorder-btn").innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <span>Zmień kolejność zadań</span>
                `;

        Toast.success("Kolejność zapisana!");
        this.loadTasks();
      } catch (error) {
        Toast.error("Nie udało się zapisać kolejności");
      }
    },

    initDragAndDrop() {
      const tasksList = Utils.$("#admin-tasks-list");
      const cards = tasksList.querySelectorAll(".task-card");

      let draggedItem = null;

      cards.forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          draggedItem = card;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });

        card.addEventListener("dragend", () => {
          draggedItem.classList.remove("dragging");
          draggedItem = null;
          cards.forEach((c) => c.classList.remove("drag-over"));
        });

        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";

          if (card !== draggedItem) {
            card.classList.add("drag-over");
          }
        });

        card.addEventListener("dragleave", () => {
          card.classList.remove("drag-over");
        });

        card.addEventListener("drop", (e) => {
          e.preventDefault();
          card.classList.remove("drag-over");

          if (draggedItem && card !== draggedItem) {
            const allCards = Array.from(
              tasksList.querySelectorAll(".task-card")
            );
            const draggedIdx = allCards.indexOf(draggedItem);
            const targetIdx = allCards.indexOf(card);

            if (draggedIdx < targetIdx) {
              card.parentNode.insertBefore(draggedItem, card.nextSibling);
            } else {
              card.parentNode.insertBefore(draggedItem, card);
            }

            // Update order badges
            this.updateOrderBadges();
          }
        });
      });

      // Touch support for mobile
      this.initTouchDragAndDrop(tasksList);
    },

    initTouchDragAndDrop(container) {
      let draggedItem = null;
      let touchStartY = 0;
      let touchCurrentY = 0;
      let placeholder = null;

      const cards = container.querySelectorAll(".task-card");

      cards.forEach((card) => {
        const handle = card.querySelector(".task-drag-handle");
        if (!handle) return;

        handle.addEventListener(
          "touchstart",
          (e) => {
            draggedItem = card;
            touchStartY = e.touches[0].clientY;

            // Create placeholder
            placeholder = document.createElement("div");
            placeholder.className = "task-card-placeholder";
            placeholder.style.height = card.offsetHeight + "px";
            placeholder.style.background = "var(--primary-bg)";
            placeholder.style.border = "2px dashed var(--primary)";
            placeholder.style.borderRadius = "var(--border-radius-lg)";
            placeholder.style.marginBottom = "var(--spacing-md)";

            card.classList.add("dragging");
            card.style.position = "fixed";
            card.style.zIndex = "1000";
            card.style.width = card.offsetWidth + "px";
            card.style.left = card.getBoundingClientRect().left + "px";
            card.style.top = card.getBoundingClientRect().top + "px";

            card.parentNode.insertBefore(placeholder, card);
          },
          { passive: true }
        );

        handle.addEventListener(
          "touchmove",
          (e) => {
            if (!draggedItem) return;

            touchCurrentY = e.touches[0].clientY;
            const deltaY = touchCurrentY - touchStartY;

            draggedItem.style.transform = `translateY(${deltaY}px)`;

            // Find drop target
            const otherCards = Array.from(
              container.querySelectorAll(".task-card:not(.dragging)")
            );

            otherCards.forEach((otherCard) => {
              const rect = otherCard.getBoundingClientRect();
              const midY = rect.top + rect.height / 2;

              if (touchCurrentY < midY && touchCurrentY > rect.top - 20) {
                container.insertBefore(placeholder, otherCard);
              } else if (
                touchCurrentY > midY &&
                touchCurrentY < rect.bottom + 20
              ) {
                container.insertBefore(placeholder, otherCard.nextSibling);
              }
            });
          },
          { passive: true }
        );

        handle.addEventListener("touchend", () => {
          if (!draggedItem || !placeholder) return;

          // Move card to placeholder position
          container.insertBefore(draggedItem, placeholder);
          placeholder.remove();

          // Reset styles
          draggedItem.classList.remove("dragging");
          draggedItem.style.position = "";
          draggedItem.style.zIndex = "";
          draggedItem.style.width = "";
          draggedItem.style.left = "";
          draggedItem.style.top = "";
          draggedItem.style.transform = "";

          draggedItem = null;
          placeholder = null;

          // Update order badges
          this.updateOrderBadges();
        });
      });
    },

    updateOrderBadges() {
      const cards = Utils.$$("#admin-tasks-list .task-card");
      cards.forEach((card, index) => {
        const badge = card.querySelector(".task-order-badge");
        if (badge) {
          badge.textContent = `#${index + 1}`;
        }
      });
    },

    // =============================================
    // USERS MANAGEMENT
    // =============================================
    async loadUsers() {
      try {
        state.users = await API.getUsers();
        this.renderUsers();
        DataLists.updateDriverSelect();
      } catch (error) {
        Toast.error("Nie udało się załadować użytkowników");
      }
    },

    renderUsers() {
      const list = Utils.$("#users-list");
      const emptyState = Utils.$("#users-empty");

      if (state.users.length === 0) {
        list.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      list.innerHTML = state.users
        .map(
          (user) => `
                <div class="user-card" data-id="${user.id}">
                    <div class="user-info">
                        <div class="user-avatar ${
                          user.role === "admin" ? "admin" : ""
                        }">
                            ${user.role === "admin" ? "👔" : "🚗"}
                        </div>
                        <div class="user-details">
                            <h3>${Utils.escapeHtml(user.name)}</h3>
                            <p>${
                              user.role === "admin" ? "Kierownik" : "Kierowca"
                            }</p>
                        </div>
                    </div>
                    <div class="user-actions">
                        <button class="task-action-btn" data-action="edit-user" data-id="${
                          user.id
                        }" title="Edytuj">
                            ✏️
                        </button>
                        <button class="task-action-btn btn-delete" data-action="delete-user" data-id="${
                          user.id
                        }" title="Usuń">
                            🗑️
                        </button>
                    </div>
                </div>
            `
        )
        .join("");

      // Event listeners
      list.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          const userId = btn.dataset.id;

          if (action === "edit-user") {
            this.openUserModal(userId);
          } else if (action === "delete-user") {
            this.deleteUser(userId);
          }
        });
      });
    },

    openUserModal(userId = null) {
      const isEdit = !!userId;

      Utils.$("#modal-user-title").textContent = isEdit
        ? "Edytuj użytkownika"
        : "Nowy użytkownik";
      Utils.$("#user-form").reset();
      Utils.$("#user-id").value = "";
      Utils.$("#pin-hint").classList.toggle("hidden", !isEdit);
      Utils.$("#user-pin").required = !isEdit;

      if (isEdit) {
        const user = state.users.find((u) => u.id == userId);
        if (user) {
          Utils.$("#user-id").value = user.id;
          Utils.$("#user-name").value = user.name;
          document.querySelector(
            `input[name="user-role"][value="${user.role}"]`
          ).checked = true;
        }
      }

      Modal.open("modal-user");
    },

    async handleUserSubmit(e) {
      e.preventDefault();

      const userId = Utils.$("#user-id").value;
      const name = Utils.$("#user-name").value.trim();
      const pin = Utils.$("#user-pin").value.trim();
      const role = document.querySelector(
        'input[name="user-role"]:checked'
      ).value;

      if (!name) {
        Toast.warning("Wpisz imię");
        return;
      }

      if (!userId && !pin) {
        Toast.warning("Wpisz PIN");
        return;
      }

      if (pin && (pin.length < 4 || pin.length > 6)) {
        Toast.warning("PIN musi mieć 4-6 cyfr");
        return;
      }

      try {
        if (userId) {
          await API.updateUser(userId, { name, pin: pin || undefined, role });
          Toast.success("Użytkownik zaktualizowany");
        } else {
          await API.createUser({ name, pin, role });
          Toast.success("Użytkownik dodany");
        }

        Modal.close("modal-user");
        this.loadUsers();
      } catch (error) {
        Toast.error("Nie udało się zapisać użytkownika");
      }
    },

    async deleteUser(userId) {
      const user = state.users.find((u) => u.id == userId);

      if (user.id === state.currentUser.id) {
        Toast.warning("Nie możesz usunąć samego siebie");
        return;
      }

      Modal.confirm(
        "Usunąć użytkownika?",
        `Czy na pewno chcesz usunąć użytkownika "${user?.name}"?`,
        async () => {
          try {
            await API.deleteUser(userId);
            Toast.success("Użytkownik usunięty");
            this.loadUsers();
          } catch (error) {
            Toast.error("Nie udało się usunąć użytkownika");
          }
        }
      );
    },

    // =============================================
    // LOCATIONS MANAGEMENT
    // =============================================
    async loadLocations() {
      try {
        const allLocations = await API.getLocations();
        state.locations = allLocations.filter((l) => l.type === "location");
        state.departments = allLocations.filter((l) => l.type === "department");
        this.renderLocations();
        DataLists.updateAll();
      } catch (error) {
        Toast.error("Nie udało się załadować lokalizacji");
      }
    },

    renderLocations() {
      const locationsList = Utils.$("#locations-list");
      const departmentsList = Utils.$("#departments-list");
      const emptyState = Utils.$("#locations-empty");

      if (state.locations.length === 0 && state.departments.length === 0) {
        locationsList.innerHTML = "";
        departmentsList.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      // Render locations
      locationsList.innerHTML =
        state.locations
          .map(
            (loc) => `
                <div class="location-card" data-id="${loc.id}">
                    <div class="location-info">
                        <div class="location-details">
                            <h3>📍 ${Utils.escapeHtml(loc.name)}</h3>
                        </div>
                    </div>
                    <div class="location-actions">
                        <button class="task-action-btn btn-delete" data-action="delete-location" data-id="${
                          loc.id
                        }" title="Usuń">
                            🗑️
                        </button>
                    </div>
                </div>
            `
          )
          .join("") || '<p class="text-muted text-center">Brak lokalizacji</p>';

      // Render departments
      departmentsList.innerHTML =
        state.departments
          .map(
            (dept) => `
                <div class="location-card" data-id="${dept.id}">
                    <div class="location-info">
                        <div class="location-details">
                            <h3>🏢 ${Utils.escapeHtml(dept.name)}</h3>
                        </div>
                    </div>
                    <div class="location-actions">
                        <button class="task-action-btn btn-delete" data-action="delete-location" data-id="${
                          dept.id
                        }" title="Usuń">
                            🗑️
                        </button>
                    </div>
                </div>
            `
          )
          .join("") || '<p class="text-muted text-center">Brak działów</p>';

      // Event listeners
      Utils.$$('[data-action="delete-location"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          this.deleteLocation(btn.dataset.id);
        });
      });
    },

    openLocationModal() {
      Utils.$("#location-form").reset();
      Modal.open("modal-location");
    },

    async handleLocationSubmit(e) {
      e.preventDefault();

      const name = Utils.$("#location-name").value.trim();
      const type = document.querySelector(
        'input[name="location-type"]:checked'
      ).value;

      if (!name) {
        Toast.warning("Wpisz nazwę");
        return;
      }

      try {
        await API.createLocation({ name, type });
        Toast.success(
          type === "department" ? "Dział dodany" : "Lokalizacja dodana"
        );
        Modal.close("modal-location");
        this.loadLocations();
      } catch (error) {
        Toast.error("Nie udało się dodać");
      }
    },

    async deleteLocation(locationId) {
      const loc = [...state.locations, ...state.departments].find(
        (l) => l.id == locationId
      );

      Modal.confirm(
        "Usunąć lokalizację?",
        `Czy na pewno chcesz usunąć "${loc?.name}"?`,
        async () => {
          try {
            await API.deleteLocation(locationId);
            Toast.success("Usunięto");
            this.loadLocations();
          } catch (error) {
            Toast.error("Nie udało się usunąć");
          }
        }
      );
    },

    // =============================================
    // TABS
    // =============================================
    switchTab(tabId) {
      state.currentTab = tabId;

      // Update tab buttons
      Utils.$$(".tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      // Update tab content
      Utils.$$(".tab-content").forEach((content) => {
        content.classList.toggle("active", content.id === `tab-${tabId}`);
      });
    },

    // =============================================
    // EVENT LISTENERS
    // =============================================
    initEventListeners() {
      // Add task buttons
      Utils.$("#add-task-btn")?.addEventListener("click", () =>
        TaskForm.open()
      );
      Utils.$("#add-task-empty-btn")?.addEventListener("click", () =>
        TaskForm.open()
      );

      // Date navigation
      Utils.$("#prev-day-btn")?.addEventListener("click", () =>
        this.changeDate(-1)
      );
      Utils.$("#next-day-btn")?.addEventListener("click", () =>
        this.changeDate(1)
      );
      Utils.$("#today-btn")?.addEventListener("click", () => this.goToToday());
      Utils.$("#admin-date-picker")?.addEventListener("change", (e) =>
        this.setDate(e.target.value)
      );

      // Reorder mode
      Utils.$("#toggle-reorder-btn")?.addEventListener("click", () =>
        this.toggleReorderMode()
      );
      Utils.$("#save-reorder-btn")?.addEventListener("click", () =>
        this.saveReorder()
      );
      Utils.$("#cancel-reorder-btn")?.addEventListener("click", () =>
        this.cancelReorder()
      );

      // Priority modal
      Utils.$$(".priority-select-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const taskId = Utils.$("#priority-task-id").value;
          const priority = btn.dataset.priority;
          this.changePriority(taskId, priority);
        });
      });

      // Tabs
      Utils.$$(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
      });

      // Users
      Utils.$("#add-user-btn")?.addEventListener("click", () =>
        this.openUserModal()
      );
      Utils.$("#user-form")?.addEventListener("submit", (e) =>
        this.handleUserSubmit(e)
      );

      // Locations
      Utils.$("#add-location-btn")?.addEventListener("click", () =>
        this.openLocationModal()
      );
      Utils.$("#location-form")?.addEventListener("submit", (e) =>
        this.handleLocationSubmit(e)
      );
    },
  };

  // =============================================
  // 15. PULL TO REFRESH (Mobile)
  // =============================================
  const PullToRefresh = {
    startY: 0,
    currentY: 0,
    pulling: false,
    threshold: 80,

    init() {
      const screens = ["#screen-driver", "#screen-admin"];

      screens.forEach((screenSelector) => {
        const screen = Utils.$(screenSelector);
        if (!screen) return;

        screen.addEventListener(
          "touchstart",
          (e) => {
            if (window.scrollY === 0) {
              this.startY = e.touches[0].clientY;
              this.pulling = true;
            }
          },
          { passive: true }
        );

        screen.addEventListener(
          "touchmove",
          (e) => {
            if (!this.pulling) return;

            this.currentY = e.touches[0].clientY;
            const pullDistance = this.currentY - this.startY;

            if (pullDistance > 0 && pullDistance < 150) {
              const indicator = Utils.$("#pull-to-refresh");
              if (pullDistance > this.threshold / 2) {
                Utils.show(indicator);
              }
            }
          },
          { passive: true }
        );

        screen.addEventListener("touchend", () => {
          if (!this.pulling) return;

          const pullDistance = this.currentY - this.startY;
          const indicator = Utils.$("#pull-to-refresh");

          if (pullDistance > this.threshold) {
            // Refresh
            if (state.currentUser?.role === "admin") {
              AdminPanel.loadTasks();
            } else {
              DriverPanel.loadTasks();
            }
            Notifications.load();
            Toast.info("Odświeżono");
          }

          Utils.hide(indicator);
          this.pulling = false;
          this.startY = 0;
          this.currentY = 0;
        });
      });
    },
  };

  // =============================================
  // 16. KEYBOARD SHORTCUTS
  // =============================================
  const KeyboardShortcuts = {
    init() {
      document.addEventListener("keydown", (e) => {
        // Skip if in input/textarea
        if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
          return;
        }

        // Admin shortcuts
        if (state.currentUser?.role === "admin") {
          if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            TaskForm.open();
          }
          if (e.key === "ArrowLeft") {
            AdminPanel.changeDate(-1);
          }
          if (e.key === "ArrowRight") {
            AdminPanel.changeDate(1);
          }
          if (e.key === "t") {
            AdminPanel.goToToday();
          }
        }

        // Common shortcuts
        if (e.key === "r" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (state.currentUser?.role === "admin") {
            AdminPanel.loadTasks();
          } else {
            DriverPanel.loadTasks();
          }
          Toast.info("Odświeżono");
        }
      });
    },
  };

  // =============================================
  // AKTUALIZACJA EXPORTU
  // =============================================
  window.TransportTracker.AdminPanel = AdminPanel;
  window.TransportTracker.PullToRefresh = PullToRefresh;
  window.TransportTracker.KeyboardShortcuts = KeyboardShortcuts;

  // =============================================
  // INICJALIZACJA EVENT LISTENERÓW
  // =============================================
  AdminPanel.initEventListeners();
  PullToRefresh.init();
  KeyboardShortcuts.init();
})();
