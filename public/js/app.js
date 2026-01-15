// =============================================
// TransportTracker - Aplikacja JavaScript
// Wersja 2.06 - Beta
// =============================================

(function () {
  "use strict";

  // =============================================
  // 1. KONFIGURACJA
  // =============================================
  const CONFIG = {
    API_URL: "/api",
    NOTIFICATION_CHECK_INTERVAL: 15000,
    TOAST_DURATION: 4000,
    DATE_FORMAT: "pl-PL",
    STORAGE_KEYS: {
      USER: "tt_user",
      THEME: "tt_theme",
    },
    ONESIGNAL_APP_ID: "7080dabd-158d-471a-b5e4-00b620b33004", // Zmień to na swoje ID z OneSignal!
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

    users: [],
    locations: [],
    departments: [],
    tasks: [],
    notifications: [],
    unreadNotifications: 0,

    isLoading: false,
    isReorderMode: false,
    viewMode: window.innerWidth > 768 ? "list" : "tiles",
    theme: "light",

    notificationInterval: null,
    taskCache: {}, // { "YYYY-MM-DD": tasks[] }
  };

  // =============================================
  // 3. UTILS
  // =============================================
  const Utils = {
    formatDate(dateStr) {
      if (!dateStr) return "";
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    },

    formatDateShort(dateStr) {
      if (!dateStr) return "";
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
        day: "numeric",
        month: "short",
      });
    },

    formatTime(timeStr) {
      if (!timeStr) return "";
      // Jeśli to pełna data SQL (np. 2025-12-19 08:00:00) - traktuj jako czas lokalny
      if (timeStr.includes(" ") || timeStr.includes("T")) {
        // Format SQL: "YYYY-MM-DD HH:MM:SS" - backend zapisuje już czas polski
        // Wyciągnij tylko godzinę i minuty bez konwersji stref
        const timePart = timeStr.includes(" ")
          ? timeStr.split(" ")[1]
          : timeStr.split("T")[1];
        if (timePart) {
          return timePart.substring(0, 5);
        }
      }
      // Jeśli to sam czas (HH:MM:SS lub HH:MM)
      if (timeStr.includes(":")) {
        return timeStr.substring(0, 5);
      }
      return timeStr;
    },

    formatRelativeTime(dateTimeStr) {
      if (!dateTimeStr) return "";
      // Backend zapisuje czas polski - traktuj jako czas lokalny
      // Tworzymy datę z formatu SQL bez konwersji stref
      let date;
      if (dateTimeStr.includes(" ")) {
        // Format SQL: "YYYY-MM-DD HH:MM:SS"
        const parts = dateTimeStr.split(" ");
        const dateParts = parts[0].split("-");
        const timeParts = parts[1].split(":");
        date = new Date(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
          parseInt(timeParts[0]),
          parseInt(timeParts[1]),
          parseInt(timeParts[2] || 0)
        );
      } else {
        date = new Date(dateTimeStr);
      }

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "przed chwilą";
      if (diffMins < 60) return `${diffMins} min temu`;
      if (diffHours < 24) return `${diffHours} godz. temu`;
      if (diffDays < 7) return `${diffDays} dni temu`;
      return this.formatDateShort(dateTimeStr.split(" ")[0] || dateTimeStr.split("T")[0]);
    },

    getToday() {
      // Pobierz datę lokalną w formacie YYYY-MM-DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },

    addDays(dateStr, days) {
      const date = new Date(dateStr + "T12:00:00"); // T12:00:00 zapobiega problemom ze strefą
      date.setDate(date.getDate() + days);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },

    isToday(dateStr) {
      return dateStr === this.getToday();
    },

    escapeHtml(text) {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },

    $(selector) {
      return document.querySelector(selector);
    },

    $$(selector) {
      return document.querySelectorAll(selector);
    },

    show(element) {
      if (typeof element === "string") element = this.$(element);
      if (element) element.classList.remove("hidden");
    },

    hide(element) {
      if (typeof element === "string") element = this.$(element);
      if (element) element.classList.add("hidden");
    },

    toggle(element, show) {
      if (typeof element === "string") element = this.$(element);
      if (element) element.classList.toggle("hidden", !show);
    },

    getTaskTypeLabel(type) {
      const labels = {
        unloading: "Rozładunek",
        transport: "Przewożenie",
        loading: "Załadunek",
        other: "Inne zadanie",
      };
      return labels[type] || type;
    },

    getTaskTypeIcon(type) {
      const icons = {
        unloading: "📥",
        transport: "🚛",
        loading: "📤",
        other: "📋",
      };
      return icons[type] || "📋";
    },

    getStatusLabel(status) {
      const labels = {
        pending: "Oczekuje",
        in_progress: "W trakcie",
        completed: "Zakończone",
        cancelled: "Anulowane",
        paused: "Wstrzymane",
      };
      return labels[status] || status;
    },

    getStatusIcon(status) {
      const icons = {
        pending: "⏳",
        in_progress: "🔄",
        completed: "✅",
        cancelled: "❌",
        paused: "⏸️",
      };
      return icons[status] || "❓";
    },

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

    getLogTypeIcon(type) {
      const icons = {
        note: "📝",
        delay: "⏱️",
        problem: "⚠️",
        status_change: "🔄",
      };
      return icons[type] || "📋";
    },

    getPriorityOrder(priority) {
      const order = { high: 1, normal: 2, low: 3 };
      return order[priority] || 2;
    },

    isSamsungBrowser() {
      return /SamsungBrowser/i.test(navigator.userAgent);
    },

    isChrome() {
      return /Chrome/i.test(navigator.userAgent) && !this.isSamsungBrowser();
    },
  };

  // =============================================
  // 4. API
  // =============================================
  const API = {
    async request(endpoint, options = {}) {
      const url = `${CONFIG.API_URL}${endpoint}`;
      const token = state.currentUser?.token;

      const config = {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        ...options,
      };

      if (options.body && typeof options.body === "object") {
        config.body = JSON.stringify(options.body);
      }

      try {
        const response = await fetch(url, config);

        // Obsługa wylogowania (401)
        if (response.status === 401) {
          Auth.logout(true); // true = bez potwierdzenia (force logout)
          throw new Error("Sesja wygasła");
        }

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

    async joinTask(taskId, userId) {
      return await this.request(`/tasks/${taskId}/join`, {
        method: "POST",
        body: { userId },
      });
    },

    async reorderTasks(taskIds, reason, userId) {
      return await this.request("/tasks/reorder", {
        method: "POST",
        body: { tasks: taskIds, reason, userId },
      });
    },

    // TASK LOGS
    async createTaskLog(taskId, logData) {
      return await this.request(`/tasks/${taskId}/logs`, {
        method: "POST",
        body: logData,
      });
    },

    // NOTIFICATIONS
    async getNotifications(userId) {
      // Dodaj timestamp, żeby wykluczyć cache na Androidzie
      const timestamp = new Date().getTime();
      const id = parseInt(userId);
      return await this.request(`/notifications/${id}?t=${timestamp}`);
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

    async deleteReadNotifications(userId) {
      return await this.request(`/notifications/user/${userId}/delete-read`, {
        method: "DELETE",
      });
    },

    async deleteRead() {
      if (!state.currentUser) return;
      if (this._deletingRead) return; // Blokada wielokrotnego klikania

      const readNotifications = state.notifications.filter((n) => n.is_read);
      const readCount = readNotifications.length;

      if (readCount === 0) {
        Toast.info("Brak przeczytanych powiadomień do usunięcia");
        return;
      }

      this._deletingRead = true;

      // Instant UI update
      state.notifications = state.notifications.filter((n) => !n.is_read);
      this.renderList();
      Toast.success(`Usunięto ${readCount} przeczytanych`);

      // Sync w tle
      try {
        await API.deleteReadNotifications(state.currentUser.id);
      } catch (error) {
        // Revert on error
        await this.load();
        Toast.error("Błąd synchronizacji");
      } finally {
        this._deletingRead = false;
      }
    },

    // REPORTS
    async getReports(period = "week") {
      const timestamp = new Date().getTime();
      return await this.request(`/reports?period=${period}&t=${timestamp}`);
    },
  };

  // =============================================
  // 5. SYNC (Optimistic UI & Background Queue)
  // =============================================
  const Sync = {
    queue: [],
    isProcessing: false,

    init() {
      this.loadQueue();
      // Próbuj wysłać kolejkę przy starcie
      this.processQueue();
      // Cykliczne sprawdzanie kolejki (np. po odzyskaniu neta)
      setInterval(() => this.processQueue(), 30000);
    },

    /**
     * Główna funkcja do wykonywania akcji.
     * @param {string} actionNazwa - Klucz akcji (np. 'updateTaskStatus')
     * @param {object} data - Dane dla API
     * @param {function} optimisticFn - Funkcja do natychmiastowej zmiany stanu UI
     * @param {function} rollbackFn - Funkcja do przywrócenia stanu w razie błędu
     */
    async enqueue(actionName, data, optimisticFn, rollbackFn) {


      // 1. Wykonaj optymistyczną zmianę (UI)
      let oldState = null;
      if (optimisticFn) {
        try {
          oldState = optimisticFn();
        } catch (e) {
          console.error("[Sync] Optimistic update failed:", e);
        }
      }

      // 2. Dodaj do kolejki
      const action = {
        id: crypto.randomUUID(),
        name: actionName,
        data,
        timestamp: Date.now(),
        attempts: 0
      };
      this.queue.push(action);
      this.persistQueue();

      // 3. Procesuj w tle (nie awaitujemy tego!)
      this.processQueue();

      return action.id;
    },

    async processQueue() {
      if (this.isProcessing || this.queue.length === 0) return;
      if (!navigator.onLine) return; // Oszczędność baterii/zasobów jeśli wiemy że offline

      this.isProcessing = true;


      const actionsToProcess = [...this.queue];

      for (const action of actionsToProcess) {
        try {
          await this.executeAction(action);
          // Sukces - usuń z kolejki
          this.queue = this.queue.filter(a => a.id !== action.id);
          this.persistQueue();
        } catch (error) {
          console.error(`[Sync] Action ${action.name} failed:`, error);
          action.attempts++;

          // Jeśli to błąd krytyczny (np. 403, 400) lub za dużo prób - usuń i ewentualnie rollback
          if (action.attempts >= 3) {
            this.queue = this.queue.filter(a => a.id !== action.id);
            this.persistQueue();
            Toast.error(`Błąd synchronizacji: ${action.name}`);
            // Tu można dodać wymuszenie odświeżenia całego stanu
          }
          // Przerwij pętlę przy pierwszym błędzie sieciowym
          break;
        }
      }

      this.isProcessing = false;
    },

    async executeAction(action) {
      switch (action.name) {
        case 'updateTaskStatus':
          return await API.updateTaskStatus(action.data.id, action.data.status, action.data.userId);
        case 'joinTask':
          return await API.joinTask(action.data.taskId, action.data.userId);
        case 'createTaskLog':
          return await API.createTaskLog(action.data.taskId, action.data.logData);
        case 'deleteReadNotifications':
          return await API.deleteReadNotifications(action.data.userId);
        case 'markNotificationRead':
          return await API.markNotificationRead(action.data.notificationId);
        case 'createTask':
          return await API.createTask(action.data.taskData);
        default:
          console.warn(`[Sync] Unknown action: ${action.name}`);
      }
    },

    persistQueue() {
      localStorage.setItem('tt_sync_queue', JSON.stringify(this.queue));
    },

    loadQueue() {
      const saved = localStorage.getItem('tt_sync_queue');
      if (saved) {
        try {
          this.queue = JSON.parse(saved);
        } catch (e) {
          this.queue = [];
        }
      }
    }
  };

  // =============================================
  // 6. TOAST
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

      toast.querySelector(".toast-close").addEventListener("click", () => {
        this.remove(toast);
      });

      this.container.appendChild(toast);

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
  // 6. MODAL
  // =============================================
  const Modal = {
    openModals: [],

    open(modalId) {
      const modal = Utils.$(`#${modalId}`);
      if (!modal) return;

      Utils.show(modal);
      this.openModals.push(modalId);
      document.body.style.overflow = "hidden";

      setTimeout(() => {
        const firstInput = modal.querySelector(
          'input:not([type="hidden"]):not([type="radio"]), select, textarea'
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

      const form = modal.querySelector("form");
      if (form) form.reset();
    },

    closeAll() {
      [...this.openModals].forEach((id) => this.close(id));
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

      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

      newBtn.addEventListener("click", () => {
        Modal.close("modal-confirm");
        if (typeof onConfirm === "function") {
          onConfirm();
        }
      });

      this.open("modal-confirm");
    },

    init() {
      Utils.$$("[data-close]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const modalId = btn.getAttribute("data-close");
          this.close(modalId);
        });
      });

      Utils.$$(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", () => {
          const modal = overlay.closest(".modal");
          if (modal) this.close(modal.id);
        });
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.openModals.length > 0) {
          this.close(this.openModals[this.openModals.length - 1]);
        }
      });
    },
  };

  // =============================================
  // 7. THEME
  // =============================================
  const Theme = {
    init() {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
      if (saved) {
        this.set(saved);
      } else {
        // Default to light - ignore system preference
        this.set("light");
      }
    },

    set(theme) {
      state.theme = theme;
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
      this.updateButtons();
    },

    toggle() {
      const newTheme = state.theme === "light" ? "dark" : "light";
      this.set(newTheme);
      Toast.info(
        newTheme === "dark" ? "Tryb ciemny włączony" : "Tryb jasny włączony"
      );
    },

    updateButtons() {
      const icon = state.theme === "light" ? "🌙" : "☀️";
      const driverBtn = Utils.$("#driver-theme-btn");
      const adminBtn = Utils.$("#admin-theme-btn");
      if (driverBtn) driverBtn.textContent = icon;
      if (adminBtn) adminBtn.textContent = icon;
    },

    initEventListeners() {
      Utils.$("#driver-theme-btn")?.addEventListener("click", () =>
        this.toggle()
      );
      Utils.$("#admin-theme-btn")?.addEventListener("click", () =>
        this.toggle()
      );
    },
  };

  // =============================================
  // 8. SCREEN
  // =============================================
  const Screen = {
    show(screenId) {
      Utils.$$(".screen").forEach((screen) => {
        screen.classList.remove("active");
      });

      const targetScreen = Utils.$(`#screen-${screenId}`);
      if (targetScreen) {
        targetScreen.classList.add("active");
        state.currentScreen = screenId;
      }
    },
  };

  // =============================================
  // 9. NOTIFICATIONS
  // =============================================
  const Notifications = {
    async requestPermission() {
      if (!("Notification" in window)) {
        Toast.warning("Twoja przeglądarka nie obsługuje powiadomień");
        return false;
      }

      // Już mamy zgodę
      if (Notification.permission === "granted") {
        OneSignalService.init();
        return true;
      }

      // Pytamy o zgodę (OneSignal Slidedown / Native)
      try {
        await OneSignal.Slidedown.promptPush();
        // Jeśli użytkownik zaakceptował, OneSignal sam to obsłuży
        // Toast.success('Jeśli zezwolono, powiadomienia będą działać! 🔔');
        // Powyższy toast może mylić jeśli user zablokował, ale OneSignal obsłuży to UI.
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },

    async load() {
      if (!state.currentUser) {
        console.warn("⚠️ Notifications.load: No current user");
        return;
      }

      try {


        const response = await API.getNotifications(state.currentUser.id);



        // Sprawdź czy mamy nowe nieprzeczytane
        if (response.unreadCount > state.unreadNotifications) {
          const latest = response.notifications[0];
          if (latest && !latest.is_read) {
            this.showSystemNotification(
              latest.title,
              latest.message,
              latest.task_id
            );
          }
        }

        state.notifications = response.notifications || [];
        state.unreadNotifications = response.unreadCount || 0;



        this.updateBadge();

        // Jeśli modal z powiadomieniami jest otwarty, odśwież widok
        const notifModal = Utils.$("#modal-notifications");
        if (notifModal && !notifModal.classList.contains("hidden")) {
          this.renderList();
        }
      } catch (error) {
        console.error("❌ Notifications.load failed:", error);
      }
    },

    async deleteRead() {
      if (!state.currentUser) return;

      const readCount = state.notifications.filter((n) => n.is_read).length;
      if (readCount === 0) {
        Toast.info("Brak przeczytanych powiadomień do usunięcia");
        return;
      }

      try {
        await API.deleteReadNotifications(state.currentUser.id);
        state.notifications = state.notifications.filter((n) => !n.is_read);
        this.renderList();
        Toast.success(`Usunięto ${readCount} przeczytanych`);
      } catch (error) {
        Toast.error("Nie udało się usunąć");
      }
    },

    async showSystemNotification(title, body, taskId) {
      // ❌ Na iOS nie pokazuj systemowych - i tak nie działają w tle
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {

        return;
      }

      if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {

        return;
      }

      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, {
            body: body,
            icon: "/icon.png",
            badge: "/badge.png",
            tag: taskId ? `task-${taskId}` : "general",
            data: { taskId: taskId },
            vibrate: [200, 100, 200],
            requireInteraction: false,
          });
          console.log("✅ System notification shown via SW");
        } catch (e) {
          console.error("❌ SW notification error:", e);
        }
      } else {
        try {
          const notif = new Notification(title, {
            body: body,
            icon: "/icon.png",
          });
          notif.onclick = () => {
            window.focus();
            if (taskId) {
              if (state.currentUser.role === "admin") {
                AdminPanel.openTaskDetails(taskId);
              } else {
                DriverPanel.openTaskDetails(taskId);
              }
            }
            notif.close();
          };
        } catch (e) {
          console.error("❌ Desktop notification error:", e);
        }
      }
    },

    async markRelatedRead(taskId) {
      if (!taskId) return;
      // Znajdź nieprzeczytane powiadomienia dotyczące tego zadania
      const related = state.notifications.filter(
        (n) => n.task_id == taskId && !n.is_read
      );

      for (const notif of related) {
        try {
          await API.markNotificationRead(notif.id);
          notif.is_read = 1;
        } catch (e) {
          console.error(e);
        }
      }

      // Aktualizuj licznik lokalnie (bez odświeżania API)
      state.unreadNotifications = Math.max(
        0,
        state.unreadNotifications - related.length
      );
      this.updateBadge();
    },

    updateBadge() {


      const driverBadge = Utils.$("#driver-notification-badge");
      const adminBadge = Utils.$("#admin-notification-badge");

      // Wybierz odpowiedni badge
      const badge =
        state.currentUser?.role === "admin" ? adminBadge : driverBadge;



      if (badge) {
        if (state.unreadNotifications > 0) {
          badge.textContent =
            state.unreadNotifications > 99 ? "99+" : state.unreadNotifications;
          badge.classList.remove("hidden");

        } else {
          badge.classList.add("hidden");

        }
      } else {
        console.error("❌ updateBadge: Badge element NOT FOUND!");
      }

      // PWA Icon Badge (Native)
      if ("setAppBadge" in navigator) {
        if (state.unreadNotifications > 0) {
          navigator
            .setAppBadge(state.unreadNotifications)
            .catch((e) => console.log("Badge error:", e));
        } else {
          navigator.clearAppBadge().catch(() => { });
        }
      }
    },

    startPolling() {


      // Natychmiast załaduj powiadomienia
      this.load();

      // Zatrzymaj stary interval jeśli istnieje
      if (state.notificationInterval) {
        clearInterval(state.notificationInterval);
      }

      // Ustaw nowy interval
      state.notificationInterval = setInterval(() => {
        this.load();

        // Odśwież też zadania w tle
        if (state.currentUser?.role === "driver") {
          DriverPanel.loadTasks(true);
        } else if (state.currentUser?.role === "admin") {
          AdminPanel.loadTasks(true);
        }
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
            <div class="notification-item ${notif.is_read ? "" : "unread"}"
                data-id="${notif.id}"
                data-task-id="${notif.task_id || ""}">
                <div class="notification-icon">${this.getIcon(notif.type)}</div>
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
                ${notif.is_read
              ? ""
              : '<div class="notification-unread-dot"></div>'
            }
            </div>
        `
        )
        .join("");

      list.querySelectorAll(".notification-item").forEach((item) => {
        item.addEventListener("click", async () => {
          // Blokada wielokrotnego klikania
          if (item.dataset.processing === "true") return;
          item.dataset.processing = "true";

          const id = item.dataset.id;
          const taskId = item.dataset.taskId;

          if (item.classList.contains("unread")) {
            // Instant UI update
            item.classList.remove("unread");
            item.querySelector(".notification-unread-dot")?.remove();
            state.unreadNotifications = Math.max(
              0,
              state.unreadNotifications - 1
            );
            this.updateBadge();

            // Mark in state
            const notif = state.notifications.find((n) => n.id == id);
            if (notif) notif.is_read = 1;

            // Sync w tle (nie czekamy)
            API.markNotificationRead(id).catch(() => { });
          }

          if (taskId) {
            Modal.close("modal-notifications");
            if (state.currentUser.role === "admin") {
              AdminPanel.openTaskDetails(taskId);
            } else {
              DriverPanel.openTaskDetails(taskId);
            }
          }

          // Odblokuj po chwili
          setTimeout(() => {
            item.dataset.processing = "false";
          }, 300);
        });
      });
    },

    getIcon(type) {
      const icons = {
        new_task: "📋",
        status_change: "🔄",
        delay: "⏱️",
        problem: "⚠️",
        joined: "👥",
      };
      return icons[type] || "🔔";
    },

    async markAllRead() {
      if (!state.currentUser || state.unreadNotifications === 0) return;
      if (this._markingAllRead) return; // Blokada wielokrotnego klikania

      this._markingAllRead = true;

      // Instant UI update
      state.notifications.forEach((n) => (n.is_read = 1));
      state.unreadNotifications = 0;
      this.updateBadge();
      this.renderList();
      Toast.success("Oznaczono jako przeczytane");

      // Sync w tle
      try {
        await API.markAllNotificationsRead(state.currentUser.id);
      } catch (error) {
        // Revert on error
        await this.load();
        Toast.error("Błąd synchronizacji");
      } finally {
        this._markingAllRead = false;
      }
    },

    open() {
      this.renderList();
      Modal.open("modal-notifications");
    },

    initEventListeners() {
      Utils.$("#driver-notifications-btn")?.addEventListener("click", () => {
        this.open();
        this.requestPermission();
      });
      Utils.$("#admin-notifications-btn")?.addEventListener("click", () => {
        this.open();
        this.requestPermission();
      });
      Utils.$("#mark-all-read-btn")?.addEventListener("click", () =>
        this.markAllRead()
      );
      Utils.$("#delete-read-btn")?.addEventListener("click", () =>
        this.deleteRead()
      );
    },
  };

  // =============================================
  // 10. DATALISTS
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
  // 11. AUTH
  // =============================================
  const Auth = {
    async init() {
      const savedUser = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);

      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);

          // Sprawdź czy dane są poprawne
          if (!parsed || !parsed.token || !parsed.id) {
            throw new Error("Uszkodzone dane sesji");
          }

          // Przywróć stan
          state.currentUser = parsed;

          // Przejdź dalej
          await this.onLoginSuccess();
        } catch (e) {
          console.error("Session error:", e);
          this.logout(true); // Wymuś wylogowanie i czyszczenie
        }
      } else {
        await this.showLoginScreen();
      }
    },

    async showLoginScreen() {
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

      submitBtn.disabled = true;
      Utils.hide(submitBtn.querySelector(".btn-text"));
      Utils.show(submitBtn.querySelector(".btn-loader"));
      Utils.hide(errorEl);

      try {
        const response = await API.login(userId, pin);

        // Zapisz usera I TOKEN
        state.currentUser = { ...response.user, token: response.token };
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.USER,
          JSON.stringify(state.currentUser)
        );

        Toast.success(`Witaj, ${response.user.name}!`);
        await this.onLoginSuccess();
      } catch (error) {
        Utils.show(errorEl);
        errorEl.textContent = error.message || "Nieprawidłowy PIN";
      } finally {
        submitBtn.disabled = false;
        Utils.show(submitBtn.querySelector(".btn-text"));
        Utils.hide(submitBtn.querySelector(".btn-loader"));
      }
    },

    async onLoginSuccess() {
      Utils.$("#login-form")?.reset();

      if (state.currentUser.force_pin_change) {
        this.showChangePinModal();
        return;
      }

      await this.loadCommonData();

      if (state.currentUser.role === "admin") {
        this.initAdminPanel();
      } else {
        this.initDriverPanel();
      }

      // OneSignal - inicjalizuj SDK (nie blokuje UI)
      OneSignalService.init()
        .then(() => {
          // Po 2 sekundach poproś o zgodę (jeśli jeszcze nie mamy)
          setTimeout(async () => {
            const hasPermission = await OneSignalService.requestPermission();
            if (hasPermission && state.currentUser) {
              await OneSignalService.login(
                state.currentUser.id,
                state.currentUser.role
              );
            }
          }, 2000);
        })
        .catch((err) => {
          console.warn("OneSignal setup failed:", err);
        });
    },

    showChangePinModal() {
      // Ukryj ekran logowania, ale nie pokazuj jeszcze panelu
      Screen.show("loading");

      // Pokaż modal (bez możliwości zamknięcia)
      const modal = Utils.$("#modal-change-pin");
      Utils.show(modal);

      // Obsługa formularza
      const form = Utils.$("#change-pin-form");
      form.onsubmit = async (e) => {
        e.preventDefault();
        const newPin = Utils.$("#new-pin").value;
        const confirmPin = Utils.$("#confirm-pin").value;

        if (newPin !== confirmPin) {
          Toast.error("PIN-y muszą być identyczne");
          return;
        }

        if (newPin.length < 4 || newPin.length > 6) {
          Toast.error("PIN musi mieć 4-6 cyfr");
          return;
        }

        try {
          await API.updateUser(state.currentUser.id, {
            pin: newPin,
            force_pin_change: 0,
          });

          Toast.success("PIN zmieniony pomyślnie!");
          Utils.hide(modal);

          // Zaktualizuj stan lokalny
          state.currentUser.force_pin_change = 0;
          localStorage.setItem(
            CONFIG.STORAGE_KEYS.USER,
            JSON.stringify(state.currentUser)
          );

          // Kontynuuj logowanie
          await this.loadCommonData();
          if (state.currentUser.role === "admin") {
            this.initAdminPanel();
          } else {
            this.initDriverPanel();
          }
        } catch (error) {
          Toast.error("Nie udało się zmienić PIN-u");
        }
      };
    },

    async loadCommonData() {
      try {
        const [locations, users] = await Promise.all([
          API.getLocations(),
          API.getUsers(),
        ]);
        state.locations = locations.filter((l) => l.type === "location");
        state.departments = locations.filter((l) => l.type === "department");
        state.users = users;
        DataLists.updateAll();
      } catch (error) {
        console.error("Failed to load common data:", error);
      }
    },

    initAdminPanel() {
      Utils.$("#admin-user-name").textContent = state.currentUser.name;
      state.currentDate = Utils.getToday();
      Utils.$("#admin-date-picker").value = state.currentDate;
      Screen.show("admin");

      // Ukryj zakładki bez uprawnień
      const user = state.currentUser;

      const tabReports = document.querySelector('[data-tab="reports"]');
      const tabUsers = document.querySelector('[data-tab="users"]');
      const tabLocations = document.querySelector('[data-tab="locations"]');

      // Pokaż wszystkie najpierw (reset)
      if (tabReports) tabReports.classList.remove("hidden");
      if (tabUsers) tabUsers.classList.remove("hidden");
      if (tabLocations) tabLocations.classList.remove("hidden");

      // Ukryj te bez uprawnień (ID 1 = główny admin - widzi wszystko)
      if (user.id !== 1) {
        if (!user.perm_reports) {
          if (tabReports) tabReports.classList.add("hidden");
        }
        if (!user.perm_users) {
          if (tabUsers) tabUsers.classList.add("hidden");
        }
        if (!user.perm_locations) {
          if (tabLocations) tabLocations.classList.add("hidden");
        }
      }

      AdminPanel.switchTab("tasks");
      AdminPanel.loadTasks();
      AdminPanel.loadUsers();
      AdminPanel.loadLocations();
      AdminPanel.updateDateButtons();
      AdminPanel.loadReports("week");
      Notifications.startPolling();
    },

    initDriverPanel() {
      Utils.$("#driver-user-name").textContent = state.currentUser.name;
      state.currentDate = Utils.getToday();
      Utils.$("#driver-date-text").textContent = Utils.formatDate(
        state.currentDate
      );
      Screen.show("driver");

      console.log(
        "🚀 Driver panel initialized for user:",
        state.currentUser.id,
        state.currentUser.name
      );

      DriverPanel.loadTasks();
      Notifications.startPolling();
    },

    initDriverPanel() {
      Utils.$("#driver-user-name").textContent = state.currentUser.name;
      state.currentDate = Utils.getToday();
      Utils.$("#driver-date-text").textContent = Utils.formatDate(
        state.currentDate
      );

      Screen.show("driver");

      DriverPanel.loadTasks();
      Notifications.startPolling();
    },

    logout(force = false) {
      const performLogout = () => {
        state.currentUser = null;
        state.tasks = [];
        state.notifications = [];
        state.currentTab = "tasks"; // <-- DODAJ TO (Reset zakładki)
        state.currentFilter = "all"; // <-- DODAJ TO

        localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
        Notifications.stopPolling();
        // OneSignal Logout
        OneSignalService.logout();

        this.showLoginScreen();
      };

      if (force) {
        performLogout();
        // Opcjonalnie: Toast.info('Sesja wygasła');
      } else {
        Modal.confirm(
          "Wylogowanie",
          "Czy na pewno?",
          performLogout,
          "Wyloguj",
          false
        );
      }
    },

    initEventListeners() {
      Utils.$("#login-form")?.addEventListener("submit", (e) =>
        this.handleLogin(e)
      );

      Utils.$("#toggle-pin")?.addEventListener("click", () => {
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

      Utils.$("#driver-logout-btn")?.addEventListener("click", () =>
        this.logout()
      );
      Utils.$("#admin-logout-btn")?.addEventListener("click", () =>
        this.logout()
      );
    },
  };

  // =============================================
  // 12. DRIVER PANEL
  // =============================================
  const DriverPanel = {
    async loadTasks(silent = false) {
      if (!state.currentUser) return;

      const targetDate = state.currentDate;

      // 1. SWR: Pokazujemy to co mamy w cache'u OD RAZU
      if (state.taskCache[targetDate]) {
        state.tasks = state.taskCache[targetDate];
        this.sortTasks();
        this.updateStats();
        this.renderTasks();
      }

      try {
        // 2. Pobieramy świeże dane w tle
        const freshTasks = await API.getTasks({
          date: targetDate,
          userId: state.currentUser.id,
        });

        // 3. Sprawdzamy czy coś się zmieniło
        const hasChanged = JSON.stringify(freshTasks) !== JSON.stringify(state.taskCache[targetDate]);

        state.taskCache[targetDate] = freshTasks;

        if (hasChanged || state.tasks.length === 0) {
          state.tasks = freshTasks;
          this.sortTasks();
          this.updateStats();
          this.renderTasks();
        }

        // 4. Pre-fetch sąsiednich dat w tle
        this.prefetchNeighboringDates();

      } catch (error) {
        if (!silent && !state.taskCache[targetDate]) {
          Toast.error("Nie udało się załadować zadań");
        }
        console.error(error);
      }
    },

    async prefetchNeighboringDates() {
      if (!state.currentUser) return;
      const yesterday = Utils.addDays(state.currentDate, -1);
      const tomorrow = Utils.addDays(state.currentDate, 1);

      [yesterday, tomorrow].forEach(async (date) => {
        if (!state.taskCache[date]) {
          try {
            const tasks = await API.getTasks({ date, userId: state.currentUser.id });
            state.taskCache[date] = tasks;
          } catch (e) {
            // Ignorujemy błędy pre-fetchu
          }
        }
      });
    },

    sortTasks() {
      if (!state.currentUser) return;
      state.tasks.sort((a, b) => {
        // 1. Zakończone ZAWSZE na dole
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (b.status === "completed" && a.status !== "completed") return -1;

        // 2. W trakcie ZAWSZE na górze (przed oczekującymi)
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;

        // 2a. W obrębie "W trakcie" - moje zadania na samej górze
        if (a.status === "in_progress" && b.status === "in_progress") {
          const aMine = a.assigned_to === state.currentUser.id || (a.additional_drivers && a.additional_drivers.some(d => d.id === state.currentUser.id));
          const bMine = b.assigned_to === state.currentUser.id || (b.additional_drivers && b.additional_drivers.some(d => d.id === state.currentUser.id));
          if (aMine && !bMine) return -1;
          if (!aMine && bMine) return 1;
        }

        // 3. Potem priorytet (Pilne > Normalne > Niski)
        const priorityDiff = Utils.getPriorityOrder(a.priority) - Utils.getPriorityOrder(b.priority);
        if (priorityDiff !== 0) return priorityDiff;

        // 4. Na końcu kolejność ręczna (sort_order)
        return (a.sort_order || 999) - (b.sort_order || 999);
      });
    },

    updateStats() {
      const getEffectiveStatus = (t) => {
        if (t.has_completed) return "completed";
        if (t.has_paused) return "paused";
        return t.status;
      };

      const pending = state.tasks.filter(
        (t) => getEffectiveStatus(t) === "pending" || getEffectiveStatus(t) === "paused"
      ).length;
      const inProgress = state.tasks.filter(
        (t) => getEffectiveStatus(t) === "in_progress"
      ).length;
      const completed = state.tasks.filter(
        (t) => getEffectiveStatus(t) === "completed"
      ).length;

      Utils.$("#driver-stat-pending").textContent = pending;
      Utils.$("#driver-stat-progress").textContent = inProgress;
      Utils.$("#driver-stat-done").textContent = completed;
    },

    renderTasks() {
      const tasksList = Utils.$("#driver-tasks-list");
      const emptyState = Utils.$("#driver-tasks-empty");

      const getEffectiveStatus = (t) => {
        if (t.has_completed) return "completed";
        if (t.has_paused) return "paused";
        return t.status;
      };

      let filteredTasks = state.tasks;
      if (state.currentFilter !== "all") {
        filteredTasks = state.tasks.filter((t) => {
          const effStatus = getEffectiveStatus(t);
          if (state.currentFilter === "pending") {
            return effStatus === "pending" || effStatus === "paused";
          }
          return effStatus === state.currentFilter;
        });
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
      this.attachTaskEventListeners();
    },

    renderTaskCard(task) {
      const isMyTask = task.assigned_to === state.currentUser.id;
      const isJoined =
        task.additional_drivers &&
        task.additional_drivers.some((d) => d.id === state.currentUser.id);
      const isParticipating = isMyTask || isJoined;

      const isInProgress = task.status === "in_progress";
      const isLocked = isInProgress && !isParticipating;

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

      const materialHtml = task.material
        ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
        : "";

      const notesHtml = task.notes
        ? `
                <div class="task-notes-preview">
                    <span>💬</span>
                    <span>${Utils.escapeHtml(task.notes)}</span>
                </div>
            `
        : "";

      // Obsługa wielu kierowców
      let driversHtml = "";
      const allDrivers = [];

      if (task.assigned_name) allDrivers.push(task.assigned_name);
      if (task.additional_drivers) {
        task.additional_drivers.forEach((d) => allDrivers.push(d.name));
      }

      if (allDrivers.length > 0) {
        const driversList = allDrivers.join(", ");
        const icon = allDrivers.length > 1 ? "👥" : "👤";
        const label = allDrivers.length > 1 ? "Współdzielone" : "";

        driversHtml = `
                    <span class="task-meta-item" title="${Utils.escapeHtml(
          driversList
        )}">
                        <span>${icon}</span>
                        <span>${Utils.escapeHtml(driversList)}</span>
                        ${label
            ? `<span class="task-drivers-badge">${label}</span>`
            : ""
          }
                    </span>
                `;
      }

      // Przyciski akcji
      let actionButtons = "";
      if (task.status === "pending") {
        actionButtons = `
                    <button class="task-action-btn btn-start" data-action="start" data-id="${task.id}">
                        ▶️ Rozpocznij
                    </button>
                `;
      } else if (task.status === "paused") {
        actionButtons = `
                    <button class="task-action-btn btn-start" data-action="resume" data-id="${task.id}">
                        ▶️ Wznów
                    </button>
                `;
      } else if (task.status === "in_progress") {
        if (isParticipating && !task.has_completed && !task.has_paused) {
          actionButtons = `
                        <button class="task-action-btn" data-action="pause" data-id="${task.id}" title="Wstrzymaj">
                            ⏸️
                        </button>
                        <button class="task-action-btn" data-action="add-log" data-id="${task.id}" title="Dodaj uwagę">
                            📝
                        </button>
                        <button class="task-action-btn btn-complete" data-action="complete" data-id="${task.id}" title="Zakończ">
                            ✅
                        </button>
                    `;
        } else if (task.has_paused) {
          actionButtons = `
                        <button class="task-action-btn btn-start" data-action="resume" data-id="${task.id}">
                            ▶️ Wznów
                        </button>
                    `;
        } else {
          // Jeśli nie uczestniczę LUB już zakończyłem swoją część (has_completed)
          actionButtons = `
                        <button class="task-action-btn btn-join" data-action="join" data-id="${task.id}">
                            👥 Dołącz
                        </button>
                    `;
        }
      }

      return `
                <div class="task-card priority-${task.priority} status-${task.status
        } ${isLocked ? "task-locked" : ""}" 
                     data-id="${task.id}">
                    <div class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(
          task.status
        )} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-type-badge type-${task.task_type
        }">
                                ${Utils.getTaskTypeIcon(
          task.task_type
        )} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${task.priority
        }">
                                ${Utils.getPriorityIcon(
          task.priority
        )} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${task.id
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
                            ${task.scheduled_time
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
                            ${driversHtml}
                        </div>
                        <div class="task-actions">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
    },

    attachTaskEventListeners() {
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
            case "join":
              this.openJoinModal(taskId);
              break;
            case "pause":
              this.pauseTask(taskId);
              break;
            case "resume":
              this.resumeTask(taskId);
              break;
          }
        });
      });
    },

    async startTask(taskId) {
      if (this._startingTask) return;
      this._startingTask = true;

      Notifications.markRelatedRead(taskId);

      Sync.enqueue(
        "updateTaskStatus",
        { id: taskId, status: "in_progress", userId: state.currentUser.id },
        () => {
          const task = state.tasks.find((t) => t.id == taskId);
          if (task) {
            task.status = "in_progress";
            task.assigned_to = state.currentUser.id;
            task.assigned_name = state.currentUser.name;
          }
          this.sortTasks();
          this.updateStats();
          this.setFilter("in_progress");
          Toast.success("Zadanie rozpoczęte! 🚀");
        }
      ).finally(() => {
        this._startingTask = false;
      });
    },

    async completeTask(taskId) {
      if (this._completingTask) return;

      Modal.confirm(
        "Zakończyć zadanie?",
        "Czy na pewno chcesz oznaczyć zadanie jako wykonane?",
        async () => {
          this._completingTask = true;

          Sync.enqueue(
            "updateTaskStatus",
            { id: taskId, status: "completed", userId: state.currentUser.id },
            () => {
              const task = state.tasks.find((t) => t.id == taskId);
              if (task) {
                // Optymistycznie zakładamy sukces (zakończenie całości lub części)
                task.status = "completed";
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              Toast.success("Zadanie oznaczone jako zakończone! 🎉");
            }
          ).then(() => {
            // Po faktycznym zakończeniu sync, możemy odświeżyć żeby sprawdzić "partial"
            this.loadTasks(true);
          }).finally(() => {
            this._completingTask = false;
          });
        },
        "Zakończ",
        false
      );
    },

    async pauseTask(taskId) {
      Modal.confirm(
        "Wstrzymać zadanie?",
        "Zadanie zostanie oznaczone jako wstrzymane. Inny kierowca będzie mógł je wznowić.",
        async () => {
          Sync.enqueue(
            "updateTaskStatus",
            { id: taskId, status: "paused", userId: state.currentUser.id },
            () => {
              const task = state.tasks.find((t) => t.id == taskId);
              if (task) {
                task.status = "paused";
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              Toast.info("Zadanie wstrzymane ⏸️");
            }
          );
        },
        "Wstrzymaj",
        false
      );
    },

    async resumeTask(taskId) {
      Sync.enqueue(
        "updateTaskStatus",
        { id: taskId, status: "in_progress", userId: state.currentUser.id },
        () => {
          const task = state.tasks.find((t) => t.id == taskId);
          if (task) {
            task.status = "in_progress";
            task.assigned_to = state.currentUser.id;
            task.assigned_name = state.currentUser.name;
          }
          this.sortTasks();
          this.updateStats();
          this.renderTasks();
          this.setFilter("in_progress");
          Toast.success("Zadanie wznowione! ▶️");
        }
      );
    },

    openJoinModal(taskId) {
      const task = state.tasks.find((t) => t.id == taskId);
      Utils.$("#join-task-id").value = taskId;
      Utils.$(
        "#join-task-message"
      ).textContent = `Czy chcesz dołączyć do zadania "${task?.description || ""
      }" i pomagać przy jego realizacji?`;
      Modal.open("modal-join-task");
    },

    async joinTask() {
      const taskId = Utils.$("#join-task-id").value;
      Notifications.markRelatedRead(taskId);
      Modal.close("modal-join-task");

      Sync.enqueue(
        "joinTask",
        { taskId, userId: state.currentUser.id },
        () => {
          Toast.success("Dołączyłeś do zadania! 👥");
        }
      ).then(() => {
        this.loadTasks(true);
      });
    },

    openLogModal(taskId) {
      Utils.$("#log-task-id").value = taskId;
      Utils.$("#task-log-form").reset();
      this.toggleLogFields("note");
      Modal.open("modal-task-log");
    },

    toggleLogFields(type) {
      Utils.$$(".log-fields").forEach((el) => Utils.hide(el));
      Utils.show(`#log-fields-${type}`);
    },

    async handleLogSubmit(e) {
      e.preventDefault();

      if (this._submittingLog) return;
      this._submittingLog = true;

      const taskId = Utils.$("#log-task-id").value;
      const logType = document.querySelector(
        'input[name="log-type"]:checked'
      ).value;

      const logData = {
        userId: state.currentUser.id,
        logType,
      };

      if (logType === "note") {
        logData.message = Utils.$("#log-message").value.trim();
        if (!logData.message) {
          Toast.warning("Wpisz treść uwagi");
          this._submittingLog = false;
          return;
        }
      } else if (logType === "delay") {
        logData.delayReason = Utils.$("#delay-reason").value;
        logData.delayMinutes = parseInt(Utils.$("#delay-minutes").value) || 0;
        logData.message = Utils.$("#delay-details").value.trim();
        if (!logData.delayReason) {
          Toast.warning("Wybierz powód przestoju");
          this._submittingLog = false;
          return;
        }
      } else if (logType === "problem") {
        logData.message = Utils.$("#problem-message").value.trim();
        if (!logData.message) {
          Toast.warning("Opisz problem");
          this._submittingLog = false;
          return;
        }
      }

      // Instant - zamknij i pokaż sukces
      Modal.close("modal-task-log");
      Toast.success("Zapisano! 📝");

      // Sync w tle
      Sync.enqueue(
        "createTaskLog",
        { taskId, logData },
        () => {
          // Możemy tu dodać optymistyczne dodanie logu do state.tasks[id].logs jeśli chcemy
        }
      ).then(() => {
        this.loadTasks(true); // silent refresh
      });

      this._submittingLog = false;
    },

    async openTaskDetails(taskId) {
      Notifications.markRelatedRead(taskId);
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
      const isMyTask = task.assigned_to === state.currentUser.id;
      const isJoined = task.additional_drivers &&
        task.additional_drivers.some((d) => d.id === state.currentUser.id);
      const isParticipating = isMyTask || isJoined;

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
                                        ${log.log_type === "delay"
                  ? `<strong>${Utils.getDelayReasonLabel(
                    log.delay_reason
                  )}</strong> (${log.delay_minutes || 0
                  } min)<br>`
                  : ""
                }
                                        ${Utils.escapeHtml(log.message || "")}
                                    </div>
                                                                        <div class="task-log-meta">
                                        ${Utils.escapeHtml(
                  log.user_name || "Nieznany"
                )} • ${Utils.formatTime(log.created_at)}
                                    </div>
                                </div>
                            </div>
                        `
            )
            .join("")}
                    </div>
                `;
      }

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
        } else if (task.status === "in_progress" && isParticipating) {
          actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-warning" onclick="TransportTracker.DriverPanel.pauseTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ⏸️ Wstrzymaj
                            </button>
                            <button class="btn btn-secondary" onclick="TransportTracker.DriverPanel.openLogModal(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                📝 Dodaj uwagę
                            </button>
                            <button class="btn btn-success" onclick="TransportTracker.DriverPanel.completeTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ✅ Zakończ
                            </button>
                        </div>
                    `;
        } else if (task.status === "paused") {
          actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-primary btn-block" onclick="TransportTracker.DriverPanel.resumeTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ▶️ Wznów zadanie
                            </button>
                        </div>
                    `;
        } else if (task.status === "in_progress" && (task.has_completed || !isParticipating)) {
          actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-primary btn-block" onclick="TransportTracker.DriverPanel.openJoinModal(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                👥 Dołącz do zadania
                            </button>
                        </div>
                    `;
        }
      } else {
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
                    ${task.material
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
                    ${task.scheduled_time
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
                    ${task.assigned_name
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
                    <div class="task-detail-row">
                        <span class="task-detail-label">Zlecił</span>
                        <span class="task-detail-value">👔 ${Utils.escapeHtml(task.creator_name || 'System')}</span>
                    </div>
                </div>
                
                ${task.notes
          ? `
                    <div class="task-detail-section">
                        <h4>Uwagi</h4>
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

      Utils.$$("#screen-driver .filter-btn").forEach((btn) => {
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

      // Log form
      Utils.$("#task-log-form")?.addEventListener("submit", (e) =>
        this.handleLogSubmit(e)
      );

      // Log type change
      Utils.$$('input[name="log-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          this.toggleLogFields(radio.value);
        });
      });

      // Join task
      Utils.$("#join-task-confirm-btn")?.addEventListener("click", () =>
        this.joinTask()
      );
    },
  };

  // =============================================
  // 13. TASK FORM
  // =============================================
  const TaskForm = {
    currentTaskId: null,

    async open(taskId = null) {
      this.currentTaskId = taskId;

      // Jeśli edycja - sprawdź uprawnienia
      if (taskId) {
        const task = state.tasks.find((t) => t.id == taskId);
        const isMainAdmin = state.currentUser.id === 1; // Zakładamy ID 1 = Główny Admin
        const isCreator = task && task.creator_id === state.currentUser.id;

        if (!isMainAdmin && !isCreator) {
          Toast.error("Możesz edytować tylko zadania utworzone przez siebie");
          return;
        }
      }

      Utils.$("#modal-task-title").textContent = taskId
        ? "Edytuj zadanie"
        : "Nowe zadanie";
      Utils.$("#task-form").reset();
      Utils.$("#task-id").value = "";
      Utils.$("#task-date").value = state.currentDate;

      DataLists.updateAll();
      this.toggleTaskFields("transport");

      if (taskId) {
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

      const typeRadio = document.querySelector(
        `input[name="task-type"][value="${task.task_type}"]`
      );
      if (typeRadio) typeRadio.checked = true;
      this.toggleTaskFields(task.task_type);

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
      } else if (task.task_type === "other") {
        Utils.$("#other-description").value = task.description || "";
        Utils.$("#other-from").value = task.location_from || "";
        Utils.$("#other-to").value = task.location_to || "";
      }

      Utils.$("#task-date").value = task.scheduled_date || "";
      Utils.$("#task-time").value = task.scheduled_time || "";
      Utils.$("#task-notes").value = task.notes || "";
      Utils.$("#task-assigned").value = task.assigned_to || "";

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
      } else if (taskType === "other") {
        data.description = Utils.$("#other-description").value.trim();
        data.location_from = Utils.$("#other-from").value.trim();
        data.location_to = Utils.$("#other-to").value.trim();
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
      } else if (data.task_type === "other") {
        if (!data.description) {
          Toast.warning("Wpisz rodzaj zadania");
          return false;
        }
      }

      return true;
    },

    async handleSubmit(e) {
      e.preventDefault();

      if (this._submitting) return;

      const data = this.getFormData();
      if (!this.validate(data)) return;

      this._submitting = true;
      const taskId = Utils.$("#task-id").value;

      // Instant - zamknij modal i pokaż sukces
      Modal.close("modal-task");
      Toast.success(taskId ? "Zadanie zaktualizowane!" : "Zadanie dodane!");

      // Sync w tle
      try {
        if (taskId) {
          await API.updateTask(taskId, data);
        } else {
          await API.createTask(data);
        }
        await AdminPanel.loadTasks();
      } catch (error) {
        Toast.error("Błąd zapisu - odśwież stronę");
      } finally {
        this._submitting = false;
      }
    },

    initEventListeners() {
      Utils.$$('input[name="task-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          this.toggleTaskFields(radio.value);
        });
      });

      Utils.$("#task-form")?.addEventListener("submit", (e) =>
        this.handleSubmit(e)
      );
    },
  };
  // =============================================
  // 14. ADMIN PANEL
  // =============================================
  const AdminPanel = {
    async loadTasks(silent = false) {
      if (!state.currentUser) return;

      const targetDate = state.currentDate;

      // 1. SWR: Pokazujemy to co mamy w cache'u OD RAZU
      if (state.taskCache[targetDate]) {
        state.tasks = state.taskCache[targetDate];
        this.sortTasks();
        this.updateStats();
        this.updateDateDisplay();
        this.renderTasks();
      } else if (!silent) {
        // Jeśli nie ma w cache, można pokazać loader
        Utils.$("#admin-tasks-list").innerHTML = '<div class="loading-inline">Ładowanie zadań...</div>';
      }

      try {
        // 2. Pobieramy świeże dane w tle
        const freshTasks = await API.getTasks({
          date: targetDate,
          userId: state.currentUser.id,
        });

        // 3. Sprawdzamy czy coś się zmieniło względem tego co wyświetliliśmy
        const hasChanged = JSON.stringify(freshTasks) !== JSON.stringify(state.taskCache[targetDate]);

        // Zapisz do cache
        state.taskCache[targetDate] = freshTasks;

        // Jeśli dane się zmieniły ALBO nie było ich wcześniej w cache - odśwież UI
        if (hasChanged || state.tasks.length === 0) {
          state.tasks = freshTasks;
          this.sortTasks();
          this.updateStats();
          this.updateDateDisplay();
          this.renderTasks();
        }

        // 4. Pre-fetch sąsiednich dat w tle
        this.prefetchNeighboringDates();

      } catch (error) {
        if (!silent && !state.taskCache[targetDate]) {
          Toast.error("Nie udało się załadować zadań");
        }
        console.error(error);
      }
    },

    async prefetchNeighboringDates() {
      if (!state.currentUser) return;
      const yesterday = Utils.addDays(state.currentDate, -1);
      const tomorrow = Utils.addDays(state.currentDate, 1);

      [yesterday, tomorrow].forEach(async (date) => {
        if (!state.taskCache[date]) {
          try {
            const tasks = await API.getTasks({ date, userId: state.currentUser.id });
            state.taskCache[date] = tasks;
          } catch (e) {
            // Ignorujemy
          }
        }
      });
    },

    sortTasks() {
      state.tasks.sort((a, b) => {
        // 1. Zakończone na dole
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (b.status === "completed" && a.status !== "completed") return -1;

        // 2. W trakcie na górze
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;

        // 3. Priorytet
        const priorityDiff =
          Utils.getPriorityOrder(a.priority) -
          Utils.getPriorityOrder(b.priority);
        if (priorityDiff !== 0) return priorityDiff;

        // 4. Kolejność
        return (a.sort_order || 999) - (b.sort_order || 999);
      });
    },

    updateStats() {
      const pending = state.tasks.filter((t) => t.status === "pending" || t.status === "paused").length;
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
      const dateText = Utils.formatDate(state.currentDate);
      Utils.$("#admin-date-display").textContent = dateText;
      this.updateDateButtons();
    },

    updateDateButtons() {
      const today = Utils.getToday();
      Utils.$$(".date-quick-btn").forEach((btn) => {
        const offset = parseInt(btn.dataset.offset);
        const btnDate = Utils.addDays(today, offset);
        // Porównaj daty jako stringi
        const isActive = btnDate === state.currentDate;
        btn.classList.toggle("active", isActive);
      });

      // Log removed
    },


    toggleViewMode() {
      state.viewMode = state.viewMode === 'list' ? 'tiles' : 'list';
      const list = Utils.$("#admin-tasks-list");
      list.classList.toggle('view-list', state.viewMode === 'list');

      const btn = Utils.$("#admin-view-toggle-btn");
      if (btn) {
        btn.innerHTML = state.viewMode === 'list' ? '📱' : '📝';
        btn.title = state.viewMode === 'list' ? 'Widok kafelkowy' : 'Widok listy';
      }
    },

    renderTasks() {
      const tasksList = Utils.$("#admin-tasks-list");
      const emptyState = Utils.$("#admin-tasks-empty");

      // Apply filter
      let filteredTasks = state.tasks;
      if (state.currentFilter !== "all") {
        if (state.currentFilter === "pending") {
          // Show both pending and paused in "Pending" tab
          filteredTasks = state.tasks.filter(
            (t) => t.status === "pending" || t.status === "paused"
          );
        } else {
          filteredTasks = state.tasks.filter(
            (t) => t.status === state.currentFilter
          );
        }
      }

      if (filteredTasks.length === 0) {
        tasksList.innerHTML = "";
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      // Ensure view mode class is applied
      const btn = Utils.$("#admin-view-toggle-btn");
      if (state.viewMode === 'list') {
        tasksList.classList.add('view-list');
        if (btn) {
          btn.innerHTML = '📱';
          btn.title = 'Widok kafelkowy';
        }
      } else {
        tasksList.classList.remove('view-list');
        if (btn) {
          btn.innerHTML = '📝';
          btn.title = 'Widok listy';
        }
      }

      tasksList.innerHTML = filteredTasks
        .map((task, index) => this.renderTaskCard(task, index + 1))
        .join("");

      this.attachTaskEventListeners();

      if (state.isReorderMode) {
        this.initDragAndDrop();
      }
    },

    renderTaskCard(task, order) {
      const isCompleted = task.status === "completed";
      const isInProgress = task.status === "in_progress";

      // Sprawdź czy użytkownik może edytować (admin główny lub twórca)
      // Zakładamy że ID=1 to główny admin
      const isMainAdmin = state.currentUser.id === 1;
      const isCreator = task.creator_id === state.currentUser.id;
      const canEdit = isMainAdmin || isCreator;

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

      const materialHtml = task.material
        ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
        : "";

      // Obsługa wielu kierowców (DODANO DLA ADMINA)
      let driversHtml = "";
      const allDrivers = [];

      if (task.assigned_name) allDrivers.push(task.assigned_name);
      if (task.additional_drivers) {
        task.additional_drivers.forEach((d) => allDrivers.push(d.name));
      }

      if (allDrivers.length > 0) {
        const driversList = allDrivers.join(", ");
        const icon = allDrivers.length > 1 ? "👥" : "👤";
        const label = allDrivers.length > 1 ? "Współdzielone" : "";

        driversHtml = `
                    <span class="task-meta-item" title="${Utils.escapeHtml(driversList)}">
                        <span>${icon}</span>
                        <span>${Utils.escapeHtml(driversList)}</span>
                        ${label ? `<span class="task-drivers-badge">${label}</span>` : ""}
                    </span>
                `;
      }

      const creatorHtml = task.creator_name
        ? `
                <span class="task-meta-item" title="Utworzył">
                    <span>✏️</span>
                    <span>${Utils.escapeHtml(task.creator_name)} (${Utils.formatTime(task.created_at)})</span>
                </span>
            `
        : "";

      // Przyciski akcji - tylko jeśli ma uprawnienia
      let actionsHtml = "";
      if (canEdit) {
        actionsHtml = `
                    <div class="task-actions">
                        <button class="task-action-btn" data-action="edit" data-id="${task.id}" title="Edytuj">
                            ✏️
                        </button>
                        <button class="task-action-btn btn-delete" data-action="delete" data-id="${task.id}" title="Usuń">
                            🗑️
                        </button>
                    </div>
                `;
      } else {
        actionsHtml = `
                    <div class="task-actions">
                        <span class="text-muted" style="font-size:12px">Brak uprawnień</span>
                    </div>
                `;
      }

      return `
                <div class="task-card priority-${task.priority} status-${task.status
        }" 
                     data-id="${task.id}" 
                     draggable="${state.isReorderMode &&
        !isCompleted &&
        !isInProgress &&
        canEdit
        }">
                    
                    ${state.isReorderMode && canEdit
          ? `
                    <div class="task-drag-handle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="6" r="2"/>
                            <circle cx="15" cy="6" r="2"/>
                            <circle cx="9" cy="12" r="2"/>
                            <circle cx="15" cy="12" r="2"/>
                            <circle cx="9" cy="18" r="2"/>
                            <circle cx="15" cy="18" r="2"/>
                        </svg>
                    </div>`
          : ""
        }
                    
                    <div class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(
          task.status
        )} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-order-badge">#${order}</span>
                            <span class="task-type-badge type-${task.task_type
        }">
                                ${Utils.getTaskTypeIcon(
          task.task_type
        )} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${task.priority
        }" 
                                  data-action="${canEdit ? "change-priority" : ""
        }" data-id="${task.id}" 
                                  title="Zmień priorytet" 
                                  style="${canEdit
          ? "cursor:pointer"
          : "cursor:default"
        }">
                                ${Utils.getPriorityIcon(
          task.priority
        )} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${task.id
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
                            ${task.scheduled_time
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
                            ${driversHtml}
                            ${creatorHtml}
                        </div>
                        ${actionsHtml}
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
      if (this._deletingTask) return;

      const task = state.tasks.find((t) => t.id == taskId);

      Modal.confirm(
        "Usunąć zadanie?",
        `Czy na pewno chcesz usunąć "${task?.description || "to zadanie"}"?`,
        async () => {
          this._deletingTask = true;

          // Instant UI update
          state.tasks = state.tasks.filter((t) => t.id != taskId);
          this.updateStats();
          this.renderTasks();
          Toast.success("Zadanie usunięte");

          // Sync w tle
          API.deleteTask(taskId)
            .catch(async () => {
              Toast.error("Błąd - odświeżam...");
              await this.loadTasks();
            })
            .finally(() => {
              this._deletingTask = false;
            });
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
      Modal.open("modal-priority");
    },

    async changePriority(taskId, newPriority) {
      if (this._changingPriority) return;
      this._changingPriority = true;

      const task = state.tasks.find((t) => t.id == taskId);
      if (!task) {
        this._changingPriority = false;
        return;
      }

      const oldPriority = task.priority;

      // Instant UI update
      task.priority = newPriority;
      this.sortTasks();
      this.renderTasks();
      Modal.close("modal-priority");
      Toast.success("Priorytet zmieniony");

      // Sync w tle
      API.updateTask(taskId, { ...task, priority: newPriority })
        .catch(async () => {
          task.priority = oldPriority; // Revert
          this.sortTasks();
          this.renderTasks();
          Toast.error("Błąd - przywrócono poprzedni priorytet");
        })
        .finally(() => {
          this._changingPriority = false;
        });
    },

    // DATE NAVIGATION
    changeDate(days) {
      state.currentDate = Utils.addDays(state.currentDate, days);
      Utils.$("#admin-date-picker").value = state.currentDate;
      state.currentFilter = "all";
      this.updateFilterButtons();
      this.loadTasks();
    },

    setDateByOffset(offset) {
      const today = Utils.getToday();
      state.currentDate = Utils.addDays(today, offset);
      Utils.$("#admin-date-picker").value = state.currentDate;
      state.currentFilter = "all";
      this.updateFilterButtons();
      this.loadTasks();
    },

    setDate(date) {
      state.currentDate = date;
      state.currentFilter = "all";
      this.updateFilterButtons();
      this.loadTasks();
    },

    setFilter(filter) {
      state.currentFilter = filter;
      this.updateFilterButtons();
      this.renderTasks();
    },

    updateFilterButtons() {
      Utils.$$("#admin-filters .filter-btn").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.filter === state.currentFilter
        );
      });
    },

    // REORDER MODE
    toggleReorderMode() {
      state.isReorderMode = !state.isReorderMode;

      const tasksList = Utils.$("#admin-tasks-list");
      const toggleBtn = Utils.$("#toggle-reorder-btn");
      const reorderInfo = Utils.$("#reorder-info");

      tasksList.classList.toggle("reorder-mode", state.isReorderMode);
      Utils.toggle(reorderInfo, state.isReorderMode);

      if (state.isReorderMode) {
        toggleBtn.innerHTML = "❌ Anuluj";
        // Filter to show only pending tasks
        state.currentFilter = "pending";
        this.updateFilterButtons();
      } else {
        toggleBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <span>Zmień kolejność</span>
                `;
      }

      this.renderTasks();
    },

    cancelReorder() {
      state.isReorderMode = false;
      Utils.$("#admin-tasks-list").classList.remove("reorder-mode");
      Utils.hide("#reorder-info");
      Utils.$("#toggle-reorder-btn").innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span>Zmień kolejność</span>
            `;
      this.loadTasks();
    },

    async saveReorder() {
      // Jeśli główny admin - zapisz od razu
      if (state.currentUser.id === 1) {
        this.submitReorder();
        return;
      }

      // Inni muszą podać powód
      Utils.$("#reorder-reason").value = "";
      Modal.open("modal-reorder-reason");

      // Obsługa przycisków modala
      const confirmBtn = Utils.$("#confirm-reorder-reason");
      const cancelBtn = Utils.$("#cancel-reorder-reason");

      // Usuń stare listenery (klonowanie)
      const newConfirm = confirmBtn.cloneNode(true);
      const newCancel = cancelBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
      cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

      newConfirm.addEventListener("click", () => {
        const reason = Utils.$("#reorder-reason").value.trim();
        if (!reason) {
          Toast.warning("Musisz podać powód");
          return;
        }
        Modal.close("modal-reorder-reason");
        this.submitReorder(reason);
      });

      newCancel.addEventListener("click", () => {
        Modal.close("modal-reorder-reason");
      });
    },

    async submitReorder(reason = null) {
      try {
        const taskCards = Utils.$$(
          "#admin-tasks-list .task-card:not(.status-completed):not(.status-in_progress)"
        );
        const newOrder = Array.from(taskCards).map((card) =>
          parseInt(card.dataset.id)
        );

        await API.reorderTasks(newOrder, reason, state.currentUser.id);

        state.isReorderMode = false;
        Utils.$("#admin-tasks-list").classList.remove("reorder-mode");
        Utils.hide("#reorder-info");
        Utils.$("#toggle-reorder-btn").innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <span>Zmień kolejność</span>
                `;

        Toast.success("Kolejność zapisana!");
        state.currentFilter = "all";
        this.updateFilterButtons();
        this.loadTasks();
      } catch (error) {
        Toast.error("Nie udało się zapisać kolejności");
      }
    },

    initDragAndDrop() {
      const tasksList = Utils.$("#admin-tasks-list");
      const cards = tasksList.querySelectorAll(
        ".task-card:not(.status-completed):not(.status-in_progress)"
      );

      let draggedItem = null;

      cards.forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          draggedItem = card;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });

        card.addEventListener("dragend", () => {
          if (draggedItem) draggedItem.classList.remove("dragging");
          draggedItem = null;
          cards.forEach((c) => c.classList.remove("drag-over"));
          this.updateOrderBadges();
        });

        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (
            card !== draggedItem &&
            !card.classList.contains("status-in_progress")
          ) {
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
              tasksList.querySelectorAll(
                ".task-card:not(.status-completed):not(.status-in_progress)"
              )
            );
            const draggedIdx = allCards.indexOf(draggedItem);
            const targetIdx = allCards.indexOf(card);

            if (draggedIdx < targetIdx) {
              card.parentNode.insertBefore(draggedItem, card.nextSibling);
            } else {
              card.parentNode.insertBefore(draggedItem, card);
            }
            this.updateOrderBadges();
          }
        });
      });
    },

    updateOrderBadges() {
      const cards = Utils.$$("#admin-tasks-list .task-card");
      cards.forEach((card, index) => {
        const badge = card.querySelector(".task-order-badge");
        if (badge) badge.textContent = `#${index + 1}`;
      });
    },

    // USERS
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

      const canManageUsers = state.currentUser.id === 1 || state.currentUser.perm_users;
      const renderActions = (userId) => {
        if (!canManageUsers) return "";
        return `
                  <div class="user-actions">
                      <button class="task-action-btn btn-edit" data-action="edit-user" data-id="${userId}">✏️</button>
                      <button class="task-action-btn btn-delete" data-action="delete-user" data-id="${userId}">🗑️</button>
                  </div>`;
      };

      list.innerHTML =
        state.users
          .map(
            (user) => `
              <div class="user-card" data-id="${user.id}">
                  <div class="user-info">
                      <div class="user-details">
                          <h3>${Utils.escapeHtml(user.name)}</h3>
                          <p class="user-role text-muted">
                              ${user.role === "admin"
                ? "👔 Kierownik"
                : "🚗 Kierowca"
              }
                              ${user.role === "admin"
                ? `<br><small style="font-size: 0.8em; opacity: 0.8;">
                                  ${user.perm_reports ? "📊" : ""} 
                                  ${user.perm_users ? "👥" : ""} 
                                  ${user.perm_locations ? "📍" : ""}
                              </small>`
                : ""
              }
                          </p>
                      </div>
                  </div>
                  ${renderActions(user.id)}
              </div>
          `
          )
          .join("") ||
        '<p class="text-muted text-center">Brak użytkowników</p>';

      list.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          const userId = btn.dataset.id;
          if (action === "edit-user") this.openEditUserModal(userId);
          else if (action === "delete-user") this.deleteUser(userId);
        });
      });
    },

    // --- USER MODAL LOGIC ---
    openAddUserModal() {
      Utils.$("#user-id").value = "";
      Utils.$("#user-form").reset();
      Utils.$("#modal-user-title").textContent = "Nowy użytkownik";

      // Reset widoczności pól
      Utils.hide(Utils.$("#driver-hours-fields"));
      Utils.hide(Utils.$("#admin-permissions-fields"));

      // Reset checkboxów
      Utils.$("#perm-reports").checked = true;
      Utils.$("#perm-users").checked = true;
      Utils.$("#perm-locations").checked = true;

      // Reset radio buttons (domyślnie driver)
      const driverRadio = document.querySelector(
        'input[name="user-role"][value="driver"]'
      );
      if (driverRadio) driverRadio.checked = true;

      this.setupUserRoleToggle(); // Ensure listeners attached
      Modal.open("modal-user");
    },

    openEditUserModal(userId) {
      const user = state.users.find((u) => u.id == userId);
      if (!user) return;

      Utils.$("#user-id").value = user.id;
      Utils.$("#user-name").value = user.name;
      Utils.$("#user-pin").value = ""; // PIN pusty przy edycji
      Utils.$("#user-work-start").value = user.work_start || "07:00";
      Utils.$("#user-work-end").value = user.work_end || "15:00";

      // Ustaw rolę
      const radio = document.querySelector(
        `input[name="user-role"][value="${user.role}"]`
      );
      if (radio) radio.checked = true;

      // Pokaż/ukryj odpowiednie pola w zależności od roli
      if (user.role === "admin") {
        Utils.hide(Utils.$("#driver-hours-fields"));
        Utils.show(Utils.$("#admin-permissions-fields"));

        // Ustaw checkboxy uprawnień (zakładamy 1 = ma, 0 = nie ma)
        // Jeśli pole nie istnieje (stary rekord), traktujemy jako 1 (wsteczna kompatybilność)
        Utils.$("#perm-reports").checked = user.perm_reports !== 0;
        Utils.$("#perm-users").checked = user.perm_users !== 0;
        Utils.$("#perm-locations").checked = user.perm_locations !== 0;
      } else {
        Utils.show(Utils.$("#driver-hours-fields"));
        Utils.hide(Utils.$("#admin-permissions-fields"));
      }

      this.setupUserRoleToggle();

      Utils.$("#modal-user-title").textContent = "Edycja użytkownika";
      Modal.open("modal-user");
    },

    setupUserRoleToggle() {
      const roleRadios = document.querySelectorAll('input[name="user-role"]');
      roleRadios.forEach((radio) => {
        // Remove old listener to avoid duplicates if called multiple times (though simple assignment is safer, addEventListener stacks)
        // A better way is to set onchange property or ensure init only once.
        // For safety in this legacy code structure:
        radio.onchange = (e) => {
          if (e.target.value === "admin") {
            Utils.hide(Utils.$("#driver-hours-fields"));
            Utils.show(Utils.$("#admin-permissions-fields"));
          } else {
            Utils.show(Utils.$("#driver-hours-fields"));
            Utils.hide(Utils.$("#admin-permissions-fields"));
          }
        };
      });
    },

    async handleSaveUser(e) {
      e.preventDefault();

      if (this._savingUser) return;
      this._savingUser = true;

      const id = Utils.$("#user-id").value;
      const name = Utils.$("#user-name").value.trim();
      const pin = Utils.$("#user-pin").value;
      const role = document.querySelector(
        'input[name="user-role"]:checked'
      ).value;

      if (!name) {
        Toast.warning("Wpisz imię i nazwisko");
        this._savingUser = false;
        return;
      }

      if (!id && !pin) {
        Toast.warning("Wpisz PIN dla nowego użytkownika");
        this._savingUser = false;
        return;
      }

      const userData = {
        name,
        role,
      };

      // Godziny pracy tylko dla kierowców
      if (role === "driver") {
        userData.work_start = Utils.$("#user-work-start").value || "07:00";
        userData.work_end = Utils.$("#user-work-end").value || "15:00";
      }

      // Uprawnienia dla admina
      if (role === "admin") {
        userData.perm_reports = Utils.$("#perm-reports").checked ? 1 : 0;
        userData.perm_users = Utils.$("#perm-users").checked ? 1 : 0;
        userData.perm_locations = Utils.$("#perm-locations").checked ? 1 : 0;
      }

      // PIN tylko jeśli podany
      if (pin) {
        userData.pin = pin;
      }

      // Instant - zamknij i pokaż sukces
      Modal.close("modal-user");
      Toast.success(id ? "Zapisano zmiany" : "Dodano użytkownika");

      // Sync w tle
      try {
        if (id) {
          await API.updateUser(id, userData);
        } else {
          await API.createUser(userData);
        }
        await this.loadUsers();
      } catch (error) {
        Toast.error("Błąd zapisu - spróbuj ponownie");
        await this.loadUsers();
      } finally {
        this._savingUser = false;
      }
    },

    async deleteUser(userId) {
      const user = state.users.find((u) => u.id == userId);

      if (user.id === state.currentUser.id) {
        Toast.warning("Nie możesz usunąć siebie");
        return;
      }

      Modal.confirm(
        "Usunąć użytkownika?",
        `Czy na pewno chcesz usunąć "${user?.name}"?`,
        async () => {
          // Instant UI update
          const removedUser = state.users.find((u) => u.id == userId);
          state.users = state.users.filter((u) => u.id != userId);
          this.renderUsers();
          Toast.success("Użytkownik usunięty");

          // Sync w tle
          API.deleteUser(userId).catch(async () => {
            state.users.push(removedUser); // Revert
            this.renderUsers();
            Toast.error("Błąd - przywrócono użytkownika");
          });
        }
      );
    },

    // LOCATIONS
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
      const canManageLocations = state.currentUser.id === 1 || state.currentUser.perm_locations;

      const renderDeleteBtn = (id) =>
        canManageLocations
          ? `
                <div class="location-actions">
                    <button class="task-action-btn btn-delete" data-action="delete-location" data-id="${id}">🗑️</button>
                </div>
            `
          : "";

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
                    ${renderDeleteBtn(loc.id)}
                </div>
            `
          )
          .join("") || '<p class="text-muted text-center">Brak lokalizacji</p>';

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
                    ${renderDeleteBtn(dept.id)}
                </div>
            `
          )
          .join("") || '<p class="text-muted text-center">Brak działów</p>';

      if (canManageLocations) {
        Utils.$$('[data-action="delete-location"]').forEach((btn) => {
          btn.addEventListener("click", () =>
            this.deleteLocation(btn.dataset.id)
          );
        });
      }
    },

    async handleLocationSubmit(e) {
      e.preventDefault();

      if (this._addingLocation) return;

      const name = Utils.$("#location-name").value.trim();
      const type = document.querySelector(
        'input[name="location-type"]:checked'
      ).value;

      if (!name) {
        Toast.warning("Wpisz nazwę");
        return;
      }

      this._addingLocation = true;

      // Instant - zamknij i pokaż sukces
      Modal.close("modal-location");
      Toast.success(
        type === "department" ? "Dział dodany" : "Lokalizacja dodana"
      );

      // Tymczasowo dodaj do UI
      const tempId = Date.now(); // Tymczasowe ID
      const newItem = { id: tempId, name, type, active: 1 };

      if (type === "department") {
        state.departments.push(newItem);
      } else {
        state.locations.push(newItem);
      }
      this.renderLocations();
      DataLists.updateAll();

      // Sync w tle
      try {
        const result = await API.createLocation({ name, type });
        // Zaktualizuj prawdziwe ID
        if (type === "department") {
          const item = state.departments.find((d) => d.id === tempId);
          if (item) item.id = result.id;
        } else {
          const item = state.locations.find((l) => l.id === tempId);
          if (item) item.id = result.id;
        }
      } catch (error) {
        // Revert
        state.locations = state.locations.filter((l) => l.id !== tempId);
        state.departments = state.departments.filter((d) => d.id !== tempId);
        this.renderLocations();
        DataLists.updateAll();
        Toast.error("Błąd - nie dodano");
      } finally {
        this._addingLocation = false;
      }
    },

    async deleteLocation(locationId) {
      const allLocs = [...state.locations, ...state.departments];
      const loc = allLocs.find((l) => l.id == locationId);

      Modal.confirm(
        "Usunąć?",
        `Czy na pewno chcesz usunąć "${loc?.name}"?`,
        async () => {
          // Zapisz do ewentualnego przywrócenia
          const wasLocation = state.locations.find((l) => l.id == locationId);
          const wasDepartment = state.departments.find(
            (l) => l.id == locationId
          );

          // Instant UI update
          state.locations = state.locations.filter((l) => l.id != locationId);
          state.departments = state.departments.filter(
            (l) => l.id != locationId
          );
          this.renderLocations();
          DataLists.updateAll();
          Toast.success("Usunięto");

          // Sync w tle
          API.deleteLocation(locationId).catch(() => {
            // Revert
            if (wasLocation) state.locations.push(wasLocation);
            if (wasDepartment) state.departments.push(wasDepartment);
            this.renderLocations();
            DataLists.updateAll();
            Toast.error("Błąd - przywrócono");
          });
        }
      );
    },

    // REPORTS
    async loadReports(period = "today") {
      try {
        // Dodaj timestamp żeby nie było cache
        const data = await API.getReports(period + "&t=" + Date.now());
        this.renderReports(data);
      } catch (error) {
        console.error("Failed to load reports:", error);
        Utils.$("#report-stats").innerHTML =
          '<p class="text-muted">Błąd ładowania</p>';
      }
    },

    renderReports(data) {
      const container = Utils.$("#report-drivers-list");
      const statsContainer = Utils.$("#report-stats");

      if (!data || !data.drivers) {
        container.innerHTML =
          '<p class="text-muted text-center">Brak danych</p>';
        return;
      }

      // Podsumowanie ogólne
      const totalTasks = data.drivers.reduce((sum, d) => sum + d.tasksCount, 0);
      const avgKpi = Math.round(
        data.drivers.reduce((sum, d) => sum + d.kpi, 0) /
        (data.drivers.length || 1)
      );

      statsContainer.innerHTML = `
                <div class="report-stat">
                    <div class="report-stat-value">${totalTasks}</div>
                    <div class="report-stat-label">Zadań</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${avgKpi}%</div>
                    <div class="report-stat-label">Śr. KPI</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${data.drivers.length}</div>
                    <div class="report-stat-label">Kierowców</div>
                </div>
            `;

      container.innerHTML = data.drivers
        .map((driver, index) => {
          const kpiColor =
            driver.kpi >= 80 ? "high" : driver.kpi >= 50 ? "medium" : "low";
          let chartHtml = "";
          let labelsHtml = "";
          let detailsHtml = "";

          if (driver.isSingleDay) {
            chartHtml = this.generateTimeline(driver.timeline);
            labelsHtml = `
                        <div class="timeline-labels">
                            <span>${driver.workStart || "07:00"}</span>
                            <span>${driver.workEnd || "15:00"}</span>
                        </div>
                    `;

            // Generuj tabelę szczegółów tylko dla widoku dnia
            if (driver.details && driver.details.length > 0) {
              detailsHtml = `
                            <button class="btn btn-small btn-toggle-details" onclick="TransportTracker.AdminPanel.toggleDetails(${index})">
                                ▼ Pokaż szczegóły
                            </button>
                            <div id="details-${index}" class="details-container">
                                ${driver.details
                  .map(
                    (d) => `
                                    <div class="details-row type-${d.type}">
                                        <span class="details-time">${d.time} - ${d.endTime || '?'}</span>
                                        <span class="details-desc">${Utils.escapeHtml(d.desc)}</span>
                                        <span class="details-duration">${d.duration}m</span>
                                    </div>
                                `
                  )
                  .join("")}
                            </div>
                        `;
            }
          } else {
            chartHtml = this.generateBarChart(driver.timeline);
          }

          return `
                    <div class="report-driver-card">
                        <div class="report-driver-header">
                            <div class="report-driver-info">
                                <div class="user-avatar">🚗</div>
                                <div>
                                    <h3>${Utils.escapeHtml(driver.name)}</h3>
                                    <span class="text-muted" style="font-size:12px">KPI: ${driver.kpi
            }%</span>
                                </div>
                            </div>
                            <div class="report-driver-kpi ${kpiColor}">${driver.kpi
            }%</div>
                        </div>

                        <div class="kpi-grid">
                            <div class="kpi-box">
                                <div class="kpi-value">${this.formatDuration(
              driver.workTime
            )}</div>
                                <div class="kpi-label">Praca</div>
                            </div>
                            <div class="kpi-box">
                                <div class="kpi-value" style="color:var(--danger)">${this.formatDuration(
              driver.delayTime
            )}</div>
                                <div class="kpi-label">Przestoje</div>
                            </div>
                            <div class="kpi-box">
                                <div class="kpi-value">${driver.tasksCount
            }</div>
                                <div class="kpi-label">Zadań</div>
                            </div>
                        </div>

                        <div class="timeline-container ${driver.isSingleDay ? "" : "bar-chart"
            }" 
                             style="${driver.isSingleDay
              ? ""
              : "height:150px; overflow-x:auto; overflow-y:hidden;"
            }">
                            ${chartHtml}
                        </div>
                        ${labelsHtml}
                        ${detailsHtml}
                    </div>
                `;
        })
        .join("");
    },

    // Dodaj tę funkcję do obiektu AdminPanel:
    toggleDetails(index) {
      const el = Utils.$(`#details-${index}`);
      const btn = el.previousElementSibling;
      if (el.classList.contains("visible")) {
        el.classList.remove("visible");
        btn.textContent = "▼ Pokaż szczegóły";
      } else {
        el.classList.add("visible");
        btn.textContent = "▲ Ukryj szczegóły";
      }
    },

    formatDuration(minutes) {
      if (!minutes) return "0m";
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },

    generateBarChart(days) {
      if (!days || days.length === 0)
        return '<p class="text-center text-muted" style="padding:20px">Brak danych</p>';

      return `
                <div style="display:flex; gap:10px; height:100%; align-items:flex-end; padding:10px;">
                    ${days
          .map(
            (d) => `
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; min-width:30px;">
                            <div style="font-size:10px; margin-bottom:4px; font-weight:bold;">${this.formatDuration(
              d.minutes
            )}</div>
                            <div style="width:100%; background:var(--bg-tertiary); height:80px; border-radius:4px; position:relative; overflow:hidden;">
                                <div style="position:absolute; bottom:0; left:0; right:0; height:${d.percent
              }%; background:var(--primary); transition:height 0.3s;" title="${Utils.formatDateShort(
                d.date
              )}"></div>
                            </div>
                            <div style="font-size:9px; margin-top:4px; color:var(--text-secondary); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${Utils.formatDateShort(
                d.date
              )}</div>
                        </div>
                    `
          )
          .join("")}
                </div>
            `;
    },

    generateTimeline(events) {
      if (!events || events.length === 0) return "";

      // Znajdź zakres godzin dynamicznie (min 6:00 - 18:00, ale rozszerz jeśli są zadania poza)
      let minHour = 6;
      let maxHour = 18;

      events.forEach(e => {
        const s = new Date(e.start).getHours();
        const end = new Date(e.end);
        const en = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
        if (s < minHour) minHour = s;
        if (en > maxHour) maxHour = en;
      });

      const startHour = minHour;
      const endHour = maxHour;
      const totalMinutes = (endHour - startHour) * 60;
      const dayStart = new Date(); // Używamy tylko do porównywania godzin
      dayStart.setHours(startHour, 0, 0, 0);

      // Sortuj eventy chronologicznie
      events.sort((a, b) => new Date(a.start) - new Date(b.start));

      // Algorytm pakowania w rzędy (jak Tetris)
      let rows = [];

      events.forEach((event) => {
        const start = new Date(event.start);
        const end = new Date(event.end);

        // Fix: Jeśli zadanie jest z innego dnia (np. przeniesione), pokaż je od początku skali lub wcale
        // Tutaj zakładamy że eventy są z jednego dnia (filtrowane wcześniej)

        // Znajdź pierwszy wolny rząd
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const lastEventInRow = rows[i][rows[i].length - 1];
          if (new Date(lastEventInRow.end) <= start) {
            rowIndex = i;
            break;
          }
        }

        if (rowIndex === -1) {
          rows.push([event]);
        } else {
          rows[rowIndex].push(event);
        }
      });

      // Generowanie markerów godzin
      let markersHtml = '<div class="timeline-markers">';
      for (let h = startHour; h <= endHour; h++) {
        const left = ((h - startHour) * 60 / totalMinutes) * 100;
        markersHtml += `
          <div class="timeline-marker" style="left: ${left}%">
            ${h % 2 === 0 || totalMinutes < 720 ? `<div class="timeline-time">${h}:00</div>` : ''}
          </div>
        `;
      }
      markersHtml += '</div>';

      // Renderowanie pasków
      const barsHtml = rows
        .map((row, rowIndex) => {
          const height = 100 / Math.max(rows.length, 1);
          const top = rowIndex * height;

          return row
            .map((event) => {
              const start = new Date(event.start);
              const end = new Date(event.end);

              // Oblicz pozycję względem startHour
              // Uważaj na daty - jeśli event.start ma inną datę niż dayStart, musimy normalizować
              const startH = start.getHours();
              const startM = start.getMinutes();
              const eventStartMins = (startH * 60) + startM;
              const dayStartMins = startHour * 60;

              const startDiff = eventStartMins - dayStartMins;
              const duration = (end - start) / 1000 / 60;

              let left = (startDiff / totalMinutes) * 100;
              let width = (duration / totalMinutes) * 100;

              if (left < 0) {
                width += left;
                left = 0;
              }
              if (left + width > 100) width = 100 - left;
              if (width <= 0) return "";

              return `
                        <div class="timeline-bar ${event.type}" 
                             style="left: ${left}%; width: ${width}%; height: ${height - 2}%; top: ${top}%;"
                             data-title="${Utils.escapeHtml(event.desc)} (${Math.round(duration)} min)">
                        </div>
                    `;
            })
            .join("");
        })
        .join("");

      return markersHtml + barsHtml;
    },

    // TABS
    switchTab(tabId) {
      state.currentTab = tabId;

      Utils.$$(".tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      Utils.$$(".tab-content").forEach((content) => {
        content.classList.toggle("active", content.id === `tab-${tabId}`);
      });

      if (tabId === "reports") {
        // Opóźnij ładowanie raportów aby upewnić się że kontener jest widoczny
        setTimeout(() => this.loadReports(), 50);
      }
    },

    // EVENT LISTENERS
    initEventListeners() {
      // Add task
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
      Utils.$("#admin-date-picker")?.addEventListener("change", (e) =>
        this.setDate(e.target.value)
      );

      // Quick date buttons
      Utils.$$(".date-quick-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const offset = parseInt(btn.dataset.offset);
          this.setDateByOffset(offset);
        });
      });

      // Filters
      Utils.$$("#admin-filters .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => this.setFilter(btn.dataset.filter));
      });

      // Reorder
      Utils.$("#toggle-reorder-btn")?.addEventListener("click", () =>
        this.toggleReorderMode()
      );

      Utils.$("#admin-view-toggle-btn")?.addEventListener("click", () =>
        this.toggleViewMode()
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
          this.changePriority(taskId, btn.dataset.priority);
        });
      });

      // Tabs
      Utils.$$(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
      });

      // Users
      Utils.$("#add-user-btn")?.addEventListener("click", () =>
        this.openAddUserModal()
      );
      Utils.$("#user-form")?.addEventListener("submit", (e) =>
        this.handleSaveUser(e)
      );

      // Locations
      Utils.$("#add-location-btn")?.addEventListener("click", () =>
        Modal.open("modal-location")
      );
      Utils.$("#location-form")?.addEventListener("submit", (e) =>
        this.handleLocationSubmit(e)
      );

      // Reports - NOWA LOGIKA
      const reportType = Utils.$("#report-period-type");
      const monthPicker = Utils.$("#report-month-picker");
      const dayPicker = Utils.$("#report-day-picker");

      // Ustaw domyślne daty
      if (monthPicker) monthPicker.value = new Date().toISOString().slice(0, 7);
      if (dayPicker) dayPicker.value = Utils.getToday();

      const updateReport = () => {
        if (!reportType) return;

        const type = reportType.value;
        let period = type;

        Utils.hide(monthPicker);
        Utils.hide(dayPicker);

        if (type === "month") {
          Utils.show(monthPicker);
          period = monthPicker.value;
        } else if (type === "day") {
          Utils.show(dayPicker);
          period = dayPicker.value;
        }

        this.loadReports(period || "today");
      };

      if (reportType) {
        reportType.addEventListener("change", updateReport);
        // NIE wywołujemy tu updateReport() - zrobimy to po zalogowaniu
      }

      monthPicker?.addEventListener("change", updateReport);
      dayPicker?.addEventListener("change", updateReport);
    },
  };

  // =============================================
  // 15. INIT
  // =============================================
  async function init() {
    console.log("🚛 TransportTracker v2.0 initializing...");

    // OneSignal Init (Global)
    // Czekamy chwilę aż biblioteka się załaduje
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalService.init();
    Sync.init();

    Toast.init();
    Modal.init();
    Theme.init();
    Theme.initEventListeners();
    Auth.initEventListeners();
    Notifications.initEventListeners();
    DriverPanel.initEventListeners();
    TaskForm.initEventListeners();
    AdminPanel.initEventListeners();

    // Linki regulaminu i polityki prywatności
    Utils.$("#open-terms-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.open("modal-terms");
    });
    Utils.$("#open-privacy-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.open("modal-privacy");
    });

    // Deep Link Handling (TaskId z URL)
    const urlParams = new URLSearchParams(window.location.search);
    const DeepLinkTaskId = urlParams.get("taskId");

    if (DeepLinkTaskId) {
      console.log("🔗 Deep Link detected:", DeepLinkTaskId);
      // Czekamy na logowanie...
    }

    // DODAJ TO: Nasłuchuj wiadomości z Service Workera
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        // Ignoruj wiadomości z OneSignal SDK
        if (!event.data || !event.data.type) return;
        if (event.data.command) return; // Wiadomości wewnętrzne OneSignal

        if (event.data.type === "PUSH_RECEIVED") {
          Toast.info(
            event.data.data?.message ||
            event.data.data?.title ||
            "Nowe powiadomienie"
          );
          Notifications.load();
          if (state.currentUser?.role === "driver") {
            DriverPanel.loadTasks(true);
          } else if (state.currentUser?.role === "admin") {
            AdminPanel.loadTasks(true);
          }
        }

        if (event.data.type === "NOTIFICATION_CLICK" && event.data.taskId) {
          if (state.currentUser?.role === "driver") {
            DriverPanel.openTaskDetails(event.data.taskId);
          } else if (state.currentUser?.role === "admin") {
            AdminPanel.openTaskDetails(event.data.taskId);
          }
        }
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await Auth.init();

    // Jeśli mieliśmy Deep Link, otwórz zadanie po zalogowaniu
    if (DeepLinkTaskId && state.currentUser) {
      if (state.currentUser.role === "driver") {
        DriverPanel.openTaskDetails(DeepLinkTaskId);
      } else {
        AdminPanel.openTaskDetails(DeepLinkTaskId);
      }
      // Wyczyść URL
      window.history.replaceState({}, document.title, "/");
    }
    // Diagnostyka
    console.log("📱 Device Info:", {
      userAgent: navigator.userAgent.substring(0, 100),
      platform: navigator.platform,
      serviceWorker: "serviceWorker" in navigator,
      pushManager: "PushManager" in window,
      notification: "Notification" in window,
      notificationPermission:
        "Notification" in window ? Notification.permission : "N/A",
      isAndroid: /Android/i.test(navigator.userAgent),
      isChrome: /Chrome/i.test(navigator.userAgent),
      isSamsung: /SamsungBrowser/i.test(navigator.userAgent),
    });

    console.log("✅ TransportTracker ready!");
  }

  // =============================================
  // 16. ONESIGNAL SERVICE
  // =============================================
  const OneSignalService = {
    initialized: false,
    initPromise: null,

    async init() {
      // Prevent multiple initializations
      if (this.initPromise) return this.initPromise;

      this.initPromise = new Promise((resolve) => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];

        window.OneSignalDeferred.push(async function (OneSignal) {
          try {
            await OneSignal.init({
              appId: CONFIG.ONESIGNAL_APP_ID,
              allowLocalhostAsSecureOrigin: true,
              serviceWorkerPath: "/OneSignalSDKWorker.js",
              serviceWorkerParam: { scope: "/" },
            });

            console.log("✅ OneSignal: SDK Initialized");
            OneSignalService.initialized = true;

            // Event: Foreground notification
            OneSignal.Notifications.addEventListener(
              "foregroundWillDisplay",
              (event) => {
                // Odśwież powiadomienia w dzwoneczku
                Notifications.load();
                Toast.info(event.notification.body || "Nowe powiadomienie");
              }
            );

            // Event: Notification click
            OneSignal.Notifications.addEventListener("click", (event) => {
              const taskId = event.notification?.data?.taskId;
              if (taskId && state.currentUser) {
                if (state.currentUser.role === "driver") {
                  DriverPanel.openTaskDetails(taskId);
                } else {
                  AdminPanel.openTaskDetails(taskId);
                }
              }
            });

            resolve(true);
          } catch (e) {
            console.error("❌ OneSignal Init Error:", e);
            resolve(false);
          }
        });
      });

      return this.initPromise;
    },

    async login(userId, role) {
      if (!this.initialized) {
        console.warn("⚠️ OneSignal not initialized, skipping login");
        return;
      }

      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          // Sprawdź czy mamy zgodę na push
          const permission = await OneSignal.Notifications.permissionNative;

          if (permission !== "granted") {
            return;
          }

          // Sprawdź czy jest subskrypcja
          const pushSubscription = await OneSignal.User.PushSubscription.id;

          if (!pushSubscription) {
            return;
          }

          const externalId = String(userId);

          await OneSignal.login(externalId);

          await OneSignal.User.addTags({
            role: role,
            user_id: externalId,
          });


        } catch (e) {
          console.error("❌ OneSignal Login Error:", e);
        }
      });
    },

    async requestPermission() {
      if (!this.initialized) {
        await this.init();
      }

      return new Promise((resolve) => {
        window.OneSignalDeferred.push(async function (OneSignal) {
          try {
            const currentPermission = await OneSignal.Notifications
              .permissionNative;

            if (currentPermission === "granted") {
              resolve(true);
              return;
            }

            if (currentPermission === "denied") {
              Toast.warning(
                "Powiadomienia zostały zablokowane w ustawieniach przeglądarki"
              );
              resolve(false);
              return;
            }

            // Poproś o zgodę

            const result = await OneSignal.Notifications.requestPermission();

            if (result) {
              Toast.success("Powiadomienia włączone! 🔔");
              // Teraz możemy zalogować użytkownika
              if (state.currentUser) {
                await OneSignalService.login(
                  state.currentUser.id,
                  state.currentUser.role
                );
              }
            }

            resolve(result);
          } catch (e) {
            console.error("❌ OneSignal Permission Error:", e);
            resolve(false);
          }
        });
      });
    },

    logout() {
      if (!this.initialized) return;

      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.logout();
        } catch (e) {
          // Ignoruj błędy logout - to nie jest krytyczne
          console.warn("⚠️ OneSignal Logout:", e);
        }
      });
    },
  };

  // =============================================
  // 17. EXPORT
  // =============================================
  window.TransportTracker = {
    state,
    Utils,
    API,
    Sync,
    Toast,
    Modal,
    Screen,
    Theme,
    Auth,
    Notifications,
    DriverPanel,
    TaskForm,
    AdminPanel,
    OneSignalService,
  };

  // =============================================
  // 18. URUCHOM APLIKACJĘ
  // =============================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
