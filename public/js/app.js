// =============================================
// TransportTracker - Aplikacja JavaScript
// Wersja 1.2.0
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
      let date;
      // Handle full datetime strings (e.g. from SQL)
      if (dateStr.includes(" ") || dateStr.includes("T")) {
          // Replace space with T for Safari compatibility if needed, though simple replacement might be enough
          // But beware of timezone. Backend usually sends local time in simple string?
          // Let's use the explicit parsing logic from formatRelativeTime which is robust.
          if (dateStr.includes(" ")) {
            const parts = dateStr.split(" ");
            const dateParts = parts[0].split("-");
            const timeParts = parts[1].split(":");
            date = new Date(
              parseInt(dateParts[0]),
              parseInt(dateParts[1]) - 1,
              parseInt(dateParts[2]),
              parseInt(timeParts[0] || 0),
              parseInt(timeParts[1] || 0),
              parseInt(timeParts[2] || 0)
            );
          } else {
            date = new Date(dateStr);
          }
      } else {
          // Just YYYY-MM-DD
          date = new Date(dateStr + "T00:00:00");
      }
      
      if (isNaN(date.getTime())) return "Invalid Date"; // Fallback

      return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
        weekday: "short", // Changed to short to save space in logs
        day: "numeric",
        month: "numeric", // Changed to numeric (10.02) per user request style "DD.MM" usually
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

    getLoaderEl() {
      return this.el("div", { className: "loader-inline-wrapper" }, [
        this.el("div", { className: "loader-inline" }),
        this.el("div", {}, "Ładowanie danych...")
      ]);
    },

    getReorderBtnContent() {
      const fragment = document.createDocumentFragment();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "20");
      svg.setAttribute("height", "20");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");

      const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l1.setAttribute("x1", "3"); l1.setAttribute("y1", "6"); l1.setAttribute("x2", "21"); l1.setAttribute("y2", "6");
      const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l2.setAttribute("x1", "3"); l2.setAttribute("y1", "12"); l2.setAttribute("x2", "21"); l2.setAttribute("y2", "12");
      const l3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l3.setAttribute("x1", "3"); l3.setAttribute("y1", "18"); l3.setAttribute("x2", "21"); l3.setAttribute("y2", "18");

      svg.append(l1, l2, l3);
      fragment.append(svg, " ", this.el("span", {}, "Zmień kolejność"));
      return fragment;
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

    /**
     * Tworzy element DOM z opcjonalnymi atrybutami, klasami i dziećmi.
     * @param {string} tag - Nazwa tagu (np. 'div', 'span')
     * @param {object} props - Właściwości i atrybuty
     * @param {Array|HTMLElement|string} children - Elementy potomne lub tekst
     * @returns {HTMLElement}
     */
    el(tag, props = {}, children = []) {
      const element = document.createElement(tag);
      
      for (const [key, value] of Object.entries(props)) {
        if (key === 'className') {
          element.className = value;
        } else if (key === 'dataset' && typeof value === 'object') {
          for (const [dataKey, dataValue] of Object.entries(value)) {
            element.dataset[dataKey] = dataValue;
          }
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
          element.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (['selected', 'checked', 'disabled', 'value'].includes(key)) {
          element[key] = value;
        } else {
          element.setAttribute(key, value);
        }
      }
      
      if (children) {
        const childrenArr = Array.isArray(children) ? children : [children];
        for (const child of childrenArr) {
          if (child === null || child === undefined || child === false) continue;
          if (child instanceof HTMLElement) {
            element.appendChild(child);
          } else {
            element.appendChild(document.createTextNode(String(child)));
          }
        }
      }
      
      return element;
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

      const toast = Utils.el("div", { className: `toast toast-${type}` }, [
        Utils.el("span", { className: "toast-icon" }, icons[type] || icons.info),
        Utils.el("span", { className: "toast-message" }, message),
        Utils.el("button", {
          className: "toast-close",
          "aria-label": "Zamknij",
          onclick: () => this.remove(toast)
        }, "×")
      ]);

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
  // 7. MODAL
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
  // 8. THEME
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
  // 9. SCREEN
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
  // 10. NOTIFICATIONS
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
        list.replaceChildren();
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);
      
      list.replaceChildren();
      state.notifications.forEach((notif) => {
        const item = Utils.el("div", {
          className: `notification-item ${notif.is_read ? "" : "unread"}`,
          dataset: { id: notif.id, taskId: notif.task_id || "" },
          onclick: async () => {
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
              const notifObj = state.notifications.find((n) => n.id == id);
              if (notifObj) notifObj.is_read = 1;

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
          }
        }, [
          Utils.el("div", { className: "notification-icon" }, this.getIcon(notif.type)),
          Utils.el("div", { className: "notification-content" }, [
            Utils.el("div", { className: "notification-title" }, notif.title),
            Utils.el("div", { className: "notification-message" }, notif.message),
            Utils.el("div", { className: "notification-time" }, Utils.formatRelativeTime(notif.created_at))
          ]),
          !notif.is_read ? Utils.el("div", { className: "notification-unread-dot" }) : null
        ]);

        list.appendChild(item);
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
  // 11. DATALISTS
  // =============================================
  const DataLists = {
    updateLocations() {
      const datalist = Utils.$("#datalist-locations");
      if (!datalist) return;

      datalist.replaceChildren();
      [...state.locations, ...state.departments].forEach((loc) => {
        const option = Utils.el("option", { value: loc.name });
        datalist.appendChild(option);
      });
    },

    updateDepartmentSelects() {
      const selects = [
        Utils.$("#loading-department"),
        Utils.$("#other-department"),
        ...Utils.$$(".dept-select"),
      ];

      selects.forEach((select) => {
        if (!select) return;
        const currentValue = select.value;
        select.replaceChildren();
        
        select.appendChild(Utils.el("option", { value: "" }, "Dział..."));
        
        state.departments.forEach((dept) => {
          select.appendChild(Utils.el("option", { value: dept.name }, dept.name));
        });
        
        select.value = currentValue;
      });
    },

    updateDepartmentMultiSelects() {
      const containers = [
        Utils.$("#unloading-department-multi"),
        Utils.$("#unloading-c1-dept-multi"),
        Utils.$("#unloading-c2-dept-multi"),
      ];

      containers.forEach((container) => {
        if (!container) return;
        
        // Preserve current selections
        const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        
        container.replaceChildren();
        
        state.departments.forEach((dept) => {
          const label = document.createElement("label");
          label.className = "multi-select-item";
          if (selected.includes(dept.name)) label.classList.add("selected");

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = dept.name;
          cb.checked = selected.includes(dept.name);
          
          cb.addEventListener("change", () => {
            label.classList.toggle("selected", cb.checked);
          });

          const span = document.createElement("span");
          span.textContent = dept.name;

          label.appendChild(cb);
          label.appendChild(span);
          container.appendChild(label);
        });
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

        select.replaceChildren();
        select.appendChild(Utils.el("option", { value: "" }, isGlobal ? "Dowolny kierowca" : "Dowolny..."));
        
        drivers.forEach((driver) => {
          select.appendChild(Utils.el("option", { value: driver.id }, driver.name));
        });

        select.value = currentValue;
      });
    },

    updateAll() {
      this.updateLocations();
      this.updateDepartmentSelects();
      this.updateDepartmentMultiSelects();
      this.updateDriverSelect();
    },
  };

  // =============================================
  // 12. MAP MANAGER - SMART ROUTING (DIJKSTRA)
  // =============================================
  /* =========================================
     MAP MANAGER (LEAFLET.JS IMPLEMENTATION)
     ========================================= */

  // Helper for Dijkstra
  class PriorityQueue {
    constructor() {
      this.items = [];
    }
    enqueue(element, priority) {
      const qElement = { element, priority };
      let added = false;
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].priority > qElement.priority) {
          this.items.splice(i, 0, qElement);
          added = true;
          break;
        }
      }
      if (!added) this.items.push(qElement);
    }
    dequeue() {
      return this.items.shift();
    }
    isEmpty() {
      return this.items.length === 0;
    }
  }

  const MapManager = {
    mode: "view", // 'view' | 'pick' | 'edit_network' | 'show_route'
    targetLocationId: null,
    tempCoords: null,

    // Leaflet instances
    map: null,
    imageOverlay: null,
    markersLayer: null,
    routeLayer: null,
    tempMarker: null,

    // Metadata
    mapWidth: 0,
    mapHeight: 0,
    isInitialized: false,
    lastOpenTime: 0,

    // Dane sieci dróg (dla edytora)
    nodes: [],
    connections: [],

    // Stan edycji
    selectedNodeId: null,

    // Stan trasy
    routeFrom: null,
    routeTo: null,

    init() {
      // Lazy initialization
    },

    async open(mode = "view", data = null) {
      const now = Date.now();
      if (this.lastOpenTime && now - this.lastOpenTime < 500) return;
      this.lastOpenTime = now;

      console.group("🗺️ MapManager.open (Leaflet)");
      console.log(`🚀 Mode: ${mode}`, data);

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
        this.tempCoords = null;
        if (titleEl)
          titleEl.textContent = "📍 Zaznacz lokalizację: Kliknij na mapie";
        Utils.show(saveBtn);

        // Znajdź istniejącą lokalizację
        let existingLoc = null;
        if (typeof data === "number" || typeof data === "string") {
          existingLoc = [...state.locations, ...state.departments].find(
            (l) => l.id == data,
          );
        } else if (typeof data === "object") {
          existingLoc = data;
        }

        // Jeśli ma współrzędne, ustaw tymczasowy pin
        if (
          existingLoc &&
          existingLoc.map_x != null &&
          existingLoc.map_y != null
        ) {
          this.tempCoords = { x: existingLoc.map_x, y: existingLoc.map_y };
          if (saveBtn) saveBtn.disabled = false;
        } else {
          if (saveBtn) saveBtn.disabled = true;
        }
      } else if (mode === "edit_network") {
        if (titleEl) titleEl.textContent = "🔧 Edycja sieci dróg";
        Utils.hide(saveBtn);
      } else if (mode === "show_route") {
        const fromText = data?.from || "?";
        const toText = data?.to || "?";
        if (titleEl) titleEl.textContent = `📍 Trasa: ${fromText} ➡️ ${toText}`;
        Utils.hide(saveBtn);
        this.routeFrom = data?.from;
        this.routeTo = data?.to;
      } else {
        if (titleEl) titleEl.textContent = "🗺️ Mapa Zakładu";
        Utils.hide(saveBtn);
      }

      this.showLoading();
      Modal.open("modal-map");

      this.showLoading();
      Modal.open("modal-map");

      // FIX MOBILE SAVE BUTTON
      // Wait for modal to render then bind
      setTimeout(() => {
         this.bindSaveButton();
      }, 200);

      // Pobierz sieć dróg jeśli potrzebna
      if (mode === "edit_network" || mode === "show_route") {
        try {
          const network = await API.getRoadNetwork();
          this.nodes = network.nodes || [];
          this.connections = network.connections || [];
        } catch (e) {
          console.error(e);
        }
      }

      // Czekaj na render modala
      await new Promise((r) => setTimeout(r, 150));

      this.initializeMap();
      console.groupEnd();
    },

    initializeMap() {
      const container = document.getElementById("map-container");
      // Pobierz URL z ukrytego obrazka lub hardcoded
      let mapUrl = "img/mapa.webp";
      const existingImg = document.getElementById("facility-map");
      if (existingImg && existingImg.getAttribute("data-src")) {
        mapUrl = existingImg.getAttribute("data-src").split("?")[0];
      }

      console.log(`🗺️ initializeMap: Start. Container:`, container);

      // 1. Wyczyść kontener (Leaflet potrzebuje pustego diva)
      if (this.map) {
        console.log("♻️ Removing existing map instance");
        this.map.remove();
        this.map = null;
      }
      container.replaceChildren();

      // 2. Preload obrazka żeby znać wymiary
      console.log(`🖼️ Loading map image: ${mapUrl}`);
      const img = new Image();
      img.onload = () => {
        console.log(
          `✅ Map image loaded! Size: ${img.naturalWidth}x${img.naturalHeight}`,
        );
        this.mapWidth = img.naturalWidth;
        this.mapHeight = img.naturalHeight;
        this.initLeaflet(container, mapUrl);
      };
      img.onerror = (err) => {
        console.error("❌ Map image load FAILED:", err, mapUrl);
        // Fallback do png
        if (mapUrl.endsWith(".webp")) {
          console.warn("⚠️ Falling back to PNG...");
          img.src = "img/mapa.png";
          mapUrl = "img/mapa.png";
        } else {
          Toast.error("Błąd ładowania mapy");
          this.hideLoading();
        }
      };
      // Cache bust
      img.src = `${mapUrl}?t=${Date.now()}`;
    },

    initLeaflet(container, mapUrl) {
      console.log(
        "🍃 initLeaflet called with:",
        mapUrl,
        this.mapWidth,
        this.mapHeight,
      );

      // 3. Oblicz bounds: [[0,0], [height, width]]
      // W CRS.Simple Y rośnie w GÓRĘ. Pixel Y rośnie w DÓŁ.

      const bounds = [
        [0, 0],
        [this.mapHeight, this.mapWidth],
      ];

      this.map = L.map(container, {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: false, // Disable default top-left buttons
        maxBounds: bounds, // Restrict panning
        maxBoundsViscosity: 1.0, // Bouncy hard edge
        bounceAtZoomLimits: false, // Disable rubber-banding on minZoom
      });
      console.log("🍃 Leaflet map instance created");

      this.imageOverlay = L.imageOverlay(mapUrl, bounds).addTo(this.map);

      // Calculate minZoom to fit the map exactly within container
      // This prevents zooming out into the void
      const fitZoom = this.map.getBoundsZoom(bounds);

      // Update map settings
      this.map.setMinZoom(fitZoom);
      this.map.setMaxBounds(bounds);

      // Initial fit
      this.map.fitBounds(bounds);

      console.log(
        `🍃 Leaflet configured: ImageOverlay added, minZoom=${fitZoom}`,
      );

      // Layers
      this.markersLayer = L.layerGroup().addTo(this.map);
      this.routeLayer = L.layerGroup().addTo(this.map);

      // Eventy
      this.map.on("click", (e) => this.onMapClick(e));

      // Renderuj w każdym trybie, bo toolbar decyduje co pokazać (np. przycisk Edytuj w trybie View)
      this.renderNetworkToolbar();

      // Renderuj sieć jeśli w edycji
      if (this.mode === "edit_network") {
        this.renderNetwork();
      }

      // Renderuj pinezki
      this.renderPins();

      // Renderuj kontrolki (Zoom, Reset)
      this.renderControls();

      // Jeśli mamy tempCoords (Pick Mode), dodaj marker
      if (this.mode === "pick" && this.tempCoords) {
        this.renderTempPin(this.tempCoords.x, this.tempCoords.y);
      }

      // Jeśli Show Route
      if (this.mode === "show_route" && this.routeFrom && this.routeTo) {
        if (this.calculateRoute)
          this.calculateRoute(this.routeFrom, this.routeTo);
      }

      // Smooth Fade-In effect
      setTimeout(() => {
        container.classList.add("loaded");
        this.hideLoading();
      }, 300); // Small delay to ensure rendering frames are ready
    },

    // Konwersja Pixeli (Top-Left) na Leaflet (Y-Up)
    toLeaflet(x, y) {
      return [this.mapHeight - y, x];
    },
    // Konwersja Leaflet na Pixele
    toPixels(latlng) {
      return { x: latlng.lng, y: this.mapHeight - latlng.lat };
    },

    // NEW: Percentage helpers for compatibility with backend data
    percentToLeaflet(pctX, pctY) {
      const pxX = (pctX / 100) * this.mapWidth;
      const pxY = (pctY / 100) * this.mapHeight;
      return this.toLeaflet(pxX, pxY);
    },

    leafletToPercent(latlng) {
      const { x, y } = this.toPixels(latlng);
      return {
        x: (Number(x) / this.mapWidth) * 100,
        y: (Number(y) / this.mapHeight) * 100,
      };
    },

    renderPins() {
      this.markersLayer.clearLayers();

      const createIcon = (color, label, type, extraStyle = '', symbolOverride = null) => {
        // Adjust style based on type
        const isDept = type === 'department';
        const wrapperClass = isDept ? 'pin-dept' : '';
        // If symbolOverride is provided (e.g. "A" or "B"), use it. Otherwise default to icon.
        const iconChar = symbolOverride || (isDept ? '🏢' : '📍');
        
        return L.divIcon({
          className: 'custom-pin-icon',
          html: `
            <div class="map-pin ${wrapperClass}" style="position: relative; transform: none; left: 0; top: 0; ${extraStyle}">
              <div class="pin-icon-wrapper" style="background-color: ${color};">
                <span style="${symbolOverride ? 'font-weight:bold; font-family:sans-serif;' : ''}">${iconChar}</span>
              </div>
              <div class="pin-label">${label}</div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 24], // Adjusted to move visual pin down
        });
      };

      // Renderuj lokalizacje
      [...state.locations, ...state.departments].forEach((loc) => {
        if (loc.map_x != null && loc.map_y != null) {
          let color =
            loc.type === "location" ? "var(--primary)" : "var(--accent)";

          // Check if we are in route mode to dim unrelated pins
          let dimStyle = "";
          if (
            (this.mode === "show_route" || this.mode === "view_task") &&
            this.routeFrom &&
            this.routeTo
          ) {
            if (loc.name !== this.routeFrom && loc.name !== this.routeTo) {
              // Dim this pin
              dimStyle =
                "opacity: 0.3; filter: grayscale(100%); pointer-events: none;";
            } else {
              // Highlight this pin
              color = "var(--success)";
              dimStyle = "z-index: 1000 !important; transform: scale(1.2);";
            }
          }

          // NEW: Custom Logic for A/B pins in Show Route mode
          // Pin Label stays as Location Name (loc.name)
          // Pin Icon becomes "A" or "B"
          let symbolOverride = null;
          let isRoutePin = false;

          if ((this.mode === 'show_route') && this.routeFrom && this.routeTo) {
             if (loc.name === this.routeFrom) {
                 symbolOverride = "A";
                 isRoutePin = true;
             } else if (loc.name === this.routeTo) {
                 symbolOverride = "B";
                 isRoutePin = true;
             }
          }

          // FIX: Use percentToLeaflet
          const marker = L.marker(this.percentToLeaflet(loc.map_x, loc.map_y), {
              icon: createIcon(color, loc.name, loc.type, dimStyle, symbolOverride),
              zIndexOffset: isRoutePin ? 1000 : 0
          });

          // Add click handler (e.g., for routing or info)
          marker.on("click", () => {
            if (this.mode === "show_route") {
              // Logic to select route points could go here
            }
          });
          marker.addTo(this.markersLayer);
        }
      });
    },

    renderTempPin(x, y) {
      if (this.tempMarker) this.tempMarker.remove();

      const icon = L.divIcon({
        className: "temp-pin-icon",
        html: `
            <div class="map-pin pin-temp" style="position: relative; transform: none; left: 0; top: 0;">
              <div class="pin-icon-wrapper">
                <span>📍</span>
              </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 24],
      });

      // FIX: Use percentToLeaflet (x,y are %)
      this.tempMarker = L.marker(this.percentToLeaflet(x, y), {
        icon: icon,
        draggable: true,
      }).addTo(this.map);

      this.tempMarker.on("dragend", (e) => {
        // Convert back to % on drag
        const pos = this.leafletToPercent(e.target.getLatLng());
        this.tempCoords = pos;
        const saveBtn = Utils.$("#map-save-btn");
        if (saveBtn) saveBtn.disabled = false;
      });
    },

    onMapClick(e) {
      if (this.mode === "pick") {
        // FIX: Convert to %
        const { x, y } = this.leafletToPercent(e.latlng);
        this.tempCoords = { x, y };
        this.renderTempPin(x, y);
        const saveBtn = Utils.$("#map-save-btn");
        if (saveBtn) saveBtn.disabled = false;
      } else if (this.mode === "edit_network") {
        // FIX: Convert to %
        const { x, y } = this.leafletToPercent(e.latlng);
        this.handleNetworkClick(x, y);
      }
    },

    showLoading() {
      const loader = Utils.$(".screen .loading-container");
      if (loader) loader.classList.add("active");
    },
    hideLoading() {
      const loader = Utils.$(".screen .loading-container");
      if (loader) loader.classList.remove("active");
    },

    // LEAFLET DOES NOT USE DRAW
    draw() {
      // No-op
    },

    // --- NETWORK & ROUTING (Simplified adapter) ---
    renderNetwork() {
      // Rysowanie węzłów i połączeń używając L.circleMarker i L.polyline
      if (!this.map) return;

      this.routeLayer.clearLayers();

      this.connections.forEach((conn) => {
        const n1 = this.nodes.find((n) => n.id === conn.from);
        const n2 = this.nodes.find((n) => n.id === conn.to);
        if (n1 && n2) {
          // FIX: Use percentToLeaflet
          L.polyline(
            [
              this.percentToLeaflet(n1.x, n1.y),
              this.percentToLeaflet(n2.x, n2.y),
            ],
            { color: "blue", weight: 2 },
          ).addTo(this.routeLayer);
        }
      });

      this.nodes.forEach((node) => {
        const color = this.selectedNodeId === node.id ? "red" : "blue";
        // FIX: Use percentToLeaflet
        L.circleMarker(this.percentToLeaflet(node.x, node.y), {
          radius: 5,
          color: color,
          fillColor: color,
          fillOpacity: 0.8,
        }).addTo(this.routeLayer);
      });
    },

    handleNetworkClick(x, y) {
      // Proste znajdowanie najbliższego węzła
      // NOTA: x, y są TERAZ w procentach. Threshold też musi być w %.
      const threshold = 2; // 2% szerokości mapy

      // Calculate aspect ratio correction for distance?
      // Simple Euclidean on % works OK for selecting.

      const clickedNode = this.nodes.find((n) => {
        const dist = Math.hypot(n.x - x, n.y - y);
        return dist < threshold;
      });

      if (clickedNode) {
        if (this.selectedNodeId === null) {
          this.selectedNodeId = clickedNode.id;
        } else {
          if (this.selectedNodeId !== clickedNode.id) {
            this.connections.push({
              from: this.selectedNodeId,
              to: clickedNode.id,
            });
            API.saveRoadNetwork({
              nodes: this.nodes,
              connections: this.connections,
            });
            this.selectedNodeId = null;
          }
        }
      } else {
        const newNode = {
          id: Date.now(),
          x: x, // Percent
          y: y, // Percent
        };
        this.nodes.push(newNode);
        if (this.selectedNodeId) {
          this.connections.push({
            from: this.selectedNodeId,
            to: newNode.id,
          });
          this.selectedNodeId = null;
        }
        API.saveRoadNetwork({
          nodes: this.nodes,
          connections: this.connections,
        });
      }
      this.renderNetwork();
    },

    async saveNetwork() {
      try {
        await API.saveRoadNetwork({
          nodes: this.nodes,
          connections: this.connections,
        });
        Toast.success("200 OK");
        this.mode = "view";
        this.renderNetwork();
        this.renderNetworkToolbar(); // Restore toolbar
      } catch (e) {
        Toast.error("Błąd zapisu");
      }
    },

    clearNetwork() {
      if (confirm("Czy na pewno usunąć całą sieć dróg?")) {
        this.nodes = [];
        this.connections = [];
        this.renderNetwork();
      }
    },

    // --- ALGORYTM DIJKSTRA ---
    calculateRoute(startName, endName) {
      console.log("Calculating route...", startName, endName);

      const allLocs = [...state.locations, ...state.departments];
      const startLoc = allLocs.find((l) => l.name === startName);
      const endLoc = allLocs.find((l) => l.name === endName);

      if (!startLoc?.map_x || !endLoc?.map_x) {
        Toast.warning("Brak współrzędnych dla lokalizacji");
        return;
      }

      this.routeLayer.clearLayers();

      // 1. Znajdź najbliższe węzły sieci dla startu i końca
      // map_x/y are %
      const startNode = this.findNearestNode(startLoc.map_x, startLoc.map_y);
      const endNode = this.findNearestNode(endLoc.map_x, endLoc.map_y);

      if (!startNode || !endNode) {
        // Brak sieci? Rysuj linię prostą
        console.log("⚠️ No road network - drawing straight line");
        // FIX: Use percentToLeaflet
        L.polyline(
          [
            this.percentToLeaflet(startLoc.map_x, startLoc.map_y),
            this.percentToLeaflet(endLoc.map_x, endLoc.map_y),
          ],
          { color: "blue", dashArray: "10, 10", weight: 3 },
        ).addTo(this.routeLayer);
        return;
      }

      // 2. Uruchom Dijkstrę
      let path = null;
      try {
        if (typeof PriorityQueue === "undefined") {
          console.error("PriorityQueue missing!");
        } else {
          path = this.runDijkstra(startNode, endNode);
        }
      } catch (e) {
        console.error("Dijkstra error:", e);
      }

      if (path && path.length > 0) {
        // Found valid network path
        const latlngs = [
          this.percentToLeaflet(startLoc.map_x, startLoc.map_y),
          ...path.map((n) => this.percentToLeaflet(n.x, n.y)),
          this.percentToLeaflet(endLoc.map_x, endLoc.map_y),
        ];

        L.polyline(latlngs, {
          color: "#00008b", // Very Dark Blue
          weight: 5,
          opacity: 0.9,
        }).addTo(this.routeLayer);

        // Add distance label?
        const totalDist = path.length * 5; // Rough estimate
        // Toast.info(`Znaleziono trasę`);
      } else {
        // Fallback: Straight line (dashed)
        console.warn("⚠️ No path found - fallback straight line");

        L.polyline(
          [
            this.percentToLeaflet(startLoc.map_x, startLoc.map_y),
            this.percentToLeaflet(endLoc.map_x, endLoc.map_y),
          ],
          { color: "#ff9500", dashArray: "10, 10", weight: 3, opacity: 0.6 },
        ).addTo(this.routeLayer);

        if (!path)
          Toast.warning("Brak połączenia w sieci dróg - pokazuję linię prostą");
      }
    },

    findNearestNode(x, y) {
      if (this.nodes.length === 0) return null;
      let nearest = null;
      let minDist = Infinity;
      this.nodes.forEach((n) => {
        // Simple dist in % space
        const dx = n.x - x;
        const dy = n.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = n;
        }
      });
      if (minDist > 15) return null; // Increased threshold to 15%
      return nearest;
    },

    runDijkstra(startNode, endNode) {
      const graph = {};
      this.nodes.forEach((n) => (graph[n.id] = []));
      this.connections.forEach((c) => {
        const n1 = this.nodes.find((n) => n.id === c.from);
        const n2 = this.nodes.find((n) => n.id === c.to);
        if (n1 && n2) {
          // Distance in percentage units is fine for graph weights
          const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y);
          if (!graph[c.from]) graph[c.from] = [];
          if (!graph[c.to]) graph[c.to] = [];
          graph[c.from].push({ node: c.to, weight: dist });
          graph[c.to].push({ node: c.from, weight: dist });
        }
      });

      const distances = {};
      const previous = {};
      const pq = new PriorityQueue();

      this.nodes.forEach((n) => {
        distances[n.id] = Infinity;
        previous[n.id] = null;
      });
      distances[startNode.id] = 0;
      pq.enqueue(startNode.id, 0);

      while (!pq.isEmpty()) {
        const { element: uId } = pq.dequeue();
        if (uId === endNode.id) break;

        if (graph[uId]) {
          graph[uId].forEach((neighbor) => {
            const alt = distances[uId] + neighbor.weight;
            if (alt < distances[neighbor.node]) {
              distances[neighbor.node] = alt;
              previous[neighbor.node] = uId;
              pq.enqueue(neighbor.node, alt);
            }
          });
        }
      }

      const path = [];
      let current = endNode.id;
      if (previous[current] || current === startNode.id) {
        while (current) {
          const n = this.nodes.find((nod) => nod.id === current);
          if (n) path.unshift(n);
          current = previous[current];
        }
        return path;
      }
      return null;
    },

    renderControls() {
      const wrapper = Utils.$(".map-wrapper");
      let controls = wrapper.querySelector(".map-controls");
      if (!controls) {
        controls = document.createElement("div");
        controls.className = "map-controls";
        wrapper.appendChild(controls);
      }

      controls.replaceChildren(
        Utils.el("button", {
          className: "btn-icon map-btn",
          onclick: () => this.map.zoomIn()
        }, "➕"),
        Utils.el("button", {
          className: "btn-icon map-btn",
          onclick: () => this.map.zoomOut()
        }, "➖"),
        Utils.el("button", {
          className: "btn-icon map-btn",
          onclick: () => this.resetView()
        }, "🔄")
      );
    },

    resetView() {
      if (this.map) {
        const bounds = [
          [0, 0],
          [this.mapHeight, this.mapWidth],
        ];
        this.map.fitBounds(bounds);
      }
    },

    async savePickedLocation() {
      if (!this.tempCoords) {
           Toast.error("Nie wybrano lokalizacji na mapie");
           return;
      }

      try {
        // CASE 1: "PICK" MODE (Adding new location / editing form fields)
        // This is used when identifying coordinates for a form input (e.g. Add Location)
        if (this.mode === "pick") {
       
          const inputX = Utils.$("#location-map-x");
          const inputY = Utils.$("#location-map-y");

          if (inputX && inputY) {
            inputX.value = this.tempCoords.x;
            inputY.value = this.tempCoords.y;
            
            // Close the map modal
            Modal.close("modal-map");
            
            // Ensure the location modal is visible (it might be behind)
            Modal.open("modal-location");
            
            Toast.info("Współrzędne zapisane w formularzu.");
            return;
          } else {
             console.error("Inputs #location-map-x/y not found in pick mode");
             Toast.error("Błąd: Nie znaleziono formularza");
             return;
          }
        }

        // CASE 2: DIRECT UPDATE (Editing existing location via map interaction)
        // Only if we have a target ID
        if (!this.targetLocationId) {
             // If we are here, we are not in pick mode, but have no ID.
             // This suggests a logic error or missing context.
             console.error("No targetLocationId for direct update");
             return;
        }

        const payload = {
          map_x: this.tempCoords.x,
          map_y: this.tempCoords.y,
        };

        // Determine if target is location or department
        const allLocs = [...state.locations, ...state.departments];
        const target = allLocs.find((l) => l.id == this.targetLocationId);

        if (!target) {
          console.error("Target location not found:", this.targetLocationId);
          return;
        }

        await API.updateLocation(target.id, payload);

        Toast.success("Lokalizacja zaktualizowana");

        // Update local state immediately
        target.map_x = this.tempCoords.x;
        target.map_y = this.tempCoords.y;
        
        // Refresh map to show new position
        this.renderPins();
        
        // Close modal
        Modal.close("modal-map");

      } catch (e) {
        console.error(e);
        Toast.error("Błąd zapisu lokalizacji");
      }
    },



    // Fix for Mobile: Explicitly bind touch event if simple onclick fails
    bindSaveButton() {
       const btn = Utils.$("#map-save-btn");
       if (btn) {
           // Remove old listeners to be safe (cloning is a cheap way or just careful binding)
           const newBtn = btn.cloneNode(true);
           if (btn.parentNode) btn.parentNode.replaceChild(newBtn, btn);
           
           const handler = (e) => {
               e.preventDefault();
               e.stopPropagation(); // Stop map click through
               this.savePickedLocation();
           };
           
           newBtn.addEventListener("click", handler);
           newBtn.addEventListener("touchstart", handler, { passive: false });
       }
    },

    renderNetworkToolbar() {
      const wrapper = Utils.$(".map-wrapper");
      // Create toolbar only if it doesn't represent
      let toolbar = wrapper.querySelector("#network-toolbar");
      if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.id = "network-toolbar";
        toolbar.className = "map-draw-toolbar"; // Reuse existing css
        wrapper.appendChild(toolbar);
      }

      // Check permissions (Admin ID 1 only)
      if (state.currentUser?.id !== 1) {
        toolbar.classList.add("hidden");
        return;
      }

      // Hide in pick/route modes
      if (this.mode === "pick" || this.mode === "show_route") {
        toolbar.classList.add("hidden");
        return;
      }

      toolbar.classList.remove("hidden");

      toolbar.replaceChildren();
      if (this.mode === "view") {
        toolbar.appendChild(
          Utils.el("button", {
            className: "btn btn-primary btn-small",
            onclick: () => MapManager.open('edit_network')
          }, "🔧 Edytuj sieć dróg")
        );
      } else {
        toolbar.append(
          Utils.el("button", {
            className: "btn btn-success btn-small",
            onclick: () => MapManager.saveNetwork()
          }, "💾 Zapisz"),
          " ",
          Utils.el("button", {
            className: "btn btn-danger btn-small",
            onclick: () => MapManager.clearNetwork()
          }, "🗑️ Wyczyść"),
          " ",
          Utils.el("button", {
            className: "btn btn-secondary btn-small",
            onclick: () => MapManager.open('view')
          }, "❌ Anuluj")
        );
      }
    },
  };
  // =============================================
  // 13. AUTH
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
      select.replaceChildren(Utils.el("option", { value: "" }, "Wybierz użytkownika..."));

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
          .then((success) => {
            if (!success) return;
            
            setTimeout(async () => {
              // Sprawdzamy uprawnienia, ale login wywołujemy TYLKO jeśli 
              // nie zrobił tego już mechanizm wewnątrz requestPermission
              const hasPermission = await OneSignalService.requestPermission();
              console.log("🔔 OneSignal Permission:", hasPermission);
            }, 5000); // Wydłużono do 5s dla pewności stabilności SDK
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
      modal.classList.add("active");

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

          // Kontynuuj normalne logowanie (załaduj zadania, OneSignal itp.)
          await this.onLoginSuccess();
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
  // 14. DRIVER PANEL
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
        list.replaceChildren(Utils.getLoaderEl());
      }

      try {
        // 2. Pobieramy świeże dane w tle
        const serverTasks = await API.getTasks({
          date: targetDate,
          userId: state.currentUser.id,
        });

        // --- PREVENT FLICKERING (Merge Logic) ---
        const pendingStatusIds = Sync.queue
          .filter(a => a.name === "updateTaskStatus")
          .map(a => a.data.id);

        const mergedTasks = serverTasks.map(st => {
          if (pendingStatusIds.includes(st.id)) {
            const local = state.tasks.find(t => t.id === st.id);
            return local || st;
          }
          return st;
        });

        // 3. Sprawdzamy czy coś się zmieniło
        const hasChanged = JSON.stringify(mergedTasks) !== JSON.stringify(state.tasks);

        if (hasChanged || !silent) {
          state.tasks = mergedTasks;
          state.taskCache[targetDate] = [...state.tasks];
          localStorage.setItem(CONFIG.STORAGE_KEYS.TASKS, JSON.stringify(state.taskCache));
          
          this.sortTasks();
          this.updateStats();
          this.renderTasks();
        }

        // 4. Pre-fetch sąsiednich dat
        this.prefetchNeighboringDates();
      } catch (error) {
        console.error("Driver tasks load failed:", error);
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

      // NEW: Explicit Morning Reset Logic for Sorting
      // If no tasks are completed in the current list (Today), assume Driver is at "Parking TIR".
      // This overrides any stale localStorage data from previous days.
      let referenceLoc = localStorage.getItem("last_known_location");
      const referenceX = parseFloat(localStorage.getItem("last_known_x"));
      const referenceY = parseFloat(localStorage.getItem("last_known_y"));
      
      const hasCompletedTasksToday = state.tasks.some(t => t.status === "completed");
      
      if (!hasCompletedTasksToday) {
          referenceLoc = "Parking TIR";
          // Coordinates for Parking TIR would internally be handled by isNearby if needed,
          // or we rely on exact name match which is robust for "Parking TIR".
      }

      const getEffectiveStatus = (t) => {
        const isTrue = (v) => v === 1 || v === "1" || v === true || v === "true";
        if (isTrue(t.has_completed)) return "completed";
        if (isTrue(t.has_paused)) return "paused";
        return t.status;
      };

      state.tasks.sort((a, b) => {
        const statusA = getEffectiveStatus(a);
        const statusB = getEffectiveStatus(b);

        // 1. Zakończone ZAWSZE na samym dole
        if (statusA === "completed" && statusB !== "completed") return 1;
        if (statusB === "completed" && statusA !== "completed") return -1;

        // 2. MOJE zadania w trakcie na absolutną górę
        const isMyWorkingA = statusA === "in_progress" && a.assigned_to == state.currentUser.id;
        const isMyWorkingB = statusB === "in_progress" && b.assigned_to == state.currentUser.id;
        
        if (isMyWorkingA && !isMyWorkingB) return -1;
        if (isMyWorkingB && !isMyWorkingA) return 1;

        // 3. INNE zadania w trakcie pod moimi
        if (statusA === "in_progress" && statusB !== "in_progress") return -1;
        if (statusB === "in_progress" && statusA !== "in_progress") return 1;

        // 4. Priorytety (Pilne na górę w swoich grupach)
        const pScore = { high: 300, normal: 200, low: 100 };
        let scoreA = pScore[a.priority] || 200;
        let scoreB = pScore[b.priority] || 200;

        // Boost dla sugestii (ale nie przebijamy wyższego priorytetu)
        if (referenceLoc && statusA === "pending" && a.location_from) {
          if (a.location_from === referenceLoc || (hasCompletedTasksToday && !isNaN(referenceX) && Utils.isNearby(a.location_from, referenceLoc))) {
            scoreA += 50;
          }
        }
        if (referenceLoc && statusB === "pending" && b.location_from) {
          if (b.location_from === referenceLoc || (hasCompletedTasksToday && !isNaN(referenceX) && Utils.isNearby(b.location_from, referenceLoc))) {
            scoreB += 50;
          }
        }

        if (scoreA !== scoreB) return scoreB - scoreA;

        // 5. Fallback: Kolejność i czas
        const orderDiff = (a.sort_order || 999) - (b.sort_order || 999);
        if (orderDiff !== 0) return orderDiff;
        return (a.scheduled_time || "00:00").localeCompare(b.scheduled_time || "00:00");
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
        tasksList.replaceChildren();
        Utils.show(emptyState);
        return;
      }

      // SUGGESTION LOGIC: Find last completed task today to suggest next nearby task
      let lastCompletedLoc = null;
      // Get completed tasks for today, sorted by timestamp descending (if available) or by list order
      const completedToday = state.tasks.filter(
        (t) => t.status === "completed" || t.has_completed,
      );
      if (completedToday.length > 0) {
        // Assuming the last one in the list (or we could sort by update time if tracked)
        // For now, let's take the one that appears last in the list as "recenlty done"
        const lastTask = completedToday[completedToday.length - 1];

        if (lastTask.task_type === "transport")
          lastCompletedLoc = lastTask.location_to;
        else if (lastTask.task_type === "unloading")
          lastCompletedLoc = lastTask.department; // Unloading ends at dept
        // Loading ends at dept too? No, loading starts at dept?
        // Logic: where is the driver NOW?
        // Transport: at location_to
        // Unloading: at department
        // Loading: at... finishes at department? or finishes when loaded?
        // Usually loading task means "Go to Dept, Load". So you are at Dept.
        else if (lastTask.task_type === "loading")
          lastCompletedLoc = lastTask.department;
        else if (lastTask.task_type === "other")
          lastCompletedLoc = lastTask.location_to || lastTask.location_from;
      }

      // NEW: Morning Reset Logic
      // "Jeśli kierowca rozpoczyna dzień to rozpoczyna każdy dzień w parking TIR"
      if (!lastCompletedLoc && completedToday.length === 0) {
        lastCompletedLoc = "Parking TIR";
      }

      Utils.hide(emptyState);
      tasksList.replaceChildren(); // 100% zgodne z "NIGDY innerHTML"
      const fragment = document.createDocumentFragment();

      filteredTasks.forEach((task) => {
        // SUGGESTION CHECK
        let isSuggested = false;
        if (lastCompletedLoc && (task.status === "pending" || task.status === "paused")) {
          let startLoc = null;
          if (task.task_type === "transport") startLoc = task.location_from;
          else if (task.task_type === "loading") startLoc = task.department;
          else if (task.task_type === "unloading") startLoc = task.department;

          if (startLoc && Utils.isNearby(lastCompletedLoc, startLoc)) {
            isSuggested = true;
          }
        }
        
        fragment.appendChild(this.renderTaskCard(task, isSuggested));
      });

      tasksList.appendChild(fragment);
      this.attachTaskEventListeners();

      // 4. Pre-fetch sąsiednich dat w tle
      this.prefetchNeighboringDates();
    },

    renderTaskCard(task, isSuggested = false) {
      const card = document.createElement("div");
      card.className = `task-card priority-${task.priority} status-${task.status}`;
      
      const isParticipating = task.assigned_to === state.currentUser.id || 
                             (task.additional_drivers && task.additional_drivers.some(d => d.id === state.currentUser.id));
      
      if (task.status === "in_progress" && !isParticipating) {
        card.classList.add("task-locked");
      }
      if (isSuggested) card.classList.add("suggestion-ring");
      card.dataset.id = task.id;

      // 1. Status Indicator
      const statusIndicator = document.createElement("div");
      statusIndicator.className = `task-status-indicator status-${task.status}`;
      statusIndicator.textContent = `${Utils.getStatusIcon(task.status)} ${Utils.getStatusLabel(task.status)}`;
      card.appendChild(statusIndicator);

      // 2. Header
      const header = document.createElement("div");
      header.className = "task-header";
      
      const badges = document.createElement("div");
      badges.className = "task-badges";
      
      const typeBadge = document.createElement("span");
      typeBadge.className = `task-type-badge type-${task.task_type}`;
      typeBadge.textContent = `${Utils.getTaskTypeIcon(task.task_type)} ${Utils.getTaskTypeLabel(task.task_type)}`;
      
      const priorityBadge = document.createElement("span");
      priorityBadge.className = `task-priority-badge priority-${task.priority}`;
      priorityBadge.textContent = `${Utils.getPriorityIcon(task.priority)} ${Utils.getPriorityLabel(task.priority)}`;
      
      badges.appendChild(typeBadge);
      badges.appendChild(priorityBadge);
      header.appendChild(badges);

      if (task.creator_name) {
        const creatorInfo = document.createElement("div");
        creatorInfo.className = "task-creator-info";
        creatorInfo.style.fontSize = "0.8em";
        creatorInfo.style.color = "var(--text-secondary)";
        creatorInfo.style.marginTop = "4px";
        const strong = document.createElement("strong");
        strong.textContent = task.creator_name;
        creatorInfo.textContent = "Zlecił: ";
        creatorInfo.appendChild(strong);
        header.appendChild(creatorInfo);
      }
      card.appendChild(header);

      // 3. Body
      const body = document.createElement("div");
      body.className = "task-body";
      body.dataset.action = "details";
      body.dataset.id = task.id;

      const title = document.createElement("div");
      title.className = "task-title";
      title.textContent = task.description;
      body.appendChild(title);

      const description = document.createElement("div");
      description.className = "task-description";

      // Route
      if (task.location_from || task.location_to) {
        const route = document.createElement("div");
        route.className = "task-route";
        const from = document.createElement("span");
        from.textContent = `📍 ${task.location_from || "?"}`;
        const arrow = document.createElement("span");
        arrow.className = "task-route-arrow";
        arrow.textContent = "→";
        const to = document.createElement("span");
        to.textContent = `📍 ${task.location_to || "?"}`;
        route.append(from, arrow, to);
        description.appendChild(route);
      }

      // Department Summary (including container departments)
      const allDepts = new Set();
      if (task.department) allDepts.add(task.department);
      if (task.containers) {
        try {
          const containers = JSON.parse(task.containers);
          containers.forEach(c => { if(c.department) allDepts.add(c.department); });
        } catch(e) {}
      }

      if (allDepts.size > 0) {
        const deptDiv = document.createElement("div");
        deptDiv.className = "task-department";
        const icon = document.createElement("span");
        icon.textContent = "🏢 ";
        const text = document.createElement("span");
        text.textContent = Array.from(allDepts).join(", ");
        deptDiv.append(icon, text);
        description.appendChild(deptDiv);
      }

      // Material / Containers Count
      if (task.containers) {
        try {
          const containers = JSON.parse(task.containers);
          if (containers.length > 0) {
            const materialDiv = document.createElement("div");
            materialDiv.className = "task-material";
            materialDiv.style.color = "var(--primary)";
            materialDiv.style.fontWeight = "600";
            materialDiv.textContent = `📦 Kontenery: ${containers.length} szt.`;
            description.appendChild(materialDiv);
          }
        } catch (e) {}
      } else if (task.material) {
        const materialDiv = document.createElement("div");
        materialDiv.className = "task-material";
        materialDiv.textContent = `📦 ${task.material}`;
        description.appendChild(materialDiv);
      }

      body.appendChild(description);

      if (task.notes) {
        const notes = document.createElement("div");
        notes.className = "task-notes-preview";
        notes.textContent = `💬 ${task.notes}`;
        body.appendChild(notes);
      }
      card.appendChild(body);

      // 4. Footer
      const footer = document.createElement("div");
      footer.className = "task-footer";

      const meta = document.createElement("div");
      meta.className = "task-meta";

      if (task.scheduled_time) {
        const timeMeta = document.createElement("span");
        timeMeta.className = "task-meta-item";
        timeMeta.textContent = `🕐 ${Utils.formatTime(task.scheduled_time)}`;
        meta.appendChild(timeMeta);
      }

      const allDrivers = [];
      if (task.assigned_name) allDrivers.push(task.assigned_name);
      if (task.additional_drivers) task.additional_drivers.forEach(d => allDrivers.push(d.name));
      
      if (allDrivers.length > 0) {
        const driversMeta = document.createElement("span");
        driversMeta.className = "task-meta-item";
        const icon = allDrivers.length > 1 ? "👥 " : "👤 ";
        driversMeta.textContent = icon + allDrivers.join(", ");
        if (allDrivers.length > 1) {
          const badge = document.createElement("span");
          badge.className = "task-drivers-badge";
          badge.textContent = "Współdzielone";
          driversMeta.appendChild(badge);
        }
        meta.appendChild(driversMeta);
      }
      footer.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      if (task.status === "pending") {
        const btn = document.createElement("button");
        btn.className = "task-action-btn btn-start";
        btn.dataset.action = "start";
        btn.dataset.id = task.id;
        btn.textContent = "▶️ Rozpocznij";
        actions.appendChild(btn);
      } else if (task.status === "paused" || (task.status === "in_progress" && task.has_paused)) {
        const btn = document.createElement("button");
        btn.className = "task-action-btn btn-start";
        btn.dataset.action = "resume";
        btn.dataset.id = task.id;
        btn.textContent = "▶️ Wznów";
        actions.appendChild(btn);
      } else if (task.status === "in_progress") {
        if (isParticipating && !task.has_completed) {
          const btnPause = document.createElement("button");
          btnPause.className = "task-action-btn";
          btnPause.dataset.action = "pause"; btnPause.dataset.id = task.id; btnPause.textContent = "⏸️";
          const btnLog = document.createElement("button");
          btnLog.className = "task-action-btn";
          btnLog.dataset.action = "add-log"; btnLog.dataset.id = task.id; btnLog.textContent = "📝";
          const btnDone = document.createElement("button");
          btnDone.className = "task-action-btn btn-complete";
          btnDone.dataset.action = "complete"; btnDone.dataset.id = task.id; btnDone.textContent = "✅";
          actions.append(btnPause, btnLog, btnDone);
        } else {
          const btnJoin = document.createElement("button");
          btnJoin.className = "task-action-btn btn-join";
          btnJoin.dataset.action = "join"; btnJoin.dataset.id = task.id; btnJoin.textContent = "👥 Dołącz";
          actions.appendChild(btnJoin);
        }
      }
      footer.appendChild(actions);
      card.appendChild(footer);

      return card;
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
      
      const task = state.tasks.find((t) => t.id == taskId);
      
      Modal.confirm(
        "Rozpocząć zadanie?",
        `Czy chcesz rozpocząć zadanie: "${task?.description || ""}"?`,
        async () => {
          this._startingTask = true;
          // Safety timeout
          setTimeout(() => {
            this._startingTask = false;
          }, 2000);

          Notifications.markRelatedRead(taskId);

          Sync.enqueue(
            "updateTaskStatus",
            { id: taskId, status: "in_progress", userId: state.currentUser.id },
            () => {
              const taskObj = state.tasks.find((t) => t.id == taskId);
              if (taskObj) {
                taskObj.status = "in_progress";
                taskObj.assigned_to = state.currentUser.id;
                taskObj.assigned_name = state.currentUser.name;
                taskObj.has_paused = false;
                taskObj.has_completed = false;
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              this.setFilter("in_progress");
              Toast.success("Zadanie rozpoczęte! 🚀");
            },
          );
        },
        "Rozpocznij",
      );
    },

    async completeTask(taskId) {
      if (this._completingTask) return;
      this._completingTask = true;
      setTimeout(() => { this._completingTask = false; }, 2000);

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
                task.has_completed = true;
                task.has_paused = false;

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
              // this._completingTask = false; // Handled by timeout now to prevent double clicks entirely
            });
        },
        "Zakończ",
        false
      );
    },

    async pauseTask(taskId) {
      if (this._pausingTask) return; // Debounce
      this._pausingTask = true;
      // Reset flag after 2 seconds to allow retries if needed
      setTimeout(() => { this._pausingTask = false; }, 2000);
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
                task.has_paused = true;
                task.has_completed = false;
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              Toast.info("Zadanie wstrzymane ⏸️");
            },
          );
        },
        "Wstrzymaj",
        false
      );
    },

    async resumeTask(taskId) {
      if (this._resumingTask) return;
      
      const task = state.tasks.find((t) => t.id == taskId);
      
      Modal.confirm(
        "Wznowić zadanie?",
        `Czy chcesz wznowić zadanie: "${task?.description || ""}"?`,
        async () => {
          this._resumingTask = true;
          setTimeout(() => {
            this._resumingTask = false;
          }, 2000);

          Sync.enqueue(
            "updateTaskStatus",
            { id: taskId, status: "in_progress", userId: state.currentUser.id },
            () => {
              const taskObj = state.tasks.find((t) => t.id == taskId);
              if (taskObj) {
                taskObj.status = "in_progress";
                taskObj.assigned_to = state.currentUser.id;
                taskObj.assigned_name = state.currentUser.name;
                taskObj.has_paused = false;
                taskObj.has_completed = false;
              }
              this.sortTasks();
              this.updateStats();
              this.renderTasks();
              this.setFilter("in_progress");
              Toast.success("Zadanie wznowione! 🚛");
            },
          );
        },
        "Wznów",
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

      // 1. Nagłówek (Header)
      const header = Utils.el("div", { className: "task-detail-header" }, [
        Utils.el("span", { className: `task-type-badge type-${task.task_type}` }, [
          Utils.getTaskTypeIcon(task.task_type),
          " ",
          Utils.getTaskTypeLabel(task.task_type)
        ]),
        Utils.el("span", { className: `task-priority-badge priority-${task.priority}` }, [
          Utils.getPriorityIcon(task.priority),
          " ",
          Utils.getPriorityLabel(task.priority)
        ]),
        Utils.el("span", { className: `task-status-indicator status-${task.status}` }, [
          Utils.getStatusIcon(task.status),
          " ",
          Utils.getStatusLabel(task.status)
        ])
      ]);

      // 2. Tytuł (Title)
      const title = Utils.el("h3", { className: "task-detail-title" }, task.description);

      // 3. Szczegóły (Details rows)
      const detailRows = [];

      if (task.department) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Dział"),
          Utils.el("span", { className: "task-detail-value" }, `🏢 ${task.department}`)
        ]));
      }

      if (task.location_from) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Skąd"),
          Utils.el("span", { className: "task-detail-value" }, `📍 ${task.location_from}`)
        ]));
      }

      if (task.location_to) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Dokąd"),
          Utils.el("span", { className: "task-detail-value" }, `📍 ${task.location_to}`)
        ]));
      }

      // Przycisk mapy
      let routeFrom = null;
      let routeTo = null;
      const PARKING_TIR = "Parking TIR";

      if (task.location_from && task.location_to) {
        routeFrom = task.location_from;
        routeTo = task.location_to;
      } else if (task.task_type === "unloading" && task.department) {
        routeFrom = PARKING_TIR;
        routeTo = task.department;
      } else if (task.task_type === "loading" && task.department) {
        routeFrom = task.department;
        routeTo = PARKING_TIR;
      } else if (task.department && !task.location_from && !task.location_to) {
        routeFrom = PARKING_TIR;
        routeTo = task.department;
      }

      if (routeFrom && routeTo) {
        detailRows.push(Utils.el("div", { style: { textAlign: "center", margin: "15px 0" } }, [
          Utils.el("button", {
            className: "btn btn-secondary",
            style: { padding: "8px 20px", fontSize: "14px", maxWidth: "200px", width: "auto", display: "inline-block" },
            onclick: () => TransportTracker.MapManager.open('show_route', { from: routeFrom, to: routeTo })
          }, "🗺️ Pokaż trasę")
        ]));
      }

      if (task.material) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Materiał"),
          Utils.el("span", { className: "task-detail-value" }, `📦 ${task.material}`)
        ]));
      }

      detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
        Utils.el("span", { className: "task-detail-label" }, "Data"),
        Utils.el("span", { className: "task-detail-value" }, `📅 ${Utils.formatDate(task.scheduled_date)}`)
      ]));

      if (task.scheduled_time) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Godzina"),
          Utils.el("span", { className: "task-detail-value" }, `🕐 ${Utils.formatTime(task.scheduled_time)}`)
        ]));
      }

      if (task.assigned_name) {
        detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
          Utils.el("span", { className: "task-detail-label" }, "Przypisany"),
          Utils.el("span", { className: "task-detail-value" }, `👤 ${task.assigned_name}`)
        ]));
      }

      detailRows.push(Utils.el("div", { className: "task-detail-row" }, [
        Utils.el("span", { className: "task-detail-label" }, "Zlecił"),
        Utils.el("span", { className: "task-detail-value" }, `👔 ${task.creator_name || "System"}`)
      ]));

      const detailsSection = Utils.el("div", { className: "task-detail-section" }, [
        Utils.el("h4", {}, "Szczegóły"),
        ...detailRows
      ]);

      // 4. Uwagi dla kierowców
      const notesSection = task.notes ? Utils.el("div", { className: "task-detail-section" }, [
        Utils.el("h4", {}, "Uwagi dla kierowców"),
        Utils.el("div", { className: "task-notes-preview" }, [
          Utils.el("span", {}, "💬"),
          Utils.el("span", {}, task.notes)
        ])
      ]) : null;

      // 5. Historia i uwagi (Logs)
      let logsSection = null;
      if (task.logs && task.logs.length > 0) {
        logsSection = Utils.el("div", { className: "task-detail-section" }, [
          Utils.el("h4", {}, "Historia i uwagi"),
          Utils.el("div", { className: "task-logs-section" }, 
            task.logs.map((log) => {
              const delayLabel = log.log_type === "delay" ? [
                Utils.el("strong", {}, Utils.getDelayReasonLabel(log.delay_reason)),
                ` (${log.delay_minutes || 0} min)`,
                document.createElement("br")
              ] : [];

              return Utils.el("div", { className: `task-log-item log-${log.log_type}` }, [
                Utils.el("span", { className: "task-log-icon" }, Utils.getLogTypeIcon(log.log_type)),
                Utils.el("div", { className: "task-log-content" }, [
                  Utils.el("div", { className: "task-log-message" }, [
                    ...delayLabel,
                    log.message || ""
                  ]),
                  Utils.el("div", { className: "task-log-meta" }, [
                    `${log.user_name || "Nieznany"} • ${Utils.formatDate(log.created_at)} ${Utils.formatTime(log.created_at)}`
                  ])
                ])
              ]);
            })
          )
        ]);
      }

      // 6. Kontenery (Containers)
      let containersSection = null;
      if (task.containers) {
        const containerData = JSON.parse(task.containers);
        if (containerData.length > 0) {
          containersSection = Utils.el("div", { className: "task-detail-section", style: { marginBottom: "25px" } }, [
            Utils.el("h4", {}, `📦 Kontenery / Części (${containerData.length})`),
            Utils.el("div", {
              className: "containers-list-detail",
              style: { display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginTop: "12px" }
            }, containerData.map((c, i) => {
              return Utils.el("div", {
                className: "container-item-detail",
                style: { padding: "12px", background: "var(--bg-tertiary)", borderRadius: "var(--border-radius-lg)", border: "1px solid var(--border-color)" }
              }, [
                Utils.el("div", {
                  style: { fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "6px" }
                }, `Kontener ${i + 1}`),
                Utils.el("div", {
                  style: { fontWeight: "600", fontSize: "15px", color: "var(--text-primary)", marginBottom: "8px" }
                }, c.content),
                Utils.el("div", {
                  style: { display: "flex", gap: "15px", fontSize: "13px", color: "var(--text-secondary)" }
                }, [
                  Utils.el("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, `🏢 ${c.department || "Brak działu"}`),
                  Utils.el("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, `👤 ${c.driverName || "Dowolny kierowca"}`)
                ])
              ]);
            }))
          ]);
        }
      }

      // 7. Akcje (Actions)
      let actionsSection = null;
      if (isDriver) {
        if (task.status === "pending") {
          actionsSection = Utils.el("div", { className: "task-detail-actions" }, [
            Utils.el("button", {
              className: "btn btn-primary btn-block",
              onclick: () => {
                DriverPanel.startTask(task.id);
                Modal.close('modal-task-detail');
              }
            }, "▶️ Rozpocznij zadanie")
          ]);
        } else if (task.status === "in_progress" && isParticipating) {
          actionsSection = Utils.el("div", { className: "task-detail-actions" }, [
            Utils.el("button", {
              className: "btn btn-warning",
              onclick: () => {
                DriverPanel.pauseTask(task.id);
                Modal.close('modal-task-detail');
              }
            }, "⏸️ Wstrzymaj"),
            " ",
            Utils.el("button", {
              className: "btn btn-secondary",
              onclick: () => {
                DriverPanel.openLogModal(task.id);
                Modal.close('modal-task-detail');
              }
            }, "📝 Dodaj uwagę"),
            " ",
            Utils.el("button", {
              className: "btn btn-success",
              onclick: () => {
                DriverPanel.completeTask(task.id);
                Modal.close('modal-task-detail');
              }
            }, "✅ Zakończ")
          ]);
        } else if (task.status === "paused") {
          actionsSection = Utils.el("div", { className: "task-detail-actions" }, [
            Utils.el("button", {
              className: "btn btn-primary btn-block",
              onclick: () => {
                DriverPanel.resumeTask(task.id);
                Modal.close('modal-task-detail');
              }
            }, "▶️ Wznów zadanie")
          ]);
        } else if (task.status === "in_progress" && (task.has_completed || !isParticipating)) {
          actionsSection = Utils.el("div", { className: "task-detail-actions" }, [
            Utils.el("button", {
              className: "btn btn-primary btn-block",
              onclick: () => {
                DriverPanel.openJoinModal(task.id);
                Modal.close('modal-task-detail');
              }
            }, "👥 Dołącz do zadania")
          ]);
        }
      } else {
        actionsSection = Utils.el("div", { className: "task-detail-actions" }, [
          Utils.el("button", {
            className: "btn btn-secondary",
            onclick: () => {
              AdminPanel.openPriorityModal(task.id);
              Modal.close('modal-task-detail');
            }
          }, "🎯 Zmień priorytet"),
          " ",
          Utils.el("button", {
            className: "btn btn-primary",
            onclick: () => {
              AdminPanel.editTask(task.id);
              Modal.close('modal-task-detail');
            }
          }, "✏️ Edytuj")
        ]);
      }

      content.replaceChildren(
        header,
        title,
        detailsSection,
        notesSection,
        logsSection,
        containersSection,
        Utils.el("div", { style: { marginTop: "30px" } }, actionsSection)
      );
    },

    openMapForTask(taskId) {
      Modal.close("modal-task-detail");
      API.getTask(taskId).then((task) => {
        // Determine start/end from task data
        let from = task.location_from;
        let to = task.location_to;

        // Handle specialized types
        if (task.task_type === "unloading") {
          to = task.department;
        } else if (task.task_type === "loading") {
          from = task.department;
        }

        // Use the new standard method
        MapManager.open("show_route", { from, to });
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
  // 15. TASK FORM
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
      if (!task) return;
      
      Utils.$("#task-id").value = task.id;
      Utils.$("#task-date").value = task.scheduled_date;
      Utils.$("#task-time").value = task.scheduled_time || "";
      Utils.$("#task-notes").value = task.notes || "";
      Utils.$("#task-assigned").value = task.assigned_to || "";

      // Priority
      const priorityRadio = Utils.$(`input[name="task-priority"][value="${task.priority}"]`);
      if (priorityRadio) priorityRadio.checked = true;

      // Type
      const typeRadio = Utils.$(`input[name="task-type"][value="${task.task_type}"]`);
      if (typeRadio) {
        typeRadio.checked = true;
        this.toggleTaskFields(task.task_type);
      }

      if (task.task_type === "transport") {
        Utils.$("#transport-material").value = task.material || "";
        Utils.$("#transport-from").value = task.location_from || "";
        Utils.$("#transport-to").value = task.location_to || "";
      } else if (task.task_type === "unloading") {
        const mode = task.containers ? "containers" : "full";
        this.setMode(mode, "unloading");
        if (mode === "full") {
          Utils.$("#unloading-material").value = task.material || "";
          this.setMultiSelected("unloading-department-multi", task.department);
        } else {
          Utils.$("#unloading-customer").value = task.material || "";
          const containers = JSON.parse(task.containers || "[]");
          this.initContainers(containers, "unloading");
        }
      } else if (task.task_type === "loading") {
        const mode = task.containers ? "containers" : "full";
        this.setMode(mode, "loading");
        if (mode === "full") {
          Utils.$("#loading-material").value = task.material || "";
          Utils.$("#loading-department").value = task.department || "";
        } else {
          Utils.$("#loading-customer").value = task.material || "";
          const containers = JSON.parse(task.containers || "[]");
          this.initContainers(containers, "loading");
        }
      } else if (task.task_type === "other") {
        Utils.$("#other-description").value = task.description || "";
        Utils.$("#other-from").value = task.location_from || "";
        Utils.$("#other-to").value = task.location_to || "";
        if (Utils.$("#other-department")) {
          Utils.$("#other-department").value = task.department || "";
        }
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
      list.replaceChildren();
      if (containers && containers.length > 0) {
        containers.forEach((c) => this.addContainerRow(c));
      }
    },

    addContainerRow(data = null) {
      const list = Utils.$("#containers-list");
      if (!list) return; // Safety first
      const count = list.querySelectorAll(".container-row").length + 1;

      const contentVal = data ? data.content : "";
      const deptVal = data ? data.department : "";
      const driverVal = data ? data.driverId : "";

      // Opcje dla działu
      const deptOptions = [Utils.el("option", { value: "" }, "Wybierz dział...")];
      if (state.departments) {
        state.departments.forEach((d) => {
          deptOptions.push(
            Utils.el("option", { value: d.name, selected: d.name === deptVal }, d.name)
          );
        });
      }

      // Opcje dla kierowcy
      const driverOptions = [Utils.el("option", { value: "" }, "Dowolny kierowca...")];
      if (state.users) {
        state.users
          .filter((u) => u.role === "driver")
          .forEach((u) => {
            driverOptions.push(
              Utils.el("option", { value: u.id, selected: String(u.id) === String(driverVal) }, u.name)
            );
          });
      }

      const removeBtn = Utils.el("button", {
        type: "button",
        className: "remove-container-btn",
        style: { color: "var(--danger)", fontSize: "14px" },
        onclick: () => {
          div.remove();
          // Renumber remaining containers
          list.querySelectorAll(".container-row").forEach((row, idx) => {
            row.querySelector("span").textContent = `📦 Kontener ${idx + 1}`;
          });
        }
      }, "Usuń");

      const headerSpan = Utils.el("span", {}, `📦 Kontener ${count}`);

      const div = Utils.el("div", {
        className: "container-row",
        style: {
          background: "var(--bg-tertiary)",
          padding: "12px",
          borderRadius: "var(--border-radius-lg)",
          border: "1px solid var(--border-color)",
          position: "relative"
        }
      }, [
        Utils.el("div", {
          style: { fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px", display: "flex", justifyContent: "space-between" }
        }, [
          headerSpan,
          removeBtn
        ]),
        Utils.el("div", { style: { display: "grid", gridTemplateColumns: "1fr", gap: "8px" } }, [
          Utils.el("input", {
            type: "text",
            className: "container-content",
            placeholder: "Nazwa / Opis / Numer...",
            value: contentVal,
            style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }
          }),
          Utils.el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } }, [
            Utils.el("select", {
              className: "container-department",
              style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }
            }, deptOptions),
            Utils.el("select", {
              className: "container-driver",
              style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }
            }, driverOptions)
          ])
        ])
      ]);

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
          data.department = this.getMultiSelected("unloading-department-multi");
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
        const dept = this.getMultiSelected(`${type}-c${i}-dept-multi`);
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

    getMultiSelected(containerId) {
      const container = Utils.$(`#${containerId}`);
      if (!container) return "";
      return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value)
        .join(", ");
    },

    setMultiSelected(containerId, valueStr) {
      const container = Utils.$(`#${containerId}`);
      if (!container || !valueStr) return;
      const values = valueStr.split(", ").map(v => v.trim());
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = values.includes(cb.value);
        cb.parentElement.classList.toggle("selected", cb.checked);
      });
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
  // 16. ADMIN PANEL
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
        list.replaceChildren(Utils.getLoaderEl());
      }

      try {
        // 2. Pobieramy świeże dane w tle
        const serverTasks = await API.getTasks({
          date: targetDate,
          userId: state.currentUser.id,
        });

        // --- PREVENT FLICKERING (Merge Logic) ---
        const pendingStatusIds = Sync.queue
          .filter(a => a.name === "updateTaskStatus")
          .map(a => a.data.id);

        const mergedTasks = serverTasks.map(st => {
          if (pendingStatusIds.includes(st.id)) {
            const local = state.tasks.find(t => t.id === st.id);
            return local || st;
          }
          return st;
        });

        // 3. Sprawdzamy czy coś się zmieniło
        const hasChanged = JSON.stringify(mergedTasks) !== JSON.stringify(state.tasks);

        if (hasChanged || !silent) {
          state.tasks = mergedTasks;
          state.taskCache[targetDate] = [...state.tasks];
          localStorage.setItem(CONFIG.STORAGE_KEYS.TASKS, JSON.stringify(state.taskCache));
          
          this.sortTasks();
          this.updateStats();
          this.updateDateDisplay();
          this.renderTasks();
        }

        // 4. Pre-fetch sąsiednich dat
        this.prefetchNeighboringDates();
      } catch (error) {
        console.error("Admin tasks load failed:", error);
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
        btn.textContent = state.viewMode === "list" ? "📱" : "📝";
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
        tasksList.replaceChildren();
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      // Ensure view mode class is applied
      const btn = Utils.$("#admin-view-toggle-btn");
      if (state.viewMode === "list") {
        tasksList.classList.add("view-list");
        if (btn) {
          btn.textContent = "📱";
          btn.title = "Widok kafelkowy";
        }
      } else {
        tasksList.classList.remove("view-list");
        if (btn) {
          btn.textContent = "📝";
          btn.title = "Widok listy";
        }
      }

      tasksList.replaceChildren();
      const fragment = document.createDocumentFragment();
      filteredTasks.forEach((task, index) => {
        fragment.appendChild(this.renderTaskCard(task, index + 1));
      });
      tasksList.appendChild(fragment);

      this.attachTaskEventListeners();

      if (state.isReorderMode) {
        this.initDragAndDrop();
      }
    },

    renderTaskCard(task, order) {
      const isCompleted = task.status === "completed";
      const isInProgress = task.status === "in_progress";

      // Sprawdź czy użytkownik może edytować (admin główny lub twórca)
      const isMainAdmin = state.currentUser.id === 1;
      const isCreator = task.creator_id === state.currentUser.id;
      const canEdit = isMainAdmin || isCreator;

      // 1. Opis zadania (Route or Department)
      const taskDescriptionKids = [];
      if (task.task_type === "transport") {
        taskDescriptionKids.push(
          Utils.el("div", { className: "task-route" }, [
            Utils.el("span", {}, `📍 ${task.location_from || "?"}`),
            Utils.el("span", { className: "task-route-arrow" }, "→"),
            Utils.el("span", {}, `📍 ${task.location_to || "?"}`)
          ])
        );
      } else {
        if (task.department) {
          taskDescriptionKids.push(
            Utils.el("div", { className: "task-department" }, [
              Utils.el("span", {}, "🏢"),
              " ",
              Utils.el("span", {}, task.department)
            ])
          );
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
              taskDescriptionKids.push(
                Utils.el("div", { className: "task-department" }, [
                  Utils.el("span", {}, "🏢"),
                  " ",
                  Utils.el("span", { style: { fontWeight: "500" } }, depts.join(", "))
                ])
              );
            }
          } catch (e) {}
        }
      }

      // 2. Podsumowanie materiałów/kontenerów
      let materialKid = null;
      if (task.containers) {
        try {
          const containers = JSON.parse(task.containers);
          if (containers.length > 0) {
            materialKid = Utils.el("div", { className: "task-material", style: { color: "var(--primary)" } }, [
              Utils.el("span", {}, "📦"),
              " ",
              Utils.el("span", {}, `Kontenery: ${containers.length} szt.`)
            ]);
          }
        } catch (e) {}
      }

      if (!materialKid && task.material) {
        materialKid = Utils.el("div", { className: "task-material" }, [
          Utils.el("span", {}, "📦"),
          " ",
          Utils.el("span", {}, task.material)
        ]);
      }

      // 3. Kierowcy
      let driversKid = null;
      const allDrivers = [];
      if (task.assigned_name) allDrivers.push(task.assigned_name);
      if (task.additional_drivers) {
        task.additional_drivers.forEach((d) => allDrivers.push(d.name));
      }

      if (allDrivers.length > 0) {
        const driversList = allDrivers.join(", ");
        const icon = allDrivers.length > 1 ? "👥" : "👤";
        const label = allDrivers.length > 1 ? "Współdzielone" : "";

        driversKid = Utils.el("span", { className: "task-meta-item", title: driversList }, [
          Utils.el("span", {}, icon),
          " ",
          Utils.el("span", {}, driversList),
          label ? Utils.el("span", { className: "task-drivers-badge" }, label) : null
        ]);
      }

      // 4. Twórca
      const creatorKid = task.creator_name ? Utils.el("span", { className: "task-meta-item", title: "Utworzył" }, [
        Utils.el("span", {}, "✏️"),
        " ",
        Utils.el("span", {}, `${task.creator_name} (${Utils.formatTime(task.created_at)})`)
      ]) : null;

      // 5. Akcje (Actions buttons)
      let actionsSection = null;
      if (canEdit) {
        actionsSection = Utils.el("div", { className: "task-actions" }, [
          Utils.el("button", {
            className: "task-action-btn",
            dataset: { action: "edit", id: task.id },
            title: "Edytuj"
          }, "✏️"),
          " ",
          Utils.el("button", {
            className: "task-action-btn btn-delete",
            dataset: { action: "delete", id: task.id },
            title: "Usuń"
          }, "🗑️")
        ]);
      } else {
        actionsSection = Utils.el("div", { className: "task-actions" }, [
          Utils.el("span", { className: "text-muted", style: { fontSize: "12px" } }, "Brak uprawnień")
        ]);
      }

      // Drag Handle
      const dragHandle = (state.isReorderMode && canEdit) ? Utils.el("div", { className: "task-drag-handle" }, [
        document.createRange().createContextualFragment(`
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="2"/>
              <circle cx="15" cy="6" r="2"/>
              <circle cx="9" cy="12" r="2"/>
              <circle cx="15" cy="12" r="2"/>
              <circle cx="9" cy="18" r="2"/>
              <circle cx="15" cy="18" r="2"/>
          </svg>
        `)
      ]) : null;

      // Status indicator
      const statusIndicator = Utils.el("div", { className: `task-status-indicator status-${task.status}` }, [
        `${Utils.getStatusIcon(task.status)} ${Utils.getStatusLabel(task.status)}`
      ]);

      // Order, Type & Priority Badges
      const badges = Utils.el("div", { className: "task-badges" }, [
        Utils.el("span", { className: "task-order-badge" }, `#${order}`),
        " ",
        Utils.el("span", { className: `task-type-badge type-${task.task_type}` }, [
          `${Utils.getTaskTypeIcon(task.task_type)} ${Utils.getTaskTypeLabel(task.task_type)}`
        ]),
        " ",
        Utils.el("span", {
          className: `task-priority-badge priority-${task.priority}`,
          dataset: { action: canEdit ? "change-priority" : "", id: task.id },
          title: "Zmień priorytet",
          style: { cursor: canEdit ? "pointer" : "default" }
        }, [
          `${Utils.getPriorityIcon(task.priority)} ${Utils.getPriorityLabel(task.priority)}`
        ])
      ]);

      const header = Utils.el("div", { className: "task-header" }, badges);

      // Body Section
      const body = Utils.el("div", {
        className: "task-body",
        dataset: { action: "details", id: task.id }
      }, [
        Utils.el("div", { className: "task-title" }, task.description),
        Utils.el("div", { className: "task-description" }, [
          ...taskDescriptionKids,
          materialKid
        ])
      ]);

      // Footer Section
      const metaKids = [];
      if (task.scheduled_time) {
        metaKids.push(Utils.el("span", { className: "task-meta-item" }, [
          Utils.el("span", {}, "🕐"),
          " ",
          Utils.el("span", {}, Utils.formatTime(task.scheduled_time))
        ]));
      }
      if (driversKid) metaKids.push(driversKid);
      if (creatorKid) metaKids.push(creatorKid);

      const footer = Utils.el("div", { className: "task-footer" }, [
        Utils.el("div", { className: "task-meta" }, metaKids),
        actionsSection
      ]);

      // Main Card Div
      const card = Utils.el("div", {
        className: `task-card priority-${task.priority} status-${task.status}`,
        dataset: { id: task.id },
        draggable: (state.isReorderMode && !isCompleted && !isInProgress && canEdit) ? "true" : "false"
      }, [
        dragHandle,
        statusIndicator,
        header,
        body,
        footer
      ]);

      return card;
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
        toggleBtn.textContent = "❌ Anuluj";
        // Filter to show only pending tasks
        state.currentFilter = "pending";
        this.updateFilterButtons();
      } else {
        toggleBtn.replaceChildren(Utils.getReorderBtnContent());
      }

      this.renderTasks();
    },

    cancelReorder() {
      state.isReorderMode = false;
      Utils.$("#admin-tasks-list").classList.remove("reorder-mode");
      Utils.hide("#reorder-info");
      Utils.$("#toggle-reorder-btn").replaceChildren(Utils.getReorderBtnContent());
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
        Utils.$("#toggle-reorder-btn").replaceChildren(Utils.getReorderBtnContent());

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
        list.replaceChildren();
        Utils.show(emptyState);
        return;
      }

      Utils.hide(emptyState);

      const canManageUsers =
        state.currentUser.id === 1 || state.currentUser.perm_users;

      list.replaceChildren();

      state.users.forEach((user) => {
        let userActionsKid = null;
        if (canManageUsers) {
          userActionsKid = Utils.el("div", { className: "user-actions" }, [
            Utils.el("button", {
              className: "task-action-btn btn-edit",
              dataset: { action: "edit-user", id: user.id }
            }, "✏️"),
            " ",
            Utils.el("button", {
              className: "task-action-btn btn-delete",
              dataset: { action: "delete-user", id: user.id }
            }, "🗑️")
          ]);
        }

        const roleTextKids = [
          user.role === "admin" ? "👔 Kierownik" : "🚗 Kierowca",
          user.force_pin_change ? " " : null,
          user.force_pin_change ? Utils.el("span", { title: "Wymuszona zmiana PIN", style: { cursor: "help" } }, "🔑") : null
        ];

        if (user.role === "admin") {
          roleTextKids.push(
            Utils.el("br"),
            Utils.el("small", { style: { fontSize: "0.8em", opacity: "0.8" } }, [
              user.perm_reports ? "📊 " : "",
              user.perm_users ? "👥 " : "",
              user.perm_locations ? "📍" : ""
            ])
          );
        }

        const userCard = Utils.el("div", {
          className: "user-card",
          dataset: { id: user.id }
        }, [
          Utils.el("div", { className: "user-info" }, [
            Utils.el("div", { className: "user-details" }, [
              Utils.el("h3", {}, user.name),
              Utils.el("p", { className: "user-role text-muted" }, roleTextKids)
            ])
          ]),
          userActionsKid
        ]);

        list.appendChild(userCard);
      });

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

      locationsList.replaceChildren();
      departmentsList.replaceChildren();

      const createActionButtons = (id) => {
        if (!canManageLocations) return null;
        return Utils.el("div", { className: "location-actions" }, [
          Utils.el("button", {
            className: "task-action-btn btn-edit",
            dataset: { action: "edit-location", id: id }
          }, "✏️"),
          " ",
          Utils.el("button", {
            className: "task-action-btn btn-delete",
            dataset: { action: "delete-location", id: id }
          }, "🗑️")
        ]);
      };

      if (state.locations.length === 0) {
        locationsList.appendChild(Utils.el("p", { className: "text-muted text-center" }, "Brak lokalizacji"));
      } else {
        state.locations.forEach((loc) => {
          locationsList.appendChild(
            Utils.el("div", { className: "location-card", dataset: { id: loc.id } }, [
              Utils.el("div", { className: "location-info" }, [
                Utils.el("div", { className: "location-details" }, [
                  Utils.el("h3", {}, `📍 ${loc.name}`)
                ])
              ]),
              createActionButtons(loc.id)
            ])
          );
        });
      }

      if (state.departments.length === 0) {
        departmentsList.appendChild(Utils.el("p", { className: "text-muted text-center" }, "Brak działów"));
      } else {
        state.departments.forEach((dept) => {
          departmentsList.appendChild(
            Utils.el("div", { className: "location-card", dataset: { id: dept.id } }, [
              Utils.el("div", { className: "location-info" }, [
                Utils.el("div", { className: "location-details" }, [
                  Utils.el("h3", {}, `🏢 ${dept.name}`)
                ])
              ]),
              createActionButtons(dept.id)
            ])
          );
        });
      }

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

          // Render optimistically (shows item with tempId)
          this.renderLocations();
          DataLists.updateAll();
          
          Toast.success(
            type === "department" ? "Dział dodany" : "Lokalizacja dodana"
          );

          // 2. API Call
          const result = await API.createLocation({
            name,
            type,
            map_x: mapX,
            map_y: mapY,
          });

          // 3. Update ID from API
          // We need to find the item we just added and update its ID
          // The item reference 'newItem' is still valid!
          newItem.id = result.id;
          
          // Re-render to ensure buttons have the correct ID
          this.renderLocations();
          DataLists.updateAll();
          
          // Also refresh map pins to ensure they have the correct ID for click events
          if (MapManager && typeof MapManager.renderPins === 'function') {
              MapManager.renderPins();
          }

        }
      } catch (error) {
        console.error(error);
        Toast.error("Błąd zapisu (odśwież stronę)");
        // In a real app we would revert state here (remove the optimistic item)
        // But for now just error toast.
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
        Utils.$("#report-stats").replaceChildren(
          Utils.el("p", { className: "text-muted" }, "Błąd ładowania")
        );
      }
    },

    renderReports(data) {
      const container = Utils.$("#report-drivers-list");
      const statsContainer = Utils.$("#report-stats");

      if (!data || !data.drivers) {
        container.replaceChildren(
          Utils.el("p", { className: "text-muted text-center" }, "Brak danych")
        );
        return;
      }

      // Podsumowanie ogólne
      const totalTasks = data.drivers.reduce((sum, d) => sum + d.tasksCount, 0);
      const avgKpi = Math.round(
        data.drivers.reduce((sum, d) => sum + d.kpi, 0) /
          (data.drivers.length || 1),
      );

      statsContainer.replaceChildren(
        Utils.el("div", { className: "report-stat" }, [
          Utils.el("div", { className: "report-stat-value" }, totalTasks),
          Utils.el("div", { className: "report-stat-label" }, "Zadań")
        ]),
        Utils.el("div", { className: "report-stat" }, [
          Utils.el("div", { className: "report-stat-value" }, `${avgKpi}%`),
          Utils.el("div", { className: "report-stat-label" }, "Śr. KPI")
        ]),
        Utils.el("div", { className: "report-stat" }, [
          Utils.el("div", { className: "report-stat-value" }, data.drivers.length),
          Utils.el("div", { className: "report-stat-label" }, "Kierowców")
        ])
      );

      container.replaceChildren();
      data.drivers.forEach((driver, index) => {
        const kpiColor =
          driver.kpi >= 80 ? "high" : driver.kpi >= 50 ? "medium" : "low";

        // Generate timeline or bar chart
        let chartKid = null;
        if (driver.isSingleDay) {
          chartKid = this.generateTimeline(driver.timeline);
        } else {
          chartKid = this.generateBarChart(driver.timeline);
        }

        // Details toggle section
        let detailsSection = null;
        if (driver.details && driver.details.length > 0) {
          const detailsRows = driver.details.map((d) =>
            Utils.el("div", { className: `details-row type-${d.type}` }, [
              Utils.el("span", { className: "details-time" }, `${d.time} - ${d.endTime || "?"}`),
              Utils.el("span", { className: "details-desc" }, d.desc),
              Utils.el("span", { className: "details-duration" }, `${d.duration}m`)
            ])
          );

          const detailsContainer = Utils.el("div", {
            id: `details-${index}`,
            className: "details-container"
          }, detailsRows);

          const toggleBtn = Utils.el("button", {
            className: "btn btn-small btn-toggle-details",
            onclick: () => this.toggleDetails(index)
          }, "▼ Pokaż szczegóły");

          detailsSection = document.createDocumentFragment();
          detailsSection.append(toggleBtn, detailsContainer);
        }

        // Timeline labels (for single day view)
        let labelsKid = null;
        if (driver.isSingleDay) {
          labelsKid = Utils.el("div", { className: "timeline-labels" }, [
            Utils.el("span", {}, driver.workStart || "07:00"),
            Utils.el("span", {}, driver.workEnd || "15:00")
          ]);
        }

        // Timeline container element
        const timelineContainer = Utils.el("div", {
          className: `timeline-container ${driver.isSingleDay ? "" : "bar-chart"}`
        });
        if (!driver.isSingleDay) {
          timelineContainer.style.height = "150px";
          timelineContainer.style.overflowX = "auto";
          timelineContainer.style.overflowY = "hidden";
        }
        
        // Append chart elements
        if (chartKid) {
          if (chartKid instanceof DocumentFragment || chartKid instanceof HTMLElement) {
            timelineContainer.appendChild(chartKid);
          }
        }

        // Construct Driver Card
        const driverCard = Utils.el("div", { className: "report-driver-card" }, [
          // Header
          Utils.el("div", { className: "report-driver-header" }, [
            Utils.el("div", { className: "report-driver-info" }, [
              Utils.el("div", { className: "user-avatar" }, "🚗"),
              Utils.el("div", {}, [
                Utils.el("h3", {}, driver.name),
                Utils.el("span", { className: "text-muted", style: { fontSize: "12px" } }, `KPI: ${driver.kpi}%`)
              ])
            ]),
            Utils.el("div", { className: `report-driver-kpi ${kpiColor}` }, `${driver.kpi}%`)
          ]),

          // KPI grid
          Utils.el("div", { className: "kpi-grid" }, [
            Utils.el("div", { className: "kpi-box" }, [
              Utils.el("div", { className: "kpi-value" }, this.formatDuration(driver.workTime)),
              Utils.el("div", { className: "kpi-label" }, "Praca")
            ]),
            Utils.el("div", { className: "kpi-box" }, [
              Utils.el("div", { className: "kpi-value", style: { color: "var(--danger)" } }, this.formatDuration(driver.delayTime)),
              Utils.el("div", { className: "kpi-label" }, "Przestoje")
            ]),
            Utils.el("div", { className: "kpi-box" }, [
              Utils.el("div", { className: "kpi-value" }, driver.tasksCount),
              Utils.el("div", { className: "kpi-label" }, "Zadań")
            ])
          ]),

          // Chart & Details
          timelineContainer,
          labelsKid,
          detailsSection
        ]);

        container.appendChild(driverCard);
      });
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
      if (!days || days.length === 0) {
        return Utils.el("p", {
          className: "text-center text-muted",
          style: { padding: "20px" }
        }, "Brak danych");
      }

      const barElements = days.map((d) => {
        return Utils.el("div", {
          style: {
            flex: "1",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: "30px"
          }
        }, [
          Utils.el("div", {
            style: {
              fontSize: "10px",
              marginBottom: "4px",
              fontWeight: "bold"
            }
          }, this.formatDuration(d.minutes)),
          Utils.el("div", {
            style: {
              width: "100%",
              background: "var(--bg-tertiary)",
              height: "80px",
              borderRadius: "4px",
              position: "relative",
              overflow: "hidden"
            }
          }, [
            Utils.el("div", {
              title: Utils.formatDateShort(d.date),
              style: {
                position: "absolute",
                bottom: "0",
                left: "0",
                right: "0",
                height: `${d.percent}%`,
                background: "var(--primary)",
                transition: "height 0.3s"
              }
            })
          ]),
          Utils.el("div", {
            style: {
              fontSize: "9px",
              marginTop: "4px",
              color: "var(--text-secondary)",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%"
            }
          }, Utils.formatDateShort(d.date))
        ]);
      });

      return Utils.el("div", {
        style: {
          display: "flex",
          gap: "10px",
          height: "100%",
          alignItems: "flex-end",
          padding: "10px"
        }
      }, barElements);
    },

    generateTimeline(events) {
      if (!events || events.length === 0) return null;

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

      const fragment = document.createDocumentFragment();

      // Generowanie markerów godzin
      const markersContainer = Utils.el("div", { className: "timeline-markers" });
      for (let h = startHour; h <= endHour; h++) {
        const left = (((h - startHour) * 60) / totalMinutes) * 100;
        
        let labelNode = null;
        if (h % 2 === 0 || totalMinutes < 720) {
          labelNode = Utils.el("div", { className: "timeline-time" }, `${h}:00`);
        }

        const marker = Utils.el("div", {
          className: "timeline-marker",
          style: { left: `${left}%` }
        }, labelNode);

        markersContainer.appendChild(marker);
      }
      fragment.appendChild(markersContainer);

      // Renderowanie pasków
      rows.forEach((row, rowIndex) => {
        const height = 100 / Math.max(rows.length, 1);
        const top = rowIndex * height;

        row.forEach((event) => {
          const start = new Date(event.start);
          const end = new Date(event.end);

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
          if (width <= 0) return;

          const bar = Utils.el("div", {
            className: `timeline-bar ${event.type}`,
            dataset: {
              title: `${event.desc} (${Math.round(duration)} min)`
            },
            style: {
              left: `${left}%`,
              width: `${width}%`,
              height: `${height - 2}%`,
              top: `${top}%`
            }
          });

          fragment.appendChild(bar);
        });
      });

      return fragment;
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

      printable.replaceChildren();

      // Logo and header
      const printHeader = Utils.el("div", { className: "report-print-header" }, [
        Utils.el("div", { className: "report-print-logo" }, [
          Utils.el("span", {}, "🚛"),
          " ",
          Utils.el("span", {}, "Transport Tracker")
        ]),
        Utils.el("div", { className: "report-print-info" }, [
          Utils.el("strong", {}, "Data wygenerowania:"),
          ` ${new Date().toLocaleString("pl-PL")}`,
          Utils.el("br"),
          Utils.el("strong", {}, "Okres:"),
          ` ${periodLabel} ${subPeriod}`
        ])
      ]);

      const titleNode = Utils.el("h1", { className: "report-print-title" }, "Raport Pracy Kierowców");

      // Stats summaries
      const statsSummary1 = Utils.el("div", { className: "print-stats-summary", style: { marginBottom: "20px" } }, [
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Suma zadań"),
          Utils.el("span", { className: "print-stat-val" }, totalTasks)
        ]),
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Średnie KPI"),
          Utils.el("span", { className: "print-stat-val" }, `${avgKpi}%`)
        ]),
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Kierowcy"),
          Utils.el("span", { className: "print-stat-val" }, data.drivers.length)
        ])
      ]);

      const statsSummary2 = Utils.el("div", { className: "print-stats-summary" }, [
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Śr. Załadunek"),
          Utils.el("span", { className: "print-stat-val" }, `${gAvgLoad} min`)
        ]),
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Śr. Transport"),
          Utils.el("span", { className: "print-stat-val" }, `${gAvgTrans} min`)
        ]),
        Utils.el("div", { className: "print-stat-box" }, [
          Utils.el("span", { className: "print-stat-lab" }, "Śr. Rozładunek"),
          Utils.el("span", { className: "print-stat-val" }, `${gAvgUnload} min`)
        ])
      ]);

      printable.append(printHeader, titleNode, statsSummary1, statsSummary2);

      // Drivers sections
      data.drivers.forEach((driver) => {
        const rows = [];
        if (driver.details && driver.details.length > 0) {
          driver.details.forEach((d) => {
            rows.push(
              Utils.el("tr", {}, [
                Utils.el("td", {}, `${d.time} - ${d.endTime || "?"}`),
                Utils.el("td", {}, d.desc),
                Utils.el("td", {}, `${d.duration} min`)
              ])
            );
          });
        } else {
          rows.push(
            Utils.el("tr", {}, [
              Utils.el("td", { colSpan: 3, style: { textAlign: "center" } }, "Brak szczegółowych wpisów")
            ])
          );
        }

        const driverSection = Utils.el("div", { className: "print-driver-section" }, [
          Utils.el("div", { className: "print-driver-header" }, [
            Utils.el("span", {}, `👤 ${driver.name}`),
            " ",
            Utils.el("span", {}, `KPI: ${driver.kpi}% | Zadania: ${driver.tasksCount}`),
            " ",
            Utils.el("span", { style: { fontSize: "0.8em", marginLeft: "10px", opacity: "0.8" } }, `(Z: ${driver.avgLoad || 0}m, T: ${driver.avgTransport || 0}m, R: ${driver.avgUnload || 0}m)`)
          ]),
          Utils.el("table", { className: "print-table" }, [
            Utils.el("thead", {}, [
              Utils.el("tr", {}, [
                Utils.el("th", { style: { width: "120px" } }, "Czas"),
                Utils.el("th", {}, "Opis zadania / aktywności"),
                Utils.el("th", { style: { width: "80px" } }, "Czas trwania")
              ])
            ]),
            Utils.el("tbody", {}, rows)
          ])
        ]);

        printable.appendChild(driverSection);
      });

      // Footer
      const printFooter = Utils.el("div", { className: "print-footer" }, `© ${new Date().getFullYear()} Hemarpol Transport Tracker - Raport automatyczny`);
      printable.appendChild(printFooter);

      // Trigger print
      window.print();

      // Optional: clear after print to keep DOM lean
      setTimeout(() => {
        printable.replaceChildren();
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
  // 17. INIT
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

    // Upewnij się że Parking TIR istnieje (lokalizacja systemowa) - TYLKO JEDLI ZALOGOWANY
    if (state.currentUser) {
      await ensureParkingTIR();
    }

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
  // 18. ONESIGNAL SERVICE
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
      if (!this.initialized) return;
      
      // Prevent double login for the same user
      if (this._lastLoginId === userId) return;
      this._lastLoginId = userId;

      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          // OneSignal requires HTTPS (except for localhost)
          const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (!isSecure) {
             console.warn("⚠️ OneSignal: Login skipped due to insecure origin (HTTP)");
             return;
          }

          const permission = await OneSignal.Notifications.permissionNative;
          if (permission !== "granted") return;

          const pushSubscription = await OneSignal.User.PushSubscription.id;
          if (!pushSubscription) return;

          const externalId = String(userId);
          console.log("🔑 OneSignal: Attempting login for user", externalId);
          
          await OneSignal.login(externalId);

          await OneSignal.User.addTags({
            role: role,
            user_id: externalId,
            last_login: new Date().toISOString()
          });
          
          console.log("✅ OneSignal: Login successful");
        } catch (e) {
          // Silence the error if it's the known 'undefined' promise rejection from SDK
          if (e !== undefined) {
            console.error("❌ OneSignal Login Error:", e);
          }
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
  // 19. EXPORT
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
  // 20. URUCHOM APLIKACJĘ
  // =============================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
