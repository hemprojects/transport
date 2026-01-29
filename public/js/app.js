// =============================================
// TransportTracker - Aplikacja JavaScript
// Wersja 1.0.0 - beta
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
      TASKS: "tt_tasks_cache",
      LOCATIONS: "tt_locations",
      DEPARTMENTS: "tt_departments",
      USERS: "tt_users",
    },
    ONESIGNAL_APP_ID: "7080dabd-158d-471a-b5e4-00b620b33004", // Zmień to na swoje ID z OneSignal!
  };

  // =============================================
  // 2. STAN APLIKACJI
  // =============================================
  const state = {
    // ... existnig state ...
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
    lastReportData: null, // Store last loaded report data for printing
    lastReportPeriod: "today",
  };

  // ... Utils ...

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
          parseInt(timeParts[2] || 0),
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
      return this.formatDateShort(
        dateTimeStr.split(" ")[0] || dateTimeStr.split("T")[0],
      );
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

    getLoaderHtml() {
      return `
        <div class="loader-inline-wrapper">
          <div class="loader-inline"></div>
          <div>Ładowanie danych...</div>
        </div>
      `;
    },

    // Oblicz odległość między dwoma punktami na mapie (w % mapy)
    getMapDistance(loc1Name, loc2Name) {
      // Znajdź lokalizacje po nazwie
      const allLocations = [...state.locations, ...state.departments];
      const loc1 = allLocations.find((l) => l.name === loc1Name);
      const loc2 = allLocations.find((l) => l.name === loc2Name);

      // Jeśli brak współrzędnych - zwróć nieskończoność (brak sugestii)
      if (!loc1?.map_x || !loc1?.map_y || !loc2?.map_x || !loc2?.map_y) {
        return Infinity;
      }

      const dx = loc1.map_x - loc2.map_x;
      const dy = loc1.map_y - loc2.map_y;

      return Math.sqrt(dx * dx + dy * dy);
    },

    // Próg bliskości (w % mapy) - można dostosować
    NEARBY_THRESHOLD: 15,

    // Sprawdź czy lokalizacja jest "w pobliżu"
    isNearby(loc1Name, loc2Name) {
      const distance = this.getMapDistance(loc1Name, loc2Name);
      return distance <= this.NEARBY_THRESHOLD;
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

    async updateLocation(id, data) {
      return await this.request(`/locations/${id}`, {
        method: "PUT",
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

    // REPORTS
    async getReports(period = "week") {
      const timestamp = new Date().getTime();
      return await this.request(`/reports?period=${period}&t=${timestamp}`);
    },

    // MAP PATHS
    async getMapPaths() {
      return await this.request("/map-paths");
    },

    async createMapPath(data) {
      return await this.request("/map-paths", {
        method: "POST",
        body: data,
      });
    },

    async deleteMapPath(id) {
      return await this.request(`/map-paths/${id}`, {
        method: "DELETE",
      });
    },
    // ROAD NETWORK
    async getRoadNetwork() {
      return await this.request("/road-network");
    },

    async saveRoadNetwork(data) {
      return await this.request("/road-network", {
        method: "POST",
        body: data,
      });
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
        attempts: 0,
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
          this.queue = this.queue.filter((a) => a.id !== action.id);
          this.persistQueue();
        } catch (error) {
          console.error(`[Sync] Action ${action.name} failed:`, error);
          action.attempts++;

          // Jeśli to błąd krytyczny (np. 403, 400) lub za dużo prób - usuń i ewentualnie rollback
          if (action.attempts >= 3) {
            this.queue = this.queue.filter((a) => a.id !== action.id);
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
        case "updateTaskStatus":
          return await API.updateTaskStatus(
            action.data.id,
            action.data.status,
            action.data.userId,
          );
        case "joinTask":
          return await API.joinTask(action.data.taskId, action.data.userId);
        case "createTaskLog":
          return await API.createTaskLog(
            action.data.taskId,
            action.data.logData,
          );
        case "deleteReadNotifications":
          return await API.deleteReadNotifications(action.data.userId);
        case "markNotificationRead":
          return await API.markNotificationRead(action.data.notificationId);
        case "createTask":
          return await API.createTask(action.data.taskData);
        default:
          console.warn(`[Sync] Unknown action: ${action.name}`);
      }
    },

    persistQueue() {
      localStorage.setItem("tt_sync_queue", JSON.stringify(this.queue));
    },

    loadQueue() {
      const saved = localStorage.getItem("tt_sync_queue");
      if (saved) {
        try {
          this.queue = JSON.parse(saved);
        } catch (e) {
          this.queue = [];
        }
      }
    },
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
      if (!modal) {
        console.warn(`[Modal] Element with ID "${modalId}" not found in DOM.`);
        return;
      }

      modal.classList.remove("hidden");
      modal.classList.add("active");

      this.openModals.push(modalId);
      document.body.style.overflow = "hidden";

      setTimeout(() => {
        const firstInput = modal.querySelector(
          'input:not([type="hidden"]):not([type="radio"]), select, textarea',
        );
        if (firstInput) firstInput.focus();
      }, 100);
    },

    close(modalId, shouldReset = true) {
      const modal = Utils.$(`#${modalId}`);
      if (!modal) return;

      modal.classList.remove("active");
      modal.classList.add("hidden");

      this.openModals = this.openModals.filter((id) => id !== modalId);

      if (this.openModals.length === 0) {
        document.body.style.overflow = "";
      }

      if (shouldReset) {
        const form = modal.querySelector("form");
        if (form) form.reset();
      }
    },

    closeAll() {
      [...this.openModals].forEach((id) => this.close(id));
    },

    confirm(
      title,
      message,
      onConfirm,
      confirmText = "Potwierdź",
      isDanger = true,
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
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const modalId = btn.getAttribute("data-close");
          this.close(modalId);
        });
      });

      Utils.$$(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) {
            const modal = overlay.closest(".modal");
            if (modal) this.close(modal.id);
          }
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
        newTheme === "dark" ? "Tryb ciemny włączony" : "Tryb jasny włączony",
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
        this.toggle(),
      );
      Utils.$("#admin-theme-btn")?.addEventListener("click", () =>
        this.toggle(),
      );
    },
  };

  // =============================================
  // 8. SCREEN
  // =============================================
  const Screen = {
    show(screenId) {
      console.log(`📺 Screen.show("${screenId}") called`);
      Utils.$$(".screen").forEach((screen) => {
        screen.classList.remove("active");
      });

      const targetScreen = Utils.$(`#screen-${screenId}`);
      if (targetScreen) {
        targetScreen.classList.add("active");
        state.currentScreen = screenId;

        // BŁYSKAWICZNE ODŚWIEŻANIE przy przełączaniu ekranów
        if (screenId === "driver") {
          DriverPanel.loadTasks(true);
        } else if (screenId === "admin") {
          AdminPanel.loadTasks(true);
        }
      } else {
        console.error(
          `❌ Screen.show: Screen ID "#screen-${screenId}" NOT FOUND!`,
        );
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

        /* 
        // WYŁĄCZONE: Nie pokazuj systemowych powiadomień z pollingu (bo mamy OneSignal Push)
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
        */

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
        (n) => n.task_id == taskId && !n.is_read,
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
        state.unreadNotifications - related.length,
      );
      this.updateBadge();
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
      state.unreadNotifications = state.notifications.filter(
        (n) => !n.is_read,
      ).length; // Recalculate unread just in case
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
          navigator.clearAppBadge().catch(() => {});
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
        // Optymalizacja: nie rób nic jeśli karta jest nieaktywna
        if (document.hidden) return;

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
                      notif.title,
                    )}</div>
                    <div class="notification-message">${Utils.escapeHtml(
                      notif.message,
                    )}</div>
                    <div class="notification-time">${Utils.formatRelativeTime(
                      notif.created_at,
                    )}</div>
                </div>
                ${
                  notif.is_read
                    ? ""
                    : '<div class="notification-unread-dot"></div>'
                }
            </div>
        `,
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
              state.unreadNotifications - 1,
            );
            this.updateBadge();

            // Mark in state
            const notif = state.notifications.find((n) => n.id == id);
            if (notif) notif.is_read = 1;

            // Sync w tle (nie czekamy)
            API.markNotificationRead(id).catch(() => {});
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
        OneSignalService.requestPermission();
      });
      Utils.$("#admin-notifications-btn")?.addEventListener("click", () => {
        this.open();
        OneSignalService.requestPermission();
      });
      Utils.$("#mark-all-read-btn")?.addEventListener("click", () =>
        this.markAllRead(),
      );
      Utils.$("#delete-read-btn")?.addEventListener("click", () =>
        this.deleteRead(),
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
        ...Utils.$$(".dept-select"),
      ];

      selects.forEach((select) => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML =
          '<option value="">Dział...</option>' +
          state.departments
            .map(
              (dept) =>
                `<option value="${Utils.escapeHtml(
                  dept.name,
                )}">${Utils.escapeHtml(dept.name)}</option>`,
            )
            .join("");
        select.value = currentValue;
      });
    },

    updateDriverSelect() {
      const selects = [
        Utils.$("#task-assigned"),
        ...Utils.$$(".driver-select"),
      ];
      if (selects.length === 0) return;

      const drivers = state.users.filter((u) => u.role === "driver");

      selects.forEach((select) => {
        if (!select) return;
        const currentValue = select.value;
        const isGlobal = select.id === "task-assigned";

        select.innerHTML =
          `<option value="">${isGlobal ? "Dowolny kierowca" : "Dowolny..."}</option>` +
          drivers
            .map(
              (driver) =>
                `<option value="${driver.id}">${Utils.escapeHtml(
                  driver.name,
                )}</option>`,
            )
            .join("");

        select.value = currentValue;
      });
    },

    updateAll() {
      this.updateLocations();
      this.updateDepartmentSelects();
      this.updateDriverSelect();
    },
  };

  // =============================================
  // 17. MAP MANAGER - SMART ROUTING (DIJKSTRA)
  // =============================================
  const MapManager = {
    mode: "view", // 'view' | 'pick' | 'edit_network' | 'show_route'
    targetLocationId: null,
    tempCoords: null,
    panzoomInstance: null,
    isInitialized: false,
    lastOpenTime: 0, // iOS fix - throttle map opening

    // Dane sieci dróg
    nodes: [], // [{id, x, y}, ...]
    connections: [], // [{from, to}, ...]

    // Stan edycji
    selectedNodeId: null,

    // Stan trasy
    currentRoute: null, // [x, y, x, y...]

    ctx: null,

    init() {
      // Lazy initialization
    },

    async open(mode = "view", data = null) {
      // iOS Fix: Throttle - zapobiegaj wielokrotnym kliknięciom
      const now = Date.now();
      if (this.lastOpenTime && now - this.lastOpenTime < 500) {
        console.warn("⚠️ Map open throttled - too soon after last open");
        return;
      }
      this.lastOpenTime = now;

      if (this.isOpening) return; // Zapobiegaj podwójnym kliknięciom
      this.isOpening = true;

      console.group("🗺️ MapManager.open");
      console.log(`🚀 Mode: ${mode}`, data);

      // Reset stanu
      this.mode = mode;
      this.isInitialized = false;

      // Reset UI
      const titleEl = Utils.$("#modal-map h2");
      const saveBtn = Utils.$("#map-save-btn");
      const networkToolbar = Utils.$("#network-toolbar");
      if (networkToolbar) networkToolbar.classList.add("hidden");

      // Konfiguracja UI
      if (mode === "pick") {
        this.targetLocationId = data;
        if (titleEl)
          titleEl.textContent = "📍 Zaznacz lokalizację: Kliknij na mapie";
        Utils.show(saveBtn);
        if (saveBtn) saveBtn.disabled = true;
      } else if (mode === "edit_network") {
        if (titleEl) titleEl.textContent = "🔧 Edycja sieci dróg";
        Utils.hide(saveBtn);
      } else if (mode === "show_route") {
        const fromText = data?.from || "?";
        const toText = data?.to || "?";
        if (titleEl) titleEl.textContent = `📍 Trasa: ${fromText} ➔ ${toText}`;
        Utils.hide(saveBtn);

        if (this.calculateRoute && data) {
          setTimeout(() => this.calculateRoute(data.from, data.to), 500);
        }
      } else {
        if (titleEl) titleEl.textContent = "🗺️ Mapa Zakładu";
        Utils.hide(saveBtn);
      }

      this.showLoading();
      console.log("⏳ Opening modal...");
      Modal.open("modal-map");

      try {
        console.log("📡 Fetching road network...");
        const network = await API.getRoadNetwork();
        this.nodes = network.nodes || [];
        this.connections = network.connections || [];
        console.log(`✅ Road network loaded: ${this.nodes.length} nodes`);
      } catch (e) {
        console.error("❌ Road network error:", e);
      }

      console.log("⏳ Waiting for modal render (150ms)...");
      await new Promise((resolve) => setTimeout(resolve, 150));

      this.initializeMap();
      this.isOpening = false;
      console.groupEnd();
    },

    initializeMap() {
      console.group("🔧 MapManager.initializeMap");
      const wrapper = document.querySelector(".map-wrapper");
      const container = document.getElementById("map-container");
      const img = document.getElementById("facility-map");

      console.log("Elements:", { wrapper, container, img });

      if (!wrapper || !container || !img) {
        console.error("❌ CRITICAL: Missing DOM elements!");
        console.groupEnd();
        return;
      }

      this.hideLoading();

      // Toggle edit-mode class for cursor change
      if (this.mode === "edit_network") {
        wrapper.classList.add("edit-mode");
      } else {
        wrapper.classList.remove("edit-mode");
      }

      if (this.panzoomInstance) {
        console.log("♻️ Destroying old Panzoom instance");
        try {
          this.panzoomInstance.destroy();
        } catch (e) {}
      }

      // Android Fix: Cache-buster i pełna ścieżka
      const timestamp = Date.now();
      const rawSrc = img.getAttribute("data-src") || "img/mapa.webp";
      // Upewnij się że ścieżka nie ma podwójnego timestampu
      const baseSrc = rawSrc.split("?")[0];

      console.log("🔄 Preparing map image:", baseSrc);

      const initializeAfterLoad = () => {
        console.log(
          `✅ Image loaded: ${img.naturalWidth}x${img.naturalHeight}`,
        );

        if (!img.naturalWidth) {
          console.error("❌ Image loaded but width is 0!");
          return;
        }

        // A. PC FIX: Wymuś proporcje wrappera (żeby modal był wąski)
        // Jeśli aspect-ratio jest zdefiniowane, wrapper dopasuje szerokość do wysokości (90vh)
        const ratio = img.naturalWidth / img.naturalHeight;
        wrapper.style.aspectRatio = `${ratio}`;
        wrapper.style.height = "100%"; // Dopasuj do wysokości modala
        wrapper.style.width = "auto"; // Szerokość wyniknie z ratio

        // Wymuś przeliczenie layoutu modala
        container.style.display = "none";
        container.offsetHeight; // reflow
        container.style.display = "block";

        const waitForLayout = () => {
          const wrapperW = wrapper.clientWidth;
          const wrapperH = wrapper.clientHeight;

          if (wrapperW === 0 || wrapperH === 0) {
            console.log("⏳ Waiting for layout...");
            requestAnimationFrame(waitForLayout);
            return;
          }

          console.log(
            `📏 Wrapper Layout: ${wrapperW}x${wrapperH} (Ratio: ${wrapperW / wrapperH})`,
          );

          // 1. Native Size
          const containerW = img.naturalWidth;
          const containerH = img.naturalHeight;

          // 2. Fit Scale
          const scaleX = wrapperW / containerW;
          const scaleY = wrapperH / containerH;
          const fitScale = Math.min(scaleX, scaleY);

          // 3. Apply Styles
          container.style.width = containerW + "px";
          container.style.height = containerH + "px";
          container.style.transformOrigin = "0 0";

          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover"; // Cover na wszelki wypadek, ale przy 1:1 to to samo co fill

          // 4. Init Panzoom
          console.log(`🎯 Panzoom FitScale: ${fitScale.toFixed(5)}`);
          this.setupPanzoom(wrapper, container, img, fitScale);
        };

        requestAnimationFrame(waitForLayout);
      };

      // Zawsze przeładuj dla pewności (Android fix)
      img.onload = initializeAfterLoad;
      img.onerror = () => {
        console.error("❌ Map load error! Trying backup...");
        img.src = "img/mapa.webp?backup=" + timestamp;
      };
      img.src = `${baseSrc}?t=${timestamp}`;
    },

    setupPanzoom(wrapper, container, img, fitScale) {
      try {
        // Wykryj iOS dla specjalnych optymalizacji
        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari =
          /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        // Bezpieczny zoom: startujemy od widoku całości
        // Pozwalamy przybliżyć aż do 2x native resolution (bardzo blisko)

        this.panzoomInstance = Panzoom(container, {
          // MaxScale: Zwiększono do 10x (User request: "zoomować jeszcze bliżej")
          maxScale: 10.0,
          // MinScale: Pozwól oddalić do 80% widoku całości
          minScale: fitScale * 0.8,
          // Start: Fit scale - NATYCHMIASTOWY start bez animacji
          startScale: fitScale,
          startX: 0,
          startY: 0,

          contain: "outside",

          cursor: this.mode === "edit_network" ? "crosshair" : "grab",
          // ZMIANA: Wyłącz animację przy starcie żeby nie było skoku
          duration: 0, // Było 250 - to powodowało widoczny skok!
          easing: "ease-out",

          // KLUCZOWE DLA iOS: force2d prevents 3D transform artifacts
          // iOS Safari ma problemy z matrix3d - wymuszamy 2D transforms
          force2d: isIOS || isSafari,

          // Disable transform-origin changes dla lepszej jakości na iOS
          disablePan: false,
          disableZoom: false,

          // Exclude certain elements from panning (pins)
          excludeClass: "map-pin",
        });

        // USUNIĘTO setTimeout - nie potrzebujemy odświeżania, bo startScale działa od razu
        // Tylko iOS fix pozostaje ale bez delay
        if (isIOS) {
          // Wymuś repaint na iOS (bez delay)
          requestAnimationFrame(() => {
            container.style.transform = container.style.transform;
          });
        }

        wrapper.addEventListener("wheel", this.panzoomInstance.zoomWithWheel);

        // KLUCZOWE: Ustaw kursor dynamicznie
        this.updateCursor();

        // Logika skali dla CSS (Pinezek)
        const updateScaleVar = () => {
          const s = this.panzoomInstance.getScale();
          container.style.setProperty("--map-scale", s);
        };
        container.addEventListener("panzoomchange", updateScaleVar);
        setTimeout(updateScaleVar, 100);

        // Obsługa kliknięcia
        let pStartX = 0,
          pStartY = 0;

        container.addEventListener("pointerdown", (e) => {
          pStartX = e.clientX;
          pStartY = e.clientY;
        });

        container.addEventListener("pointerup", (e) => {
          const dist = Math.hypot(e.clientX - pStartX, e.clientY - pStartY);
          if (dist > 15) return;

          if (e.target.closest(".map-pin")) {
            e.stopPropagation();
            return;
          }
          this.onMapClick(e);
        });

        this.initCanvas(container, img);

        // RENDERUJ KONTROLKI I TOOLBAR!
        this.renderPins();
        this.renderControls();
        this.renderNetworkToolbar();
        this.draw();

        console.log(`✅ Panzoom ready! (iOS: ${isIOS}, force2d: ${isIOS || isSafari})`);
      } catch (err) {
        console.error("❌ Panzoom error:", err);
      }

      this.hideLoading();
      this.isInitialized = true;
      console.groupEnd();
    },

    // Alias dla draw (w razie gdyby gdzieś było wywoływane drawCanvas)
    drawCanvas() {
      this.draw();
    },

    initCanvas(container, img) {
      let canvas = container.querySelector("canvas.map-paths-layer");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "map-paths-layer";
        container.appendChild(canvas);
      }

      // HIGH-DPI / Retina support dla ostrej jakości
      const dpr = window.devicePixelRatio || 1;
      canvas.width = img.naturalWidth * dpr;
      canvas.height = img.naturalHeight * dpr;

      // Skaluj context dla retina
      this.ctx = canvas.getContext("2d");
      this.ctx.scale(dpr, dpr);

      // KLUCZOWE: Włącz wysoką jakość antyaliasingu dla ostrych linii
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high"; // 'low' | 'medium' | 'high'

      // CSS wymiary normalne (nie skalowane)
      canvas.style.width = img.naturalWidth + "px";
      canvas.style.height = img.naturalHeight + "px";

      console.log(
        `🎨 Canvas: ${canvas.width}x${canvas.height} (DPR: ${dpr}, Quality: high)`
      );
    },

    updateCursor() {
      const wrapper = document.querySelector(".map-wrapper");
      const container = document.getElementById("map-container");
      if (!wrapper || !container) return;

      if (this.mode === "edit_network") {
        wrapper.style.cursor = "crosshair";
        container.style.cursor = "crosshair";
      } else {
        wrapper.style.cursor = "grab";
        container.style.cursor = "grab";
      }
    },

    showLoading() {
      const wrapper = document.querySelector(".map-wrapper");
      if (wrapper) {
        wrapper.classList.add("loading");
        // Można dodać spinner przez CSS ::after
      }
    },

    hideLoading() {
      const wrapper = document.querySelector(".map-wrapper");
      if (wrapper) wrapper.classList.remove("loading");
    },

    // --- GŁÓWNA PĘTLA RYSOWANIA ---
    draw() {
      if (!this.ctx) return;
      const ctx = this.ctx;

      // HIGH-DPI / Retina support - używamy img.naturalWidth już po DPR skalowaniu
      const img = Utils.$("#facility-map");
      if (!img) return;

      const dpr = window.devicePixelRatio || 1;
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Wyczyść canvas - KLUCZOWE: używamy canvas.width/height (z DPR), NIE natural!
      // Canvas jest większy przez DPR, więc musimy clearować całą powierzchnię
      ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

      // Oblicz współczynnik skali (Inverse Scaling)
      // Żeby linie miały stałą grubość wizualną niezależnie od zoomu
      let scale = 1;
      if (this.panzoomInstance) {
        scale = this.panzoomInstance.getScale();
      }
      // Zabezpieczenie przed 0
      scale = Math.max(scale, 0.001);
      const sf = 1 / scale; // Scale Factor (np. dla scale=0.05, sf=20)

      // 1. Rysuj całą sieć dróg
      if (this.mode === "edit_network" || state.currentUser?.id === 1) {
        // Połączenia - CZARNE grube linie dla widoczności
        // Podstawowa grubość * DPR dla ostrości na Retina
        ctx.lineWidth = (this.mode === "edit_network" ? 10 : 6) * sf * dpr;
        ctx.strokeStyle =
          this.mode === "edit_network"
            ? "rgba(0, 0, 0, 0.9)"
            : "rgba(0, 0, 0, 0.5)";

        this.connections.forEach((conn) => {
          const n1 = this.nodes.find((n) => n.id === conn.from);
          const n2 = this.nodes.find((n) => n.id === conn.to);
          if (n1 && n2) {
            ctx.beginPath();
            ctx.moveTo((n1.x * w) / 100, (n1.y * h) / 100);
            ctx.lineTo((n2.x * w) / 100, (n2.y * h) / 100);
            ctx.stroke();
          }
        });

        // Węzły (tylko w trybie edycji) - DUŻE z wyraźną obwódką
        if (this.mode === "edit_network") {
          this.nodes.forEach((node) => {
            const x = (node.x * w) / 100;
            const y = (node.y * h) / 100;
            ctx.beginPath();
            ctx.arc(x, y, 20 * sf * dpr, 0, Math.PI * 2); // DPR skalowanie
            ctx.fillStyle =
              node.id === this.selectedNodeId ? "#00FF00" : "#007AFF";
            ctx.fill();
            ctx.lineWidth = 4 * sf * dpr; // Gruba obwódka z DPR
            ctx.strokeStyle = "#000"; // CZARNA obwódka
            ctx.stroke();
          });
        }
      }

      // 2. Rysuj wyznaczoną trasę (jeśli jest)
      if (this.currentRoute && this.currentRoute.length > 0) {
        // Glow - dodajemy DPR dla ostrości
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.lineWidth = 15 * sf * dpr;
        ctx.strokeStyle = "rgba(0, 122, 255, 0.3)";
        this.drawPolyline(this.currentRoute, w, h);
        ctx.stroke();

        // Solid line
        ctx.beginPath();
        ctx.lineWidth = 5 * sf * dpr;
        ctx.strokeStyle = "#007AFF";
        ctx.setLineDash([10 * sf * dpr, 10 * sf * dpr]); // Dash też z DPR
        this.drawPolyline(this.currentRoute, w, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },

    drawPolyline(points, w, h) {
      if (points.length < 2) return;
      this.ctx.moveTo((points[0].x * w) / 100, (points[0].y * h) / 100);
      for (let i = 1; i < points.length; i++) {
        this.ctx.lineTo((points[i].x * w) / 100, (points[i].y * h) / 100);
      }
    },

    // --- OBSŁUGA EDYCJI SIECI ---
    onMapClick(e) {
      if (this.mode === "pick") {
        // ... (stara logika pick - bez zmian) ...
        this.handlePickClick(e);
        return;
      }

      if (this.mode !== "edit_network") return;

      const img = Utils.$("#facility-map");
      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Sprawdź czy kliknięto w istniejący węzeł (z tolerancją)
      // Tolerancja np. 2% szerokości mapy
      const tolerance = 2;
      const clickedNode = this.nodes.find(
        (n) =>
          Math.abs(n.x - x) < tolerance &&
          Math.abs(n.y - y) < tolerance * (rect.width / rect.height),
      );

      if (clickedNode) {
        // Kliknięto w węzeł
        if (this.selectedNodeId === null) {
          // Zaznacz pierwszy
          this.selectedNodeId = clickedNode.id;
        } else if (this.selectedNodeId === clickedNode.id) {
          // Odznacz
          this.selectedNodeId = null;
        } else {
          // Połącz dwa węzły
          this.toggleConnection(this.selectedNodeId, clickedNode.id);
          this.selectedNodeId = clickedNode.id; // Przeskocz na nowy (łańcuchowe rysowanie)
        }
      } else {
        // Kliknięto w puste miejsce -> Dodaj nowy węzeł
        const newNodeId = Date.now();
        this.nodes.push({ id: newNodeId, x, y });

        // Jeśli coś było zaznaczone, połącz z nowym
        if (this.selectedNodeId) {
          this.toggleConnection(this.selectedNodeId, newNodeId);
        }
        this.selectedNodeId = newNodeId;
      }

      this.draw();
    },

    toggleConnection(id1, id2) {
      const existsIdx = this.connections.findIndex(
        (c) =>
          (c.from === id1 && c.to === id2) || (c.from === id2 && c.to === id1),
      );

      if (existsIdx >= 0) {
        // Rozłącz jeśli już połączone (opcjonalne, może lepiej nie usuwać przy przypadkowym kliku)
        // this.connections.splice(existsIdx, 1);
      } else {
        this.connections.push({ from: id1, to: id2 });
      }
    },

    async saveNetwork() {
      try {
        await API.saveRoadNetwork({
          nodes: this.nodes,
          connections: this.connections,
        });
        Toast.success("Sieć dróg zapisana!");
        this.mode = "view";
        this.renderNetworkToolbar();
        this.draw();
      } catch (e) {
        Toast.error("Błąd zapisu");
      }
    },

    clearNetwork() {
      if (confirm("Czy na pewno usunąć całą sieć dróg?")) {
        this.nodes = [];
        this.connections = [];
        this.draw();
      }
    },

    // --- ALGORYTM DIJKSTRA ---
    calculateRoute(startName, endName) {
      const allLocs = [...state.locations, ...state.departments];
      const startLoc = allLocs.find((l) => l.name === startName);
      const endLoc = allLocs.find((l) => l.name === endName);

      if (!startLoc?.map_x || !endLoc?.map_x) {
        Toast.warning("Brak współrzędnych dla lokalizacji");
        return;
      }

      // 1. Znajdź najbliższe węzły sieci dla startu i końca
      const startNode = this.findNearestNode(startLoc.map_x, startLoc.map_y);
      const endNode = this.findNearestNode(endLoc.map_x, endLoc.map_y);

      if (!startNode || !endNode) {
        // Brak sieci? Rysuj linię prostą
        this.currentRoute = [
          { x: startLoc.map_x, y: startLoc.map_y },
          { x: endLoc.map_x, y: endLoc.map_y },
        ];
        return;
      }

      // 2. Dijkstra
      const path = this.findPath(startNode.id, endNode.id);

      if (path) {
        // Zbuduj trasę: Start -> NearestNode -> ... Path ... -> NearestNode -> End
        this.currentRoute = [
          { x: startLoc.map_x, y: startLoc.map_y },
          ...path.map((id) => this.nodes.find((n) => n.id === id)),
          { x: endLoc.map_x, y: endLoc.map_y },
        ];
      } else {
        // Nie znaleziono drogi - linia prosta
        this.currentRoute = [
          { x: startLoc.map_x, y: startLoc.map_y },
          { x: endLoc.map_x, y: endLoc.map_y },
        ];
      }
    },

    findNearestNode(x, y) {
      let nearest = null;
      let minDist = Infinity;

      this.nodes.forEach((node) => {
        const dist = Math.sqrt(
          Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2),
        );
        if (dist < minDist) {
          minDist = dist;
          nearest = node;
        }
      });

      // Jeśli najbliższy węzeł jest za daleko (np. > 20% mapy), uznajemy że nie ma połączenia
      return minDist < 20 ? nearest : null;
    },

    findPath(startId, endId) {
      const distances = {};
      const previous = {};
      const queue = new Set(this.nodes.map((n) => n.id));

      this.nodes.forEach((n) => (distances[n.id] = Infinity));
      distances[startId] = 0;

      while (queue.size > 0) {
        // Znajdź węzeł z najmniejszym dystansem
        let u = null;
        let min = Infinity;
        for (const id of queue) {
          if (distances[id] < min) {
            min = distances[id];
            u = id;
          }
        }

        if (u === null || u === endId) break;
        queue.delete(u);

        // Sąsiedzi
        const neighbors = this.connections
          .filter((c) => c.from === u || c.to === u)
          .map((c) => (c.from === u ? c.to : c.from));

        for (const v of neighbors) {
          if (!queue.has(v)) continue;

          const uNode = this.nodes.find((n) => n.id === u);
          const vNode = this.nodes.find((n) => n.id === v);
          const dist = Math.sqrt(
            Math.pow(uNode.x - vNode.x, 2) + Math.pow(uNode.y - vNode.y, 2),
          );

          const alt = distances[u] + dist;
          if (alt < distances[v]) {
            distances[v] = alt;
            previous[v] = u;
          }
        }
      }

      if (distances[endId] === Infinity) return null;

      const path = [];
      let curr = endId;
      while (curr !== undefined) {
        path.unshift(curr);
        curr = previous[curr];
      }
      return path;
    },

    // --- UI TOOLS ---
    renderNetworkToolbar() {
      const wrapper = Utils.$(".map-wrapper");
      let toolbar = wrapper.querySelector("#network-toolbar");
      if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.id = "network-toolbar";
        toolbar.className = "map-draw-toolbar"; // Użyj tej samej klasy co wcześniej
        wrapper.appendChild(toolbar);
      }

      // Pokaż tylko jeśli admin ID 1
      if (state.currentUser?.id !== 1) {
        toolbar.classList.add("hidden");
        return;
      }

      // Pokaż tylko w trybie view/edit
      if (this.mode === "pick" || this.mode === "show_route") {
        toolbar.classList.add("hidden");
        return;
      }

      toolbar.classList.remove("hidden");

      if (this.mode === "view") {
        toolbar.innerHTML = `
                <button class="btn btn-primary btn-small" onclick="TransportTracker.MapManager.setEditMode(true)">
                    🔧 Edytuj sieć dróg
                </button>
            `;
      } else {
        toolbar.innerHTML = `
                <button class="btn btn-success btn-small" onclick="TransportTracker.MapManager.saveNetwork()">
                    💾 Zapisz
                </button>
                <button class="btn btn-danger btn-small" onclick="TransportTracker.MapManager.clearNetwork()">
                    🗑️ Wyczyść
                </button>
                <button class="btn btn-secondary btn-small" onclick="TransportTracker.MapManager.setEditMode(false)">
                    ❌ Anuluj
                </button>
            `;
      }
    },

    setEditMode(enable) {
      this.mode = enable ? "edit_network" : "view";
      this.selectedNodeId = null;

      // Toggle edit-mode class for cursor
      const wrapper = document.querySelector(".map-wrapper");
      if (enable) {
        wrapper?.classList.add("edit-mode");
      } else {
        wrapper?.classList.remove("edit-mode");
      }

      // KLUCZOWE: Zastosuj kursor
      this.updateCursor();

      this.renderNetworkToolbar();
      this.draw();
      if (enable)
        Toast.info("Klikaj na mapie aby dodawać punkty i łączyć je ścieżkami.");
    },

    // Legacy pick handler
    handlePickClick(e) {
      const img = Utils.$("#facility-map");
      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      this.tempCoords = { x, y };
      const oldTemp = Utils.$("#temp-pin");
      if (oldTemp) oldTemp.remove();

      const container = Utils.$("#map-container");
      const pin = document.createElement("div");
      pin.className = "map-pin pin-temp";
      pin.id = "temp-pin";
      pin.style.left = `${x}%`;
      pin.style.top = `${y}%`;
      pin.innerHTML = `<div class="pin-icon-wrapper" style="background:var(--success)"><span>📍</span></div>`;
      container.appendChild(pin);

      Utils.$("#map-save-btn").disabled = false;
    },

    // Potrzebne dla przycisków HTML onclick
    savePickedLocation() {
      if (AdminPanel.onMapPick && this.tempCoords) {
        AdminPanel.onMapPick(this.tempCoords);
        Modal.close("modal-map");
      }
    },

    // Helpers
    showLoading() {
      Utils.show(".map-loading-overlay");
    },
    hideLoading() {
      Utils.hide(".map-loading-overlay");
    },
    renderPins() {
      /* (Kod renderowania pinezek - taki sam jak był) */ this.renderPinsLogic();
    },
    renderControls() {
      /* (Kod kontrolek - taki sam jak był) */ this.renderControlsLogic();
    },

    // Extracted logic to keep code clean
    renderPinsLogic() {
      Utils.$$(".map-pin:not(#temp-pin)").forEach((el) => el.remove());
      const container = Utils.$("#map-container");
      [...state.locations, ...state.departments].forEach((loc) => {
        if (loc.map_x != null) {
          const pin = document.createElement("div");
          pin.className = `map-pin ${loc.type === "department" ? "pin-dept" : "pin-loc"}`;
          pin.style.left = `${loc.map_x}%`;
          pin.style.top = `${loc.map_y}%`;
          pin.innerHTML = `<div class="pin-icon-wrapper"><span>${loc.type === "department" ? "🏢" : "📍"}</span></div><div class="pin-label">${loc.name}</div>`;
          container.appendChild(pin);
        }
      });
    },

    renderControlsLogic() {
      const wrapper = Utils.$(".map-wrapper");
      if (wrapper.querySelector(".map-controls")) return;
      const c = document.createElement("div");
      c.className = "map-controls";
      c.innerHTML = `
            <button class="btn-icon" onclick="TransportTracker.MapManager.panzoomInstance.zoomIn()">+</button>
            <button class="btn-icon" onclick="TransportTracker.MapManager.panzoomInstance.zoomOut()">-</button>
            <button class="btn-icon" onclick="TransportTracker.MapManager.panzoomInstance.reset()">⟲</button>
        `;
      wrapper.appendChild(c);
    },
  };
  // =============================================
  // 11. AUTH
  // =============================================
  const Auth = {
    async init() {
      // 1. Ładowanie CACHE (Optymistyczny start)
      try {
        const cachedUsers = localStorage.getItem(CONFIG.STORAGE_KEYS.USERS);
        const cachedLocs = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCATIONS);
        const cachedDepts = localStorage.getItem(
          CONFIG.STORAGE_KEYS.DEPARTMENTS,
        );
        const cachedTasks = localStorage.getItem(CONFIG.STORAGE_KEYS.TASKS);

        if (cachedUsers) state.users = JSON.parse(cachedUsers);
        if (cachedLocs) state.locations = JSON.parse(cachedLocs);
        if (cachedDepts) state.departments = JSON.parse(cachedDepts);
        if (cachedTasks) state.taskCache = JSON.parse(cachedTasks);
      } catch (e) {
        console.warn("Błąd ładowania cache:", e);
      }

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
          JSON.stringify(state.currentUser),
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
      try {
        Utils.$("#login-form")?.reset();

        if (state.currentUser.force_pin_change) {
          this.showChangePinModal();
          return;
        }

        // 1. Ładowanie danych wspólnych (lokalizacje, działy)
        await this.loadCommonData();

        // 2. Inicjalizacja UI (ustawienie nazw, dat) - BEZ przełączania ekranu jeszcze
        const role = state.currentUser.role;
        if (role === "admin") {
          this.setupAdminUI();
        } else {
          this.setupDriverUI();
        }

        // 3. Pobieranie ŚWIEŻEJ listy zadań przed pokazaniem aplikacji
        // Robimy to z timeoutem, żeby nie blokować usera w razie problemów z siecią
        const loadPromise =
          role === "admin"
            ? AdminPanel.loadTasks(false)
            : DriverPanel.loadTasks(false);

        const timeoutPromise = new Promise((resolve) =>
          setTimeout(resolve, 3000),
        );

        console.log("⏳ Syncing initial data...");
        await Promise.race([loadPromise, timeoutPromise]).catch((e) =>
          console.warn("Initial sync error:", e),
        );

        // 4. Dopiero teraz przechodzimy do głównego ekranu
        Screen.show(role);

        // 5. Inicjalizacja usług tła
        Notifications.startPolling();

        // OneSignal - inicjalizuj SDK (nie blokuje UI)
        OneSignalService.init()
          .then(() => {
            setTimeout(async () => {
              const hasPermission = await OneSignalService.requestPermission();
              if (hasPermission && state.currentUser) {
                await OneSignalService.login(
                  state.currentUser.id,
                  state.currentUser.role,
                );
              }
            }, 2000);
          })
          .catch((err) => {});
      } catch (error) {
        console.error("FATAL: onLoginSuccess failed", error);
        // Fallback: show the screen anyway to not stay stuck
        if (state.currentUser?.role) Screen.show(state.currentUser.role);
      }
    },

    setupAdminUI() {
      Utils.$("#admin-user-name").textContent = state.currentUser.name;
      state.currentDate = Utils.getToday();
      Utils.$("#admin-date-picker").value = state.currentDate;

      // Ukryj zakładki bez uprawnień
      const user = state.currentUser;
      const tabReports = document.querySelector('[data-tab="reports"]');
      const tabUsers = document.querySelector('[data-tab="users"]');
      const tabLocations = document.querySelector('[data-tab="locations"]');

      if (tabReports)
        tabReports.classList.toggle(
          "hidden",
          user.id !== 1 && !user.perm_reports,
        );
      if (tabUsers)
        tabUsers.classList.toggle("hidden", user.id !== 1 && !user.perm_users);
      if (tabLocations)
        tabLocations.classList.toggle(
          "hidden",
          user.id !== 1 && !user.perm_locations,
        );

      AdminPanel.switchTab("tasks");
      AdminPanel.loadUsers();
      AdminPanel.loadLocations();
      AdminPanel.updateDateButtons();
      AdminPanel.loadReports("week");
      AdminPanel.initLocationListeners();

      // MAP BUTTON
      Utils.$("#admin-map-btn")?.addEventListener("click", () =>
        MapManager.open("view"),
      );
    },

    setupDriverUI() {
      Utils.$("#driver-user-name").textContent = state.currentUser.name;
      state.currentDate = Utils.getToday();
      Utils.$("#driver-date-text").textContent = Utils.formatDate(
        state.currentDate,
      );

      // MAP BUTTON
      Utils.$("#driver-map-btn")?.addEventListener("click", () =>
        MapManager.open("view"),
      );

      console.log("🚀 Driver UI prepared for:", state.currentUser.name);
    },

    // Legacy support or direct init if needed (though onLoginSuccess is preferred now)
    initAdminPanel() {
      this.setupAdminUI();
      Screen.show("admin");
      AdminPanel.loadTasks();
    },

    initDriverPanel() {
      this.setupDriverUI();
      Screen.show("driver");
      DriverPanel.loadTasks();
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
            JSON.stringify(state.currentUser),
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

        // Update Cache
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.LOCATIONS,
          JSON.stringify(state.locations),
        );
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.DEPARTMENTS,
          JSON.stringify(state.departments),
        );
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.USERS,
          JSON.stringify(state.users),
        );

        DataLists.updateAll();
      } catch (error) {
        console.error("Failed to load common data:", error);
      }
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
          false,
        );
      }
    },

    initEventListeners() {
      Utils.$("#login-form")?.addEventListener("submit", (e) =>
        this.handleLogin(e),
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
        this.logout(),
      );
      Utils.$("#admin-logout-btn")?.addEventListener("click", () =>
        this.logout(),
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
      const list = Utils.$("#driver-tasks-list");

      // 1. POKAŻ CACHE NATYCHMIAST (SWR)
      if (state.taskCache[targetDate]) {
        state.tasks = state.taskCache[targetDate];
        this.renderTasks();
        this.updateStats(); // Dodano: przelicz statystyki przy ładowaniu z cache
      } else if (!silent && list) {
        // Jeśli nie ma w cache i nie jest to ciche odświeżanie - pokaż loader
        list.innerHTML = Utils.getLoaderHtml();
      }

      try {
        // 2. Pobieramy świeże dane w tle (BEZ userId - chcemy wszystkie dla statystyk)
        const freshTasks = await API.getTasks({
          date: targetDate,
        });

        // 3. Sprawdzamy czy coś się zmieniło
        const hasChanged =
          JSON.stringify(freshTasks) !==
          JSON.stringify(state.taskCache[targetDate]);

        // Zapisz do cache
        state.taskCache[targetDate] = freshTasks;

        // Persist Cache
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.TASKS,
          JSON.stringify(state.taskCache),
        );

        // Jeśli dane się zmieniły ALBO nie było ich wcześniej - odśwież UI
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
          Toast.error("Błąd połączenia");
        }
      }
    },

    async prefetchNeighboringDates() {
      if (!state.currentUser) return;
      const yesterday = Utils.addDays(state.currentDate, -1);
      const tomorrow = Utils.addDays(state.currentDate, 1);

      [yesterday, tomorrow].forEach(async (date) => {
        if (!state.taskCache[date]) {
          try {
            const tasks = await API.getTasks({
              date,
            });
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

        // 2. W trakcie ZAWSZE na górze
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;

        // Smart Suggestions Logic - oparte na bliskości geograficznej
        const lastLoc = localStorage.getItem("last_known_location");
        const lastX = parseFloat(localStorage.getItem("last_known_x"));
        const lastY = parseFloat(localStorage.getItem("last_known_y"));

        let isASugg = false;
        let isBSugg = false;

        if (lastLoc && a.status === "pending" && a.location_from) {
          // Sprawdź dokładne dopasowanie LUB bliskość na mapie
          if (a.location_from === lastLoc) {
            isASugg = true;
          } else if (!isNaN(lastX) && !isNaN(lastY)) {
            isASugg = Utils.isNearby(a.location_from, lastLoc);
          }
        }

        if (lastLoc && b.status === "pending" && b.location_from) {
          if (b.location_from === lastLoc) {
            isBSugg = true;
          } else if (!isNaN(lastX) && !isNaN(lastY)) {
            isBSugg = Utils.isNearby(b.location_from, lastLoc);
          }
        }

        // Priority Scores
        const pScore = { high: 300, normal: 200, low: 100 };

        let scoreA = pScore[a.priority] || 200;
        let scoreB = pScore[b.priority] || 200;

        // Boost for suggestions (but don't override higher priority tier unless desired)
        // User Rule: "High first... then suggest normal... then suggest low"
        // So: High (300) > Sug-Normal (200+50) > Normal (200) > Sug-Low (100+50) > Low (100)
        if (isASugg) scoreA += 50;
        if (isBSugg) scoreB += 50;

        // 3. Compare Scores
        if (scoreA !== scoreB) return scoreB - scoreA; // Descending

        // 4. Fallback: Sort Order & Time
        const orderDiff = a.sort_order - b.sort_order;
        if (orderDiff !== 0) return orderDiff;
        return a.scheduled_time.localeCompare(b.scheduled_time);
      });
    },

    updateStats() {
      // Helper to safely parse booleans (0, 1, "0", "1", true, false)
      const isTrue = (v) => v === 1 || v === "1" || v === true || v === "true";

      const getEffectiveStatus = (t) => {
        if (isTrue(t.has_completed)) return "completed";
        if (isTrue(t.has_paused)) return "paused";
        return t.status;
      };

      // GLOBALNE STATYSTYKI (Bez filtrowania po użytkowniku)
      const pending = state.tasks.filter((t) => {
        const effStatus = getEffectiveStatus(t);
        // Oczekujące + Wstrzymane = Licznik "Oczekuje"
        return effStatus === "pending" || effStatus === "paused";
      }).length;

      const inProgress = state.tasks.filter((t) => {
        return getEffectiveStatus(t) === "in_progress";
      }).length;

      const completed = state.tasks.filter((t) => {
        return getEffectiveStatus(t) === "completed";
      }).length;

      // Update UI
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
      if (task.location_from || task.location_to) {
        taskDescription += `
                    <div class="task-route">
                        <span>📍 ${Utils.escapeHtml(
                          task.location_from || "?",
                        )}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(
                          task.location_to || "?",
                        )}</span>
                    </div>
                `;
      }

      if (task.department) {
        taskDescription += `
                    <div class="task-department">
                        <span>🏢</span>
                        <span>${Utils.escapeHtml(task.department)}</span>
                    </div>
                `;
      }

      // Display departments from containers if present
      if (task.containers) {
        try {
          const containers = JSON.parse(task.containers);
          const depts = [
            ...new Set(containers.map((c) => c.department).filter((d) => d)),
          ];
          if (
            depts.length > 0 &&
            (!task.department || !depts.includes(task.department))
          ) {
            taskDescription += `
                    <div class="task-department">
                        <span>🏢</span>
                        <span style="font-weight: 500;">${depts.map((d) => Utils.escapeHtml(d)).join(", ")}</span>
                    </div>
                  `;
          }
        } catch (e) {}
      }

      const containerSummary = task.containers
        ? (() => {
            try {
              const containers = JSON.parse(task.containers);
              if (containers.length > 0) {
                return `
                    <div class="task-material" style="color: var(--primary); font-weight: 600;">
                        <span>📦</span>
                        <span>Kontenery: ${containers.length} szt.</span>
                    </div>
                  `;
              }
            } catch (e) {}
            return "";
          })()
        : "";

      const materialHtml =
        task.material && !task.containers
          ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
          : containerSummary;

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
                      driversList,
                    )}">
                        <span>${icon}</span>
                        <span>${Utils.escapeHtml(driversList)}</span>
                        ${
                          label
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

      // SMART SUGGESTION CHECK - oparte na bliskości geograficznej
      const lastLoc = localStorage.getItem("last_known_location");
      let isSuggested = false;

      if (task.status === "pending" && task.location_from && lastLoc) {
        // Dokładne dopasowanie
        if (task.location_from === lastLoc) {
          isSuggested = true;
        } else {
          // Sprawdź bliskość na mapie
          isSuggested = Utils.isNearby(task.location_from, lastLoc);
        }
      }
      const suggestionClass = isSuggested ? "suggestion-ring" : "";

      return `
                <div class="task-card priority-${task.priority} status-${
                  task.status
                } ${isLocked ? "task-locked" : ""} ${suggestionClass}" 
                     data-id="${task.id}">
                    <div class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(
                          task.status,
                        )} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-type-badge type-${
                              task.task_type
                            }">
                                ${Utils.getTaskTypeIcon(
                                  task.task_type,
                                )} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${
                              task.priority
                            }">
                                ${Utils.getPriorityIcon(
                                  task.priority,
                                )} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                        <div class="task-creator-info" style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">
                            ${
                              task.creator_name
                                ? `Zlecił: <strong>${Utils.escapeHtml(
                                    task.creator_name,
                                  )}</strong>`
                                : ""
                            }
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${
                      task.id
                    }">
                        <div class="task-title">${Utils.escapeHtml(
                          task.description,
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
                                      task.scheduled_time,
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
        },
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

                // SAVE LAST LOCATION for Smart Suggestions
                let lastLocationName = null;
                if (task.location_to) {
                  lastLocationName = task.location_to;
                } else if (task.department) {
                  lastLocationName = task.department;
                }

                if (lastLocationName) {
                  localStorage.setItem("last_known_location", lastLocationName);

                  // Zapisz też współrzędne dla lepszych sugestii
                  const allLocations = [
                    ...state.locations,
                    ...state.departments,
                  ];
                  const loc = allLocations.find(
                    (l) => l.name === lastLocationName,
                  );
                  if (loc?.map_x && loc?.map_y) {
                    localStorage.setItem("last_known_x", loc.map_x);
                    localStorage.setItem("last_known_y", loc.map_y);
                  }
                }
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              Toast.success("Zadanie oznaczone jako zakończone! 🎉");
            },
          )
            .then(() => {
              // Po faktycznym zakończeniu sync, możemy odświeżyć żeby sprawdzić "partial"
              this.loadTasks(true);
            })
            .finally(() => {
              this._completingTask = false;
            });
        },
        "Zakończ",
        false,
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
            },
          );
        },
        "Wstrzymaj",
        false,
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
        },
      );
    },

    openJoinModal(taskId) {
      const task = state.tasks.find((t) => t.id == taskId);
      Utils.$("#join-task-id").value = taskId;
      Utils.$("#join-task-message").textContent =
        `Czy chcesz dołączyć do zadania "${
          task?.description || ""
        }" i pomagać przy jego realizacji?`;
      Modal.open("modal-join-task");
    },

    async joinTask() {
      const taskId = Utils.$("#join-task-id").value;
      Notifications.markRelatedRead(taskId);
      Modal.close("modal-join-task");

      Sync.enqueue("joinTask", { taskId, userId: state.currentUser.id }, () => {
        Toast.success("Dołączyłeś do zadania! 👥");
      }).then(() => {
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
        'input[name="log-type"]:checked',
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
      Sync.enqueue("createTaskLog", { taskId, logData }, () => {
        // Możemy tu dodać optymistyczne dodanie logu do state.tasks[id].logs jeśli chcemy
      }).then(() => {
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
      const isJoined =
        task.additional_drivers &&
        task.additional_drivers.some((d) => d.id === state.currentUser.id);
      const isParticipating = isMyTask || isJoined;

      let locationInfo = "";

      // Dla wszystkich typów zadań - pokaż dział jeśli istnieje
      if (task.department) {
        locationInfo += `
          <div class="task-detail-row">
            <span class="task-detail-label">Dział</span>
            <span class="task-detail-value">🏢 ${Utils.escapeHtml(task.department)}</span>
          </div>
        `;
      }

      // Pokaż skąd/dokąd jeśli istnieją (dla transport i other)
      if (task.location_from) {
        locationInfo += `
          <div class="task-detail-row">
            <span class="task-detail-label">Skąd</span>
            <span class="task-detail-value">📍 ${Utils.escapeHtml(task.location_from)}</span>
          </div>
        `;
      }

      if (task.location_to) {
        locationInfo += `
          <div class="task-detail-row">
            <span class="task-detail-label">Dokąd</span>
            <span class="task-detail-value">📍 ${Utils.escapeHtml(task.location_to)}</span>
          </div>
        `;
      }

      // MAP BUTTON - Wąski, wyśrodkowany przycisk podglądu trasy
      // Określ punkty startowy i końcowy w zależności od typu zadania
      let routeFrom = null;
      let routeTo = null;
      const PARKING_TIR = "Parking TIR"; // Centralny punkt dla rozładunku/załadunku

      if (task.location_from && task.location_to) {
        // Transport lub Inne zadanie z lokalizacjami
        routeFrom = task.location_from;
        routeTo = task.location_to;
      } else if (task.task_type === "unloading" && task.department) {
        // Rozładunek: Parking TIR → Dział
        routeFrom = PARKING_TIR;
        routeTo = task.department;
      } else if (task.task_type === "loading" && task.department) {
        // Załadunek: Dział → Parking TIR
        routeFrom = task.department;
        routeTo = PARKING_TIR;
      } else if (task.department && !task.location_from && !task.location_to) {
        // Inne zadanie tylko z działem: Parking TIR → Dział
        routeFrom = PARKING_TIR;
        routeTo = task.department;
      }

      // Pokaż przycisk jeśli mamy trasę do pokazania
      if (routeFrom && routeTo) {
        locationInfo += `
          <div style="text-align: center; margin: 15px 0;">
            <button class="btn btn-secondary" 
                    style="padding: 8px 20px; font-size: 14px; max-width: 200px; width: auto; display: inline-block;"
                    onclick="TransportTracker.MapManager.open('show_route', { from: '${Utils.escapeHtml(routeFrom)}', to: '${Utils.escapeHtml(routeTo)}' })">
              🗺️ Pokaż trasę
            </button>
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
                                  log.log_type,
                                )}</span>
                                <div class="task-log-content">
                                    <div class="task-log-message">
                                        ${
                                          log.log_type === "delay"
                                            ? `<strong>${Utils.getDelayReasonLabel(
                                                log.delay_reason,
                                              )}</strong> (${
                                                log.delay_minutes || 0
                                              } min)<br>`
                                            : ""
                                        }
                                        ${Utils.escapeHtml(log.message || "")}
                                    </div>
                                                                        <div class="task-log-meta">
                                        ${Utils.escapeHtml(
                                          log.user_name || "Nieznany",
                                        )} • ${Utils.formatTime(log.created_at)}
                                    </div>
                                </div>
                            </div>
                        `,
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
        } else if (
          task.status === "in_progress" &&
          (task.has_completed || !isParticipating)
        ) {
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
                          task.task_type,
                        )} ${Utils.getTaskTypeLabel(task.task_type)}
                    </span>
                    <span class="task-priority-badge priority-${task.priority}">
                        ${Utils.getPriorityIcon(
                          task.priority,
                        )} ${Utils.getPriorityLabel(task.priority)}
                    </span>
                    <span class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(
                          task.status,
                        )} ${Utils.getStatusLabel(task.status)}
                    </span>
                </div>
                
                <h3 class="task-detail-title">${Utils.escapeHtml(
                  task.description,
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
                              task.material,
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                    <div class="task-detail-row">
                        <span class="task-detail-label">Data</span>
                        <span class="task-detail-value">📅 ${Utils.formatDate(
                          task.scheduled_date,
                        )}</span>
                    </div>
                    ${
                      task.scheduled_time
                        ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Godzina</span>
                            <span class="task-detail-value">🕐 ${Utils.formatTime(
                              task.scheduled_time,
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
                              task.assigned_name,
                            )}</span>
                        </div>
                    `
                        : ""
                    }
                    <div class="task-detail-row">
                        <span class="task-detail-label">Zlecił</span>
                        <span class="task-detail-value">👔 ${Utils.escapeHtml(
                          task.creator_name || "System",
                        )}</span>
                    </div>
                </div>
                
                ${
                  task.notes
                    ? `
                    <div class="task-detail-section">
                        <h4>Uwagi dla kierowców</h4>
                        <div class="task-notes-preview">
                            <span>💬</span>
                            <span>${Utils.escapeHtml(task.notes)}</span>
                        </div>
                    </div>
                `
                    : ""
                }
                
                ${logsHtml}
                
                ${
                  task.containers && JSON.parse(task.containers).length > 0
                    ? `
                    <div class="task-detail-section" style="margin-bottom: 25px;">
                        <h4>📦 Kontenery / Części (${JSON.parse(task.containers).length})</h4>
                        <div class="containers-list-detail" style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 12px;">
                            ${JSON.parse(task.containers)
                              .map(
                                (c, i) => `
                                <div class="container-item-detail" style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--border-radius-lg); border: 1px solid var(--border-color);">
                                    <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">
                                        Kontener ${i + 1}
                                    </div>
                                    <div style="font-weight: 600; font-size: 15px; color: var(--text-primary); margin-bottom: 8px;">
                                        ${Utils.escapeHtml(c.content)}
                                    </div>
                                    <div style="display: flex; gap: 15px; font-size: 13px; color: var(--text-secondary);">
                                        <span style="display: flex; align-items: center; gap: 5px;">🏢 ${Utils.escapeHtml(c.department || "Brak działu")}</span>
                                        <span style="display: flex; align-items: center; gap: 5px;">👤 ${Utils.escapeHtml(c.driverName || "Dowolny kierowca")}</span>
                                    </div>
                                </div>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                `
                    : ""
                }

                <div style="margin-top: 30px;">
                    ${actionsHtml}
                </div>
            `;
    },

    openMapForTask(taskId) {
      Modal.close("modal-task-detail");
      API.getTask(taskId).then((task) => {
        MapManager.mode = "view_task";
        MapManager.currentTask = task;

        Modal.open("modal-map");
        MapManager.initPanzoom();

        setTimeout(() => {
          if (task.location_from) {
            const l = [...state.locations, ...state.departments].find(
              (x) => x.name === task.location_from,
            );
            if (l && MapManager.focusOnLocation)
              MapManager.focusOnLocation(l.id);
          }
        }, 500);
      });
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
        this.handleLogSubmit(e),
      );

      // Log type change
      Utils.$$('input[name="log-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          this.toggleLogFields(radio.value);
        });
      });

      // Join task
      Utils.$("#join-task-confirm-btn")?.addEventListener("click", () =>
        this.joinTask(),
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
      this.initContainers([]); // Reset containers
      this.setMode("full", "unloading");
      this.setMode("full", "loading");

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
        `input[name="task-type"][value="${task.task_type}"]`,
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
        `input[name="task-priority"][value="${task.priority}"]`,
      );
      if (priorityRadio) priorityRadio.checked = true;

      // Populate containers
      if (task.containers) {
        try {
          const containers = JSON.parse(task.containers);
          if (
            containers.length > 0 &&
            (task.task_type === "unloading" || task.task_type === "loading")
          ) {
            this.setMode("containers", task.task_type);
            this.populateOrganismContainers(
              containers,
              task.task_type,
              task.material,
            );
          } else {
            this.setMode("full", task.task_type);
            this.initContainers(containers);
          }
        } catch (e) {
          console.error("Error parsing containers", e);
        }
      } else {
        this.setMode("full", task.task_type);
        this.initContainers([]);
      }
    },

    populateOrganismContainers(containers, type, material) {
      Utils.$(`#${type}-customer`).value = material || "";
      containers.forEach((c, idx) => {
        if (idx < 2) {
          const i = idx + 1;
          Utils.$(`#${type}-c${i}-desc`).value = c.content || "";
          Utils.$(`#${type}-c${i}-dept`).value = c.department || "";
          Utils.$(`#${type}-c${i}-driver`).value = c.driverId || "";
        }
      });
    },

    toggleTaskFields(type) {
      Utils.$$(".task-fields").forEach((el) => Utils.hide(el));
      Utils.show(`#fields-${type}`);

      // Manage section visibility
      if (type === "unloading" || type === "loading") {
        const mode = this.getMode(type);
        this.setMode(mode, type);
      } else {
        Utils.hide("#containers-section");
        Utils.show("#global-driver-section");
      }
    },

    getMode(type) {
      const activeBtn = document.querySelector(
        `.mode-btn.active[data-target="${type}"]`,
      );
      return activeBtn ? activeBtn.dataset.mode : "full";
    },

    setMode(mode, type) {
      Utils.$$(`.mode-btn[data-target="${type}"]`).forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
      });

      if (type === "unloading") {
        Utils.toggle("#unloading-full-fields", mode === "full");
        Utils.toggle("#unloading-containers-fields", mode === "containers");
      } else if (type === "loading") {
        Utils.toggle("#loading-full-fields", mode === "full");
        Utils.toggle("#loading-containers-fields", mode === "containers");
      }

      const currentType = document.querySelector(
        'input[name="task-type"]:checked',
      )?.value;
      if (currentType === type) {
        Utils.toggle("#global-driver-section", mode === "full");
      }
    },

    initContainers(containers = []) {
      const list = Utils.$("#containers-list");
      if (!list) return; // Safety first
      list.innerHTML = "";
      if (containers && containers.length > 0) {
        containers.forEach((c) => this.addContainerRow(c));
      }
    },

    addContainerRow(data = null) {
      const list = Utils.$("#containers-list");
      if (!list) return; // Safety first
      const count = list.querySelectorAll(".container-row").length + 1;

      const div = document.createElement("div");
      div.className = "container-row";
      div.style.cssText =
        "background: var(--bg-tertiary); padding: 12px; border-radius: var(--border-radius-lg); border: 1px solid var(--border-color); position: relative;";

      const contentVal = data ? data.content : "";
      const deptVal = data ? data.department : "";
      const driverVal = data ? data.driverId : "";

      // Build department options (assuming state.departments is populated)
      let deptOptions = '<option value="">Wybierz dział...</option>';
      if (state.departments) {
        state.departments.forEach((d) => {
          const sel = d.name === deptVal ? "selected" : "";
          deptOptions += `<option value="${d.name}" ${sel}>${d.name}</option>`;
        });
      }

      // Build driver options
      let driverOptions = '<option value="">Dowolny kierowca...</option>';
      if (state.users) {
        state.users
          .filter((u) => u.role === "driver")
          .forEach((u) => {
            const sel = String(u.id) === String(driverVal) ? "selected" : "";
            driverOptions += `<option value="${u.id}" ${sel}>${u.name}</option>`;
          });
      }

      div.innerHTML = `
            <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span>📦 Kontener ${count}</span>
                <button type="button" class="remove-container-btn" style="color: var(--danger); font-size: 14px;">Usuń</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                <input type="text" class="container-content" placeholder="Nazwa / Opis / Numer..." value="${Utils.escapeHtml(contentVal)}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <select class="container-department" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
                        ${deptOptions}
                    </select>
                    <select class="container-driver" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
                        ${driverOptions}
                    </select>
                </div>
            </div>
        `;

      div
        .querySelector(".remove-container-btn")
        .addEventListener("click", () => {
          div.remove();
          // Renumber remaining containers
          list.querySelectorAll(".container-row").forEach((row, idx) => {
            row.querySelector("span").textContent = `📦 Kontener ${idx + 1}`;
          });
        });

      list.appendChild(div);
    },

    getFormData() {
      const taskType = document.querySelector(
        'input[name="task-type"]:checked',
      ).value;
      const priority = document.querySelector(
        'input[name="task-priority"]:checked',
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
        const mode = this.getMode("unloading");
        if (mode === "full") {
          data.material = Utils.$("#unloading-material").value.trim();
          data.description = `Rozładunek: ${data.material}`;
          data.department = Utils.$("#unloading-department").value;
        } else {
          const customer = Utils.$("#unloading-customer").value.trim();
          data.material = customer;
          data.description = `Rozładunek (${customer})`;
          data.containers = this.getOrganismContainers("unloading");
        }
      } else if (taskType === "loading") {
        const mode = this.getMode("loading");
        if (mode === "full") {
          data.material = Utils.$("#loading-material").value.trim();
          data.description = `Załadunek: ${data.material}`;
          data.department = Utils.$("#loading-department").value;
        } else {
          const customer = Utils.$("#loading-customer").value.trim();
          data.material = customer;
          data.description = `Załadunek (${customer})`;
          data.containers = this.getOrganismContainers("loading");
        }
      } else if (taskType === "other") {
        data.description = Utils.$("#other-description").value.trim();
        data.location_from = Utils.$("#other-from").value.trim();
        data.location_to = Utils.$("#other-to").value.trim();
      }

      // Collect Containers (Unified)
      const currentType = document.querySelector(
        'input[name="task-type"]:checked',
      )?.value;
      const mode =
        currentType === "loading" || currentType === "unloading"
          ? this.getMode(currentType)
          : "full";

      if (mode === "full" && currentType !== "transport") {
        data.containers = null;
      }

      return data;
    },

    getOrganismContainers(type) {
      const containers = [];
      for (let i = 1; i <= 2; i++) {
        const desc = Utils.$(`#${type}-c${i}-desc`).value.trim();
        const dept = Utils.$(`#${type}-c${i}-dept`).value;
        const driverId = Utils.$(`#${type}-c${i}-driver`).value;
        const driverSelect = Utils.$(`#${type}-c${i}-driver`);
        const driverName =
          driverSelect.options[driverSelect.selectedIndex]?.text ||
          "Dowolny kierowca";

        if (desc) {
          containers.push({
            content: desc,
            department: dept,
            driverId: driverId || null,
            driverName: driverId ? driverName : "Dowolny kierowca",
          });
        }
      }
      return containers.length > 0 ? containers : null;
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
          const mode = this.getMode("unloading");
          Toast.warning(
            mode === "full"
              ? "Wpisz nazwę/opis rozładunku"
              : "Wpisz nazwę klienta",
          );
          return false;
        }
        if (!data.department && !data.containers) {
          Toast.warning("Wybierz dział");
          return false;
        }
      } else if (data.task_type === "loading") {
        if (!data.material) {
          const mode = this.getMode("loading");
          Toast.warning(
            mode === "full" ? "Wpisz rodzaj materiału" : "Wpisz nazwę klienta",
          );
          return false;
        }
        if (!data.department && !data.containers) {
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
      const isEdit = !!taskId;

      // --- OPTIMISTIC UI UPDATE ---
      const optimisticTask = { ...data };

      // Setup Defaults for preview
      if (!isEdit) {
        optimisticTask.id = "temp-" + Date.now();
        optimisticTask.status = "pending";
        optimisticTask.creator_name = state.currentUser.name;
        optimisticTask.created_by = state.currentUser.id;
      } else {
        // Preserve existing fields
        const existing = state.tasks.find((t) => t.id == taskId);
        if (existing) {
          Object.assign(optimisticTask, existing, data);
        }
      }

      // 1. Update LOCAL State
      if (isEdit) {
        const idx = state.tasks.findIndex((t) => t.id == taskId);
        if (idx !== -1) state.tasks[idx] = optimisticTask;
      } else {
        state.tasks.push(optimisticTask);
      }

      // 2. Render Immediately
      Modal.close("modal-task");
      Toast.success(isEdit ? "Zadanie zaktualizowane!" : "Zadanie dodane!");

      if (state.currentUser.role === "admin") {
        AdminPanel.renderTasks(); // Assuming AdminPanel has renderTasks or similar
      } else {
        DriverPanel.sortTasks();
        DriverPanel.updateStats();
        DriverPanel.renderTasks();
      }

      // 3. Sync with Server
      try {
        let result;
        if (isEdit) {
          await API.updateTask(taskId, data);
        } else {
          result = await API.createTask(data);
          // Update temp ID with Real ID
          const tempIdx = state.tasks.findIndex(
            (t) => t.id === optimisticTask.id,
          );
          if (tempIdx !== -1) {
            state.tasks[tempIdx].id = result.id;
            // Update Cache with real ID
            const dateKey = optimisticTask.scheduled_date;
            if (state.taskCache[dateKey]) {
              state.taskCache[dateKey] = [...state.tasks]; // Update cache ref
              localStorage.setItem(
                CONFIG.STORAGE_KEYS.TASKS,
                JSON.stringify(state.taskCache),
              );
            }
          }
        }

        // Refresh full list quietly to ensure consistency
        if (state.currentUser.role === "admin") {
          await AdminPanel.loadTasks(true);
        } else {
          await DriverPanel.loadTasks(true);
        }
      } catch (error) {
        console.error("Optimistic update failed:", error);
        Toast.error("Błąd zapisu! Cofam zmiany...");

        // ROLLBACK
        if (isEdit) {
          // Need to reload original state - easiest is to fetch again
          // Or undo change if we kept copy.
          // For now: Force reload
        } else {
          state.tasks = state.tasks.filter((t) => t.id !== optimisticTask.id);
        }

        if (state.currentUser.role === "admin") {
          AdminPanel.loadTasks();
        } else {
          DriverPanel.renderTasks();
        }
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

      Utils.$("#add-container-btn")?.addEventListener("click", () => {
        this.addContainerRow();
      });

      Utils.$$(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.setMode(btn.dataset.mode, btn.dataset.target);
        });
      });

      Utils.$("#task-form")?.addEventListener("submit", (e) =>
        this.handleSubmit(e),
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
      const list = Utils.$("#admin-tasks-list");

      // 1. POKAŻ CACHE NATYCHMIAST (SWR)
      if (state.taskCache[targetDate]) {
        state.tasks = state.taskCache[targetDate];
        this.sortTasks();
        this.updateStats();
        this.updateDateDisplay();
        this.renderTasks();
      } else if (!silent && list) {
        // Jeśli nie ma w cache, można pokazać loader
        list.innerHTML = Utils.getLoaderHtml();
      }

      try {
        // 2. Pobieramy świeże dane w tle
        const freshTasks = await API.getTasks({
          date: targetDate,
          userId: state.currentUser.id,
        });

        // 3. Sprawdzamy czy coś się zmieniło
        const hasChanged =
          JSON.stringify(freshTasks) !==
          JSON.stringify(state.taskCache[targetDate]);

        // Zapisz do cache
        state.taskCache[targetDate] = freshTasks;

        // Persist Cache
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.TASKS,
          JSON.stringify(state.taskCache),
        );

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
          Toast.error("Błąd połączenia");
        }
      }
    },

    async prefetchNeighboringDates() {
      if (!state.currentUser) return;
      const yesterday = Utils.addDays(state.currentDate, -1);
      const tomorrow = Utils.addDays(state.currentDate, 1);

      [yesterday, tomorrow].forEach(async (date) => {
        if (!state.taskCache[date]) {
          try {
            const tasks = await API.getTasks({
              date,
              userId: state.currentUser.id,
            });
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
      const pending = state.tasks.filter(
        (t) => t.status === "pending" || t.status === "paused",
      ).length;
      const inProgress = state.tasks.filter(
        (t) => t.status === "in_progress",
      ).length;
      const completed = state.tasks.filter(
        (t) => t.status === "completed",
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
      state.viewMode = state.viewMode === "list" ? "tiles" : "list";
      const list = Utils.$("#admin-tasks-list");
      list.classList.toggle("view-list", state.viewMode === "list");

      const btn = Utils.$("#admin-view-toggle-btn");
      if (btn) {
        btn.innerHTML = state.viewMode === "list" ? "📱" : "📝";
        btn.title =
          state.viewMode === "list" ? "Widok kafelkowy" : "Widok listy";
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
            (t) => t.status === "pending" || t.status === "paused",
          );
        } else {
          filteredTasks = state.tasks.filter(
            (t) => t.status === state.currentFilter,
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
      if (state.viewMode === "list") {
        tasksList.classList.add("view-list");
        if (btn) {
          btn.innerHTML = "📱";
          btn.title = "Widok kafelkowy";
        }
      } else {
        tasksList.classList.remove("view-list");
        if (btn) {
          btn.innerHTML = "📝";
          btn.title = "Widok listy";
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
                          task.location_from || "?",
                        )}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(
                          task.location_to || "?",
                        )}</span>
                    </div>
                `;
      } else {
        let deptsHtml = "";
        if (task.department) {
          deptsHtml = `<div class="task-department"><span>🏢</span> <span>${Utils.escapeHtml(task.department)}</span></div>`;
        }

        if (task.containers) {
          try {
            const containers = JSON.parse(task.containers);
            const depts = [
              ...new Set(containers.map((c) => c.department).filter((d) => d)),
            ];
            if (
              depts.length > 0 &&
              (!task.department || !depts.includes(task.department))
            ) {
              deptsHtml += `
                        <div class="task-department">
                            <span>🏢</span>
                            <span style="font-weight: 500;">${depts.map((d) => Utils.escapeHtml(d)).join(", ")}</span>
                        </div>
                    `;
            }
          } catch (e) {}
        }
        taskDescription = deptsHtml;
      }

      const containerSummary = task.containers
        ? (() => {
            try {
              const containers = JSON.parse(task.containers);
              if (containers.length > 0) {
                return `
                    <div class="task-material" style="color: var(--primary);">
                        <span>📦</span>
                        <span>Kontenery: ${containers.length} szt.</span>
                    </div>
                  `;
              }
            } catch (e) {}
            return "";
          })()
        : "";

      const materialHtml =
        task.material && !task.containers
          ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            `
          : containerSummary;

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
                    <span class="task-meta-item" title="${Utils.escapeHtml(
                      driversList,
                    )}">
                        <span>${icon}</span>
                        <span>${Utils.escapeHtml(driversList)}</span>
                        ${
                          label
                            ? `<span class="task-drivers-badge">${label}</span>`
                            : ""
                        }
                    </span>
                `;
      }

      const creatorHtml = task.creator_name
        ? `
                <span class="task-meta-item" title="Utworzył">
                    <span>✏️</span>
                    <span>${Utils.escapeHtml(
                      task.creator_name,
                    )} (${Utils.formatTime(task.created_at)})</span>
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
                <div class="task-card priority-${task.priority} status-${
                  task.status
                }" 
                     data-id="${task.id}" 
                     draggable="${
                       state.isReorderMode &&
                       !isCompleted &&
                       !isInProgress &&
                       canEdit
                     }">
                    
                    ${
                      state.isReorderMode && canEdit
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
                          task.status,
                        )} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-order-badge">#${order}</span>
                            <span class="task-type-badge type-${
                              task.task_type
                            }">
                                ${Utils.getTaskTypeIcon(
                                  task.task_type,
                                )} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${
                              task.priority
                            }" 
                                  data-action="${
                                    canEdit ? "change-priority" : ""
                                  }" data-id="${task.id}" 
                                  title="Zmień priorytet" 
                                  style="${
                                    canEdit
                                      ? "cursor:pointer"
                                      : "cursor:default"
                                  }">
                                ${Utils.getPriorityIcon(
                                  task.priority,
                                )} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${
                      task.id
                    }">
                        <div class="task-title">${Utils.escapeHtml(
                          task.description,
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
                                      task.scheduled_time,
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
        },
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
          btn.dataset.filter === state.currentFilter,
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
          "#admin-tasks-list .task-card:not(.status-completed):not(.status-in_progress)",
        );
        const newOrder = Array.from(taskCards).map((card) =>
          parseInt(card.dataset.id),
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
        ".task-card:not(.status-completed):not(.status-in_progress)",
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
                ".task-card:not(.status-completed):not(.status-in_progress)",
              ),
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

      const canManageUsers =
        state.currentUser.id === 1 || state.currentUser.perm_users;
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
                              ${
                                user.role === "admin"
                                  ? "👔 Kierownik"
                                  : "🚗 Kierowca"
                              }
                              ${user.force_pin_change ? ' <span title="Wymuszona zmiana PIN" style="cursor:help">🔑</span>' : ""}
                              ${
                                user.role === "admin"
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
          `,
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
        'input[name="user-role"][value="driver"]',
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
      Utils.$("#user-force-pin").checked = !!user.force_pin_change;

      // Ustaw rolę
      const radio = document.querySelector(
        `input[name="user-role"][value="${user.role}"]`,
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
        'input[name="user-role"]:checked',
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
        userData.force_pin_change = 1; // Auto-force on manual PIN change
      } else {
        userData.force_pin_change = Utils.$("#user-force-pin").checked ? 1 : 0;
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
        },
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

    openAddLocationModal() {
      Utils.$("#location-id").value = ""; // Hidden ID field needed in HTML
      Utils.$("#location-name").value = "";
      Utils.$("#location-map-x").value = "";
      Utils.$("#location-map-y").value = "";

      // Reset radio
      const locRadio = document.querySelector(
        'input[name="location-type"][value="location"]',
      );
      if (locRadio) locRadio.checked = true;

      Utils.$("#modal-location h2").textContent = "Dodaj lokalizację";
      const submitBtn = Utils.$("#add-location-submit-btn span");
      if (submitBtn) submitBtn.textContent = "Dodaj";
      Modal.open("modal-location");
    },

    openEditLocationModal(id) {
      const item = [...state.locations, ...state.departments].find(
        (l) => l.id == id,
      );
      if (!item) return;

      Utils.$("#location-id").value = item.id;
      Utils.$("#location-name").value = item.name;
      Utils.$("#location-map-x").value = item.map_x || "";
      Utils.$("#location-map-y").value = item.map_y || "";

      // Set radio
      const radio = document.querySelector(
        `input[name="location-type"][value="${item.type}"]`,
      );
      if (radio) radio.checked = true;

      Utils.$("#modal-location h2").textContent = "Edytuj lokalizację";
      // FIX: Button nie ma ID, szukamy w formularzu
      const submitBtn = document.querySelector(
        "#location-form button[type='submit']",
      );
      if (submitBtn) submitBtn.textContent = "Zapisz zmiany";
      Modal.open("modal-location");
    },

    // Callback z MapManager
    onMapPick(coords) {
      Utils.$("#location-map-x").value = coords.x;
      Utils.$("#location-map-y").value = coords.y;

      // Jeśli modal lokalizacji jest zamknięty (bo mapa go przykryła lub zamknęliśmy), otwórz go
      // Ale normalnie MapManager zamyka mapę i my wracamy do modala lokalizacji
      Modal.open("modal-location");
    },

    initLocationListeners() {
      Utils.$("#add-location-btn")?.addEventListener("click", () =>
        this.openAddLocationModal(),
      );

      Utils.$("#location-form")?.addEventListener("submit", (e) =>
        this.handleLocationSubmit(e),
      );

      Utils.$("#pick-location-btn")?.addEventListener("click", () => {
        // Pobierz ID jeśli edytujemy
        const id = Utils.$("#location-id").value;
        // Tymczasowo zamknij modal locations żeby widzieć mapę, ALE NIE RESETUJ formularza
        Modal.close("modal-location", false);
        MapManager.open("pick", id); // Przekaż ID do MapManager
      });
    },

    renderLocations() {
      const locationsList = Utils.$("#locations-list");
      const departmentsList = Utils.$("#departments-list");
      const canManageLocations =
        state.currentUser.id === 1 || state.currentUser.perm_locations;

      const renderDeleteBtn = (id) =>
        canManageLocations
          ? `
                <div class="location-actions">
                    <button class="task-action-btn btn-edit" data-action="edit-location" data-id="${id}">✏️</button>
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
            `,
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
            `,
          )
          .join("") || '<p class="text-muted text-center">Brak działów</p>';

      if (canManageLocations) {
        Utils.$$('[data-action="edit-location"]').forEach((btn) => {
          btn.addEventListener("click", () =>
            this.openEditLocationModal(btn.dataset.id),
          );
        });
        Utils.$$('[data-action="delete-location"]').forEach((btn) => {
          btn.addEventListener("click", () =>
            this.deleteLocation(btn.dataset.id),
          );
        });
      }
    },

    async handleLocationSubmit(e) {
      e.preventDefault();

      if (this._addingLocation) return;

      const name = Utils.$("#location-name").value.trim();
      const type = document.querySelector(
        'input[name="location-type"]:checked',
      ).value;
      const id = Utils.$("#location-id").value; // Get ID (empty if new)

      if (!name) {
        Toast.warning("Wpisz nazwę");
        return;
      }

      this._addingLocation = true;
      Modal.close("modal-location");

      const mapX = Utils.$("#location-map-x").value;
      const mapY = Utils.$("#location-map-y").value;

      try {
        if (id) {
          // === UPDATE ===
          // 1. Optimistic Update
          state.locations = state.locations.map((l) => {
            if (l.id == id)
              return { ...l, name, type, map_x: mapX, map_y: mapY };
            return l;
          });
          state.departments = state.departments.map((d) => {
            if (d.id == id)
              return { ...d, name, type, map_x: mapX, map_y: mapY };
            return d;
          });

          this.renderLocations();
          DataLists.updateAll();
          Toast.success("Zapisano zmiany");

          // 2. API Call
          await API.updateLocation(id, {
            name,
            type,
            map_x: mapX,
            map_y: mapY,
          });
        } else {
          // === CREATE ===
          const tempId = Date.now();
          const newItem = {
            id: tempId,
            name,
            type,
            active: 1,
            map_x: mapX,
            map_y: mapY,
          };

          // 1. Optimistic Add
          if (type === "department") state.departments.push(newItem);
          else state.locations.push(newItem);

          this.renderLocations();
          DataLists.updateAll();
          Toast.success(
            type === "department" ? "Dział dodany" : "Lokalizacja dodana",
          );

          // 2. API Call
          const result = await API.createLocation({
            name,
            type,
            map_x: mapX,
            map_y: mapY,
          });

          // 3. Update ID from API
          const list =
            type === "department" ? state.departments : state.locations;
          const item = list.find((x) => x.id === tempId);
          if (item) item.id = result.id;
        }
      } catch (error) {
        console.error(error);
        Toast.error("Błąd zapisu (odśwież stronę)");
        // In a real app we would revert state here
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
            (l) => l.id == locationId,
          );

          // Instant UI update
          state.locations = state.locations.filter((l) => l.id != locationId);
          state.departments = state.departments.filter(
            (l) => l.id != locationId,
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
        },
      );
    },

    // REPORTS
    async loadReports(period = "today") {
      try {
        // Dodaj timestamp żeby nie było cache
        const data = await API.getReports(period + "&t=" + Date.now());
        state.lastReportData = data;
        state.lastReportPeriod = period;
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
          (data.drivers.length || 1),
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
          } else {
            chartHtml = this.generateBarChart(driver.timeline);
          }

          // Generuj tabelę szczegółów (teraz również dla widoku tygodnia/miesiąca)
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
                                      <span class="details-time">${
                                        d.time
                                      } - ${d.endTime || "?"}</span>
                                      <span class="details-desc">${Utils.escapeHtml(
                                        d.desc,
                                      )}</span>
                                      <span class="details-duration">${
                                        d.duration
                                      }m</span>
                                  </div>
                              `,
                                )
                                .join("")}
                          </div>
                      `;
          }

          return `
                    <div class="report-driver-card">
                        <div class="report-driver-header">
                            <div class="report-driver-info">
                                <div class="user-avatar">🚗</div>
                                <div>
                                    <h3>${Utils.escapeHtml(driver.name)}</h3>
                                    <span class="text-muted" style="font-size:12px">KPI: ${
                                      driver.kpi
                                    }%</span>
                                </div>
                            </div>
                            <div class="report-driver-kpi ${kpiColor}">${
                              driver.kpi
                            }%</div>
                        </div>

                        <div class="kpi-grid">
                            <div class="kpi-box">
                                <div class="kpi-value">${this.formatDuration(
                                  driver.workTime,
                                )}</div>
                                <div class="kpi-label">Praca</div>
                            </div>
                            <div class="kpi-box">
                                <div class="kpi-value" style="color:var(--danger)">${this.formatDuration(
                                  driver.delayTime,
                                )}</div>
                                <div class="kpi-label">Przestoje</div>
                            </div>
                            <div class="kpi-box">
                                <div class="kpi-value">${
                                  driver.tasksCount
                                }</div>
                                <div class="kpi-label">Zadań</div>
                            </div>
                        </div>

                        <div class="timeline-container ${
                          driver.isSingleDay ? "" : "bar-chart"
                        }" 
                             style="${
                               driver.isSingleDay
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
                              d.minutes,
                            )}</div>
                            <div style="width:100%; background:var(--bg-tertiary); height:80px; border-radius:4px; position:relative; overflow:hidden;">
                                <div style="position:absolute; bottom:0; left:0; right:0; height:${
                                  d.percent
                                }%; background:var(--primary); transition:height 0.3s;" title="${Utils.formatDateShort(
                                  d.date,
                                )}"></div>
                            </div>
                            <div style="font-size:9px; margin-top:4px; color:var(--text-secondary); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${Utils.formatDateShort(
                              d.date,
                            )}</div>
                        </div>
                    `,
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

      events.forEach((e) => {
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
        const left = (((h - startHour) * 60) / totalMinutes) * 100;
        markersHtml += `
          <div class="timeline-marker" style="left: ${left}%">
            ${
              h % 2 === 0 || totalMinutes < 720
                ? `<div class="timeline-time">${h}:00</div>`
                : ""
            }
          </div>
        `;
      }
      markersHtml += "</div>";

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
              const eventStartMins = startH * 60 + startM;
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
                             style="left: ${left}%; width: ${width}%; height: ${
                               height - 2
                             }%; top: ${top}%;"
                             data-title="${Utils.escapeHtml(
                               event.desc,
                             )} (${Math.round(duration)} min)">
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

    printReport() {
      const data = state.lastReportData;
      if (!data || !data.drivers || data.drivers.length === 0) {
        Toast.warning("Brak danych do wydruku. Załaduj najpierw raport.");
        return;
      }

      const printable = Utils.$("#printable-report");
      const periodLabel = Utils.$("#report-period-type").options[
        Utils.$("#report-period-type").selectedIndex
      ].text;
      const subPeriod =
        state.lastReportPeriod === "month"
          ? Utils.$("#report-month-picker").value
          : state.lastReportPeriod === "day"
            ? Utils.$("#report-day-picker").value
            : "";

      const totalTasks = data.drivers.reduce((sum, d) => sum + d.tasksCount, 0);
      const avgKpi = Math.round(
        data.drivers.reduce((sum, d) => sum + d.kpi, 0) /
          (data.drivers.length || 1),
      );

      // Calculate Total Averages
      let tLoad = 0,
        tTrans = 0,
        tUnload = 0;
      data.drivers.forEach((d) => {
        tLoad += d.avgLoad || 0;
        tTrans += d.avgTransport || 0;
        tUnload += d.avgUnload || 0;
      });
      const c = data.drivers.length || 1;
      const gAvgLoad = Math.round(tLoad / c);
      const gAvgTrans = Math.round(tTrans / c);
      const gAvgUnload = Math.round(tUnload / c);

      let html = `
            <div class="report-print-header">
                <div class="report-print-logo">
                    <span>🚛</span>
                    <span>Transport Tracker</span>
                </div>
                <div class="report-print-info">
                    <strong>Data wygenerowania:</strong> ${new Date().toLocaleString("pl-PL")}<br>
                    <strong>Okres:</strong> ${periodLabel} ${subPeriod}
                </div>
            </div>

            <h1 class="report-print-title">Raport Pracy Kierowców</h1>

            <div class="print-stats-summary" style="margin-bottom: 20px;">
                <div class="print-stat-box">
                    <span class="print-stat-lab">Suma zadań</span>
                    <span class="print-stat-val">${totalTasks}</span>
                </div>
                <div class="print-stat-box">
                    <span class="print-stat-lab">Średnie KPI</span>
                    <span class="print-stat-val">${avgKpi}%</span>
                </div>
                <div class="print-stat-box">
                    <span class="print-stat-lab">Kierowcy</span>
                    <span class="print-stat-val">${data.drivers.length}</span>
                </div>
            </div>
            
            <div class="print-stats-summary">
                 <div class="print-stat-box">
                    <span class="print-stat-lab">Śr. Załadunek</span>
                    <span class="print-stat-val">${gAvgLoad} min</span>
                </div>
                <div class="print-stat-box">
                    <span class="print-stat-lab">Śr. Transport</span>
                    <span class="print-stat-val">${gAvgTrans} min</span>
                </div>
                <div class="print-stat-box">
                    <span class="print-stat-lab">Śr. Rozładunek</span>
                    <span class="print-stat-val">${gAvgUnload} min</span>
                </div>
            </div>
        `;

      data.drivers.forEach((driver) => {
        html += `
                <div class="print-driver-section">
                    <div class="print-driver-header">
                        <span>👤 ${Utils.escapeHtml(driver.name)}</span>
                        <span>KPI: ${driver.kpi}% | Zadania: ${driver.tasksCount}</span>
                        <span style="font-size: 0.8em; margin-left: 10px; opacity: 0.8;">(Z: ${driver.avgLoad || 0}m, T: ${driver.avgTransport || 0}m, R: ${driver.avgUnload || 0}m)</span>
                    </div>
                    <table class="print-table">
                        <thead>
                            <tr>
                                <th style="width: 120px;">Czas</th>
                                <th>Opis zadania / aktywności</th>
                                <th style="width: 80px;">Czas trwania</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

        if (driver.details && driver.details.length > 0) {
          driver.details.forEach((d) => {
            html += `
                        <tr>
                            <td>${d.time} - ${d.endTime || "?"}</td>
                            <td>${Utils.escapeHtml(d.desc)}</td>
                            <td>${d.duration} min</td>
                        </tr>
                    `;
          });
        } else {
          html += `<tr><td colspan="3" style="text-align:center;">Brak szczegółowych wpisów</td></tr>`;
        }

        html += `
                        </tbody>
                    </table>
                </div>
            `;
      });

      html += `
            <div class="print-footer">
                © ${new Date().getFullYear()} Hemarpol Transport Tracker - Raport automatyczny
            </div>
        `;

      printable.innerHTML = html;

      // Trigger print
      window.print();

      // Optional: clear after print to keep DOM lean
      setTimeout(() => {
        printable.innerHTML = "";
      }, 1000);
    },

    // EVENT LISTENERS
    initEventListeners() {
      // Add task
      Utils.$("#add-task-btn")?.addEventListener("click", () =>
        TaskForm.open(),
      );
      Utils.$("#add-task-empty-btn")?.addEventListener("click", () =>
        TaskForm.open(),
      );

      // Date navigation
      Utils.$("#prev-day-btn")?.addEventListener("click", () =>
        this.changeDate(-1),
      );
      Utils.$("#next-day-btn")?.addEventListener("click", () =>
        this.changeDate(1),
      );
      Utils.$("#admin-date-picker")?.addEventListener("change", (e) =>
        this.setDate(e.target.value),
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
        this.toggleReorderMode(),
      );

      Utils.$("#admin-view-toggle-btn")?.addEventListener("click", () =>
        this.toggleViewMode(),
      );
      Utils.$("#map-save-btn")?.addEventListener("click", () => {
        MapManager.savePickedLocation();
      });

      // Driver Map Button
      Utils.$("#driver-map-btn")?.addEventListener("click", () => {
        MapManager.open("view");
      });

      // Admin Map Button
      Utils.$("#admin-map-btn")?.addEventListener("click", () => {
        MapManager.open("view");
      });

      Utils.$("#save-reorder-btn")?.addEventListener("click", () =>
        this.saveReorder(),
      );
      Utils.$("#cancel-reorder-btn")?.addEventListener("click", () =>
        this.cancelReorder(),
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
        this.openAddUserModal(),
      );
      Utils.$("#user-form")?.addEventListener("submit", (e) =>
        this.handleSaveUser(e),
      );

      // Locations
      Utils.$("#add-location-btn")?.addEventListener("click", () =>
        this.openAddLocationModal(),
      );
      Utils.$("#location-form")?.addEventListener("submit", (e) =>
        this.handleLocationSubmit(e),
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

      // Print Report
      Utils.$("#print-report-btn")?.addEventListener("click", () =>
        this.printReport(),
      );
    },
  };

  // =============================================
  // Lokalizacja Systemowa: Parking TIR
  // =============================================
  async function ensureParkingTIR() {
    try {
      // Pobierz wszystkie lokalizacje
      const locations = await API.request("/locations");

      // Sprawdź czy Parking TIR już istnieje
      const parkingTIR = locations.find((loc) => loc.name === "Parking TIR");

      if (!parkingTIR) {
        console.log("🚛 Tworzenie lokalizacji systemowej: Parking TIR");

        // Utwórz Parking TIR w centrum mapy (50%, 50%)
        await API.request("/locations", {
          method: "POST",
          body: {
            name: "Parking TIR",
            type: "location",
            map_x: 50,
            map_y: 50,
            is_system: 1, // Oznacz jako lokalizacja systemowa (nieusuwalna)
          },
        });

        console.log("✅ Parking TIR utworzony");
      } else {
        console.log("✅ Parking TIR już istnieje");
      }
    } catch (error) {
      console.error("⚠️ Błąd tworzenia Parking TIR:", error);
    }
  }

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
    MapManager.init();

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
              "Nowe powiadomienie",
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

    // Upewnij się że Parking TIR istnieje (lokalizacja systemowa)
    await ensureParkingTIR();

    // Jeśli mieliśmy Deep Link, otwórz zadanie po zalogowaniu
    if (DeepLinkTaskId && state.currentUser) {
      if (state.currentUser.role === "admin") {
        AdminPanel.openTaskDetails(DeepLinkTaskId);
      } else {
        DriverPanel.openTaskDetails(DeepLinkTaskId);
      }
      // Wyczyść URL
      window.history.replaceState({}, document.title, "/");
    }

    // REAL-TIME: Odświeżaj gdy użytkownik wraca do karty przeglądarki
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.currentUser) {
        console.log("🚀 App visible - refreshing data...");
        // Wymuszamy ciche odświeżenie bez pokazywania loaderów, chyba że dane są stare
        if (state.currentUser.role === "admin") {
          AdminPanel.loadTasks(true);
        } else {
          DriverPanel.loadTasks(true);
        }
        Notifications.load();

        // Jeśli apka była w tle długo (np. 5 min), odświeżamy też cache
        const lastSync = parseInt(localStorage.getItem("tt_last_focus") || "0");
        const now = Date.now();
        if (now - lastSync > 300000) {
          console.log("🔄 Long time no see - hard refresh...");
          if (state.currentUser.role === "admin") AdminPanel.loadTasks(false);
          else DriverPanel.loadTasks(false);
        }
        localStorage.setItem("tt_last_focus", String(now));
      }
    });

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
            }).catch((err) => {
              console.warn("⚠️ OneSignal Init Warning:", err);
            });

            if (!OneSignal) {
              console.warn("OneSignal not loaded");
              resolve(false);
              return;
            }

            OneSignalService.initialized = true;

            // Event: Foreground notification
            OneSignal.Notifications.addEventListener(
              "foregroundWillDisplay",
              (event) => {
                // Zapobiegaj pokazaniu systemowego okienka gdy apka jest otwarta (Android/PWA)
                event.preventDefault();

                // Odśwież powiadomienia w dzwoneczku
                Notifications.load();

                // Pokaż tylko Toast
                Toast.info(
                  event.notification.body ||
                    event.notification.title ||
                    "Nowe powiadomienie",
                );
              },
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
            const currentPermission =
              await OneSignal.Notifications.permissionNative;

            if (currentPermission === "granted") {
              resolve(true);
              return;
            }

            if (currentPermission === "denied") {
              Toast.warning(
                "Powiadomienia zostały zablokowane w ustawieniach przeglądarki",
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
                  state.currentUser.role,
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
  console.log("🛠️ Exporting modules...", { MapManager: typeof MapManager });

  // Eksport globalny (fallback)
  window.MapManager = MapManager;

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
    MapManager,
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
