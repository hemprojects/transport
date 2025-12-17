// =============================================
// TransportTracker - Aplikacja JavaScript
// Wersja 2.0 - Kompletna przebudowa
// =============================================

(function() {
    'use strict';

    // =============================================
    // 1. KONFIGURACJA
    // =============================================
    const CONFIG = {
        API_URL: '/api',
        NOTIFICATION_CHECK_INTERVAL: 20000,
        TOAST_DURATION: 4000,
        DATE_FORMAT: 'pl-PL',
        STORAGE_KEYS: {
            USER: 'tt_user',
            THEME: 'tt_theme'
        }
    };

    // =============================================
    // 2. STAN APLIKACJI
    // =============================================
    const state = {
        currentUser: null,
        currentScreen: 'loading',
        currentDate: new Date().toISOString().split('T')[0],
        currentFilter: 'all',
        currentTab: 'tasks',
        
        users: [],
        locations: [],
        departments: [],
        tasks: [],
        notifications: [],
        unreadNotifications: 0,
        
        isLoading: false,
        isReorderMode: false,
        theme: 'light',
        
        notificationInterval: null
    };

    // =============================================
    // 3. UTILS
    // =============================================
    const Utils = {
        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        },

        formatDateShort(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString(CONFIG.DATE_FORMAT, {
                day: 'numeric',
                month: 'short'
            });
        },

        formatTime(timeStr) {
            if (!timeStr) return '';
            return timeStr.substring(0, 5);
        },

        formatRelativeTime(dateTimeStr) {
            if (!dateTimeStr) return '';
            const date = new Date(dateTimeStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'przed chwilą';
            if (diffMins < 60) return `${diffMins} min temu`;
            if (diffHours < 24) return `${diffHours} godz. temu`;
            if (diffDays < 7) return `${diffDays} dni temu`;
            return this.formatDateShort(dateTimeStr.split('T')[0]);
        },

        getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
},

        addDays(dateStr, days) {
    const date = new Date(dateStr + 'T12:00:00');
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
},

        isToday(dateStr) {
            return dateStr === this.getToday();
        },

        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
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
            if (typeof element === 'string') element = this.$(element);
            if (element) element.classList.remove('hidden');
        },

        hide(element) {
            if (typeof element === 'string') element = this.$(element);
            if (element) element.classList.add('hidden');
        },

        toggle(element, show) {
            if (typeof element === 'string') element = this.$(element);
            if (element) element.classList.toggle('hidden', !show);
        },

        getTaskTypeLabel(type) {
            const labels = {
                'unloading': 'Rozładunek',
                'transport': 'Przewożenie',
                'loading': 'Załadunek'
            };
            return labels[type] || type;
        },

        getTaskTypeIcon(type) {
            const icons = {
                'unloading': '📥',
                'transport': '🚛',
                'loading': '📤'
            };
            return icons[type] || '📋';
        },

        getStatusLabel(status) {
            const labels = {
                'pending': 'Oczekuje',
                'in_progress': 'W trakcie',
                'completed': 'Zakończone',
                'cancelled': 'Anulowane'
            };
            return labels[status] || status;
        },

        getStatusIcon(status) {
            const icons = {
                'pending': '⏳',
                'in_progress': '🔄',
                'completed': '✅',
                'cancelled': '❌'
            };
            return icons[status] || '❓';
        },

        getPriorityLabel(priority) {
            const labels = {
                'high': 'Pilne',
                'normal': 'Normalne',
                'low': 'Niski'
            };
            return labels[priority] || priority;
        },

        getPriorityIcon(priority) {
            const icons = {
                'high': '🔴',
                'normal': '🟡',
                'low': '🟢'
            };
            return icons[priority] || '⚪';
        },

        getDelayReasonLabel(reason) {
            const labels = {
                'no_access': 'Brak dojazdu',
                'waiting': 'Oczekiwanie na załadunek/rozładunek',
                'traffic': 'Korki / utrudnienia',
                'equipment': 'Problem z sprzętem',
                'weather': 'Warunki pogodowe',
                'break': 'Przerwa',
                'other': 'Inny powód'
            };
            return labels[reason] || reason;
        },

        getLogTypeIcon(type) {
            const icons = {
                'note': '📝',
                'delay': '⏱️',
                'problem': '⚠️',
                'status_change': '🔄'
            };
            return icons[type] || '📋';
        },

        getPriorityOrder(priority) {
            const order = { 'high': 1, 'normal': 2, 'low': 3 };
            return order[priority] || 2;
        }
    };

    // =============================================
    // 4. API
    // =============================================
    const API = {
        async request(endpoint, options = {}) {
            const url = `${CONFIG.API_URL}${endpoint}`;
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };

            if (options.body && typeof options.body === 'object') {
                config.body = JSON.stringify(options.body);
            }

            try {
                const response = await fetch(url, config);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Wystąpił błąd');
                }

                return data;
            } catch (error) {
                console.error('API Error:', error);
                throw error;
            }
        },

        // AUTH
        async getUsers() {
            return await this.request('/users');
        },

        async login(userId, pin) {
            return await this.request('/auth/login', {
                method: 'POST',
                body: { userId: parseInt(userId), pin }
            });
        },

        // USERS
        async createUser(userData) {
            return await this.request('/users', {
                method: 'POST',
                body: userData
            });
        },

        async updateUser(id, userData) {
            return await this.request(`/users/${id}`, {
                method: 'PUT',
                body: userData
            });
        },

        async deleteUser(id) {
            return await this.request(`/users/${id}`, {
                method: 'DELETE'
            });
        },

        // LOCATIONS
        async getLocations() {
            return await this.request('/locations');
        },

        async createLocation(data) {
            return await this.request('/locations', {
                method: 'POST',
                body: data
            });
        },

        async deleteLocation(id) {
            return await this.request(`/locations/${id}`, {
                method: 'DELETE'
            });
        },

        // TASKS
        async getTasks(params = {}) {
            const queryParams = new URLSearchParams();
            if (params.date) queryParams.append('date', params.date);
            if (params.status) queryParams.append('status', params.status);
            if (params.userId) queryParams.append('userId', params.userId);
            
            const query = queryParams.toString();
            return await this.request(`/tasks${query ? '?' + query : ''}`);
        },

        async getTask(id) {
            return await this.request(`/tasks/${id}`);
        },

        async createTask(taskData) {
            return await this.request('/tasks', {
                method: 'POST',
                body: taskData
            });
        },

        async updateTask(id, taskData) {
            return await this.request(`/tasks/${id}`, {
                method: 'PUT',
                body: taskData
            });
        },

        async deleteTask(id) {
            return await this.request(`/tasks/${id}`, {
                method: 'DELETE'
            });
        },

        async updateTaskStatus(id, status, userId) {
            return await this.request(`/tasks/${id}/status`, {
                method: 'PUT',
                body: { status, userId }
            });
        },

        async joinTask(taskId, userId) {
            return await this.request(`/tasks/${taskId}/join`, {
                method: 'POST',
                body: { userId }
            });
        },

        async reorderTasks(taskIds) {
            return await this.request('/tasks/reorder', {
                method: 'POST',
                body: { tasks: taskIds }
            });
        },

        // TASK LOGS
        async createTaskLog(taskId, logData) {
            return await this.request(`/tasks/${taskId}/logs`, {
                method: 'POST',
                body: logData
            });
        },

        // NOTIFICATIONS
        async getNotifications(userId) {
            return await this.request(`/notifications/${userId}`);
        },

        async markNotificationRead(notificationId) {
            return await this.request(`/notifications/${notificationId}/read`, {
                method: 'POST'
            });
        },

        async markAllNotificationsRead(userId) {
            return await this.request(`/notifications/user/${userId}/read-all`, {
                method: 'POST'
            });
        },

        // REPORTS
        async getReports(period = 'week') {
            return await this.request(`/reports?period=${period}`);
        }
    };

    // =============================================
    // 5. TOAST
    // =============================================
    const Toast = {
        container: null,

        init() {
            this.container = Utils.$('#toast-container');
        },

        show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
            if (!this.container) this.init();

            const icons = {
                'success': '✓',
                'error': '✕',
                'warning': '⚠',
                'info': 'ℹ'
            };

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${icons[type] || icons.info}</span>
                <span class="toast-message">${Utils.escapeHtml(message)}</span>
                <button class="toast-close" aria-label="Zamknij">×</button>
            `;

            toast.querySelector('.toast-close').addEventListener('click', () => {
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
            toast.classList.add('toast-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        },

        success(message) { return this.show(message, 'success'); },
        error(message) { return this.show(message, 'error'); },
        warning(message) { return this.show(message, 'warning'); },
        info(message) { return this.show(message, 'info'); }
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
            document.body.style.overflow = 'hidden';

            setTimeout(() => {
                const firstInput = modal.querySelector('input:not([type="hidden"]):not([type="radio"]), select, textarea');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        close(modalId) {
            const modal = Utils.$(`#${modalId}`);
            if (!modal) return;

            Utils.hide(modal);
            this.openModals = this.openModals.filter(id => id !== modalId);

            if (this.openModals.length === 0) {
                document.body.style.overflow = '';
            }

            const form = modal.querySelector('form');
            if (form) form.reset();
        },

        closeAll() {
            [...this.openModals].forEach(id => this.close(id));
        },

        confirm(title, message, onConfirm, confirmText = 'Potwierdź', isDanger = true) {
            Utils.$('#confirm-title').textContent = title;
            Utils.$('#confirm-message').textContent = message;
            
            const confirmBtn = Utils.$('#confirm-action-btn');
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `btn ${isDanger ? 'btn-danger' : 'btn-primary'}`;
            
            const newBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
            
            newBtn.addEventListener('click', () => {
                Modal.close('modal-confirm');
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            });

            this.open('modal-confirm');
        },

        init() {
            Utils.$$('[data-close]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modalId = btn.getAttribute('data-close');
                    this.close(modalId);
                });
            });

            Utils.$$('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', () => {
                    const modal = overlay.closest('.modal');
                    if (modal) this.close(modal.id);
                });
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.openModals.length > 0) {
                    this.close(this.openModals[this.openModals.length - 1]);
                }
            });
        }
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
        this.set('light');
    }
},

        set(theme) {
            state.theme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
            this.updateButtons();
        },

        toggle() {
            const newTheme = state.theme === 'light' ? 'dark' : 'light';
            this.set(newTheme);
            Toast.info(newTheme === 'dark' ? 'Tryb ciemny włączony' : 'Tryb jasny włączony');
        },

        updateButtons() {
            const icon = state.theme === 'light' ? '🌙' : '☀️';
            const driverBtn = Utils.$('#driver-theme-btn');
            const adminBtn = Utils.$('#admin-theme-btn');
            if (driverBtn) driverBtn.textContent = icon;
            if (adminBtn) adminBtn.textContent = icon;
        },

        initEventListeners() {
            Utils.$('#driver-theme-btn')?.addEventListener('click', () => this.toggle());
            Utils.$('#admin-theme-btn')?.addEventListener('click', () => this.toggle());
        }
    };

    // =============================================
    // 8. SCREEN
    // =============================================
    const Screen = {
        show(screenId) {
            Utils.$$('.screen').forEach(screen => {
                screen.classList.remove('active');
            });

            const targetScreen = Utils.$(`#screen-${screenId}`);
            if (targetScreen) {
                targetScreen.classList.add('active');
                state.currentScreen = screenId;
            }
        }
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
                console.error('Failed to load notifications:', error);
            }
        },

        updateBadge() {
            const driverBadge = Utils.$('#driver-notification-badge');
            const adminBadge = Utils.$('#admin-notification-badge');
            
            const badge = state.currentUser?.role === 'admin' ? adminBadge : driverBadge;
            
            if (badge) {
                if (state.unreadNotifications > 0) {
                    badge.textContent = state.unreadNotifications > 99 ? '99+' : state.unreadNotifications;
                    Utils.show(badge);
                } else {
                    Utils.hide(badge);
                }
            }
        },

        startPolling() {
    this.load();
    state.notificationInterval = setInterval(() => {
        this.load();
        // Auto refresh tasks for both driver and admin
        if (state.currentUser?.role === 'driver') {
            DriverPanel.loadTasks(true);
        } else if (state.currentUser?.role === 'admin') {
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
            const list = Utils.$('#notifications-list');
            const emptyState = Utils.$('#notifications-empty');

            if (state.notifications.length === 0) {
                list.innerHTML = '';
                Utils.show(emptyState);
                return;
            }

            Utils.hide(emptyState);
            list.innerHTML = state.notifications.map(notif => `
                <div class="notification-item ${notif.is_read ? '' : 'unread'}" 
                     data-id="${notif.id}" 
                     data-task-id="${notif.task_id || ''}">
                    <div class="notification-icon">${this.getIcon(notif.type)}</div>
                    <div class="notification-content">
                        <div class="notification-title">${Utils.escapeHtml(notif.title)}</div>
                        <div class="notification-message">${Utils.escapeHtml(notif.message)}</div>
                        <div class="notification-time">${Utils.formatRelativeTime(notif.created_at)}</div>
                    </div>
                    ${notif.is_read ? '' : '<div class="notification-unread-dot"></div>'}
                </div>
            `).join('');

            list.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    const taskId = item.dataset.taskId;

                    if (item.classList.contains('unread')) {
                        try {
                            await API.markNotificationRead(id);
                            item.classList.remove('unread');
                            item.querySelector('.notification-unread-dot')?.remove();
                            state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
                            this.updateBadge();
                        } catch (error) {
                            console.error('Failed to mark notification as read:', error);
                        }
                    }

                    if (taskId) {
                        Modal.close('modal-notifications');
                        if (state.currentUser.role === 'admin') {
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
                'new_task': '📋',
                'status_change': '🔄',
                'delay': '⏱️',
                'problem': '⚠️',
                'joined': '👥'
            };
            return icons[type] || '🔔';
        },

        async markAllRead() {
            if (!state.currentUser || state.unreadNotifications === 0) return;

            try {
                await API.markAllNotificationsRead(state.currentUser.id);
                state.notifications.forEach(n => n.is_read = 1);
                state.unreadNotifications = 0;
                this.updateBadge();
                this.renderList();
                Toast.success('Oznaczono jako przeczytane');
            } catch (error) {
                Toast.error('Nie udało się oznaczyć');
            }
        },

        open() {
            this.renderList();
            Modal.open('modal-notifications');
        },

        initEventListeners() {
            Utils.$('#driver-notifications-btn')?.addEventListener('click', () => this.open());
            Utils.$('#admin-notifications-btn')?.addEventListener('click', () => this.open());
            Utils.$('#mark-all-read-btn')?.addEventListener('click', () => this.markAllRead());
        }
    };

    // =============================================
    // 10. DATALISTS
    // =============================================
    const DataLists = {
        updateLocations() {
            const datalist = Utils.$('#datalist-locations');
            if (!datalist) return;

            datalist.innerHTML = [...state.locations, ...state.departments]
                .map(loc => `<option value="${Utils.escapeHtml(loc.name)}">`)
                .join('');
        },

        updateDepartmentSelects() {
            const selects = [
                Utils.$('#unloading-department'),
                Utils.$('#loading-department')
            ];

            selects.forEach(select => {
                if (!select) return;
                const currentValue = select.value;
                select.innerHTML = '<option value="">Wybierz dział...</option>' +
                    state.departments.map(dept => 
                        `<option value="${Utils.escapeHtml(dept.name)}">${Utils.escapeHtml(dept.name)}</option>`
                    ).join('');
                select.value = currentValue;
            });
        },

        updateDriverSelect() {
            const select = Utils.$('#task-assigned');
            if (!select) return;

            const drivers = state.users.filter(u => u.role === 'driver');
            const currentValue = select.value;
            
            select.innerHTML = '<option value="">Dowolny kierowca</option>' +
                drivers.map(driver => 
                    `<option value="${driver.id}">${Utils.escapeHtml(driver.name)}</option>`
                ).join('');
            
            select.value = currentValue;
        },

        updateAll() {
            this.updateLocations();
            this.updateDepartmentSelects();
            this.updateDriverSelect();
        }
    };
        // =============================================
    // 11. AUTH
    // =============================================
    const Auth = {
        async init() {
            const savedUser = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
            if (savedUser) {
                try {
                    state.currentUser = JSON.parse(savedUser);
                    await this.onLoginSuccess();
                } catch (e) {
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
                    await this.showLoginScreen();
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
                Toast.error('Nie udało się załadować użytkowników');
            }
            Screen.show('login');
        },

        populateUserSelect() {
            const select = Utils.$('#login-user');
            select.innerHTML = '<option value="">Wybierz użytkownika...</option>';

            const admins = state.users.filter(u => u.role === 'admin');
            const drivers = state.users.filter(u => u.role === 'driver');

            if (admins.length > 0) {
                const adminGroup = document.createElement('optgroup');
                adminGroup.label = '👔 Kierownicy';
                admins.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name;
                    adminGroup.appendChild(option);
                });
                select.appendChild(adminGroup);
            }

            if (drivers.length > 0) {
                const driverGroup = document.createElement('optgroup');
                driverGroup.label = '🚗 Kierowcy';
                drivers.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name;
                    driverGroup.appendChild(option);
                });
                select.appendChild(driverGroup);
            }
        },

        async handleLogin(e) {
            e.preventDefault();

            const userId = Utils.$('#login-user').value;
            const pin = Utils.$('#login-pin').value;
            const errorEl = Utils.$('#login-error');
            const submitBtn = Utils.$('#login-submit-btn');

            if (!userId || !pin) {
                Utils.show(errorEl);
                errorEl.textContent = 'Wybierz użytkownika i wpisz PIN';
                return;
            }

            submitBtn.disabled = true;
            Utils.hide(submitBtn.querySelector('.btn-text'));
            Utils.show(submitBtn.querySelector('.btn-loader'));
            Utils.hide(errorEl);

            try {
                const response = await API.login(userId, pin);
                state.currentUser = response.user;
                localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(response.user));
                
                Toast.success(`Witaj, ${response.user.name}!`);
                await this.onLoginSuccess();

            } catch (error) {
                Utils.show(errorEl);
                errorEl.textContent = error.message || 'Nieprawidłowy PIN';
            } finally {
                submitBtn.disabled = false;
                Utils.show(submitBtn.querySelector('.btn-text'));
                Utils.hide(submitBtn.querySelector('.btn-loader'));
            }
        },

        async onLoginSuccess() {
            Utils.$('#login-form')?.reset();
            await this.loadCommonData();

            if (state.currentUser.role === 'admin') {
                this.initAdminPanel();
            } else {
                this.initDriverPanel();
            }
        },

        async loadCommonData() {
            try {
                const [locations, users] = await Promise.all([
                    API.getLocations(),
                    API.getUsers()
                ]);
                state.locations = locations.filter(l => l.type === 'location');
                state.departments = locations.filter(l => l.type === 'department');
                state.users = users;
                DataLists.updateAll();
            } catch (error) {
                console.error('Failed to load common data:', error);
            }
        },

        initAdminPanel() {
            Utils.$('#admin-user-name').textContent = state.currentUser.name;
            state.currentDate = Utils.getToday();
            Utils.$('#admin-date-picker').value = state.currentDate;
            
            Screen.show('admin');
            
            AdminPanel.loadTasks();
            AdminPanel.loadUsers();
            AdminPanel.loadLocations();
            AdminPanel.updateDateButtons();
            
            Notifications.startPolling();
        },

        initDriverPanel() {
            Utils.$('#driver-user-name').textContent = state.currentUser.name;
            state.currentDate = Utils.getToday();
            Utils.$('#driver-date-text').textContent = Utils.formatDate(state.currentDate);
            
            Screen.show('driver');
            
            DriverPanel.loadTasks();
            Notifications.startPolling();
        },

        logout() {
            Modal.confirm(
                'Wylogowanie',
                'Czy na pewno chcesz się wylogować?',
                () => {
                    state.currentUser = null;
                    state.tasks = [];
                    state.notifications = [];
                    state.currentFilter = 'all';
                    
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
                    Notifications.stopPolling();
                    
                    Toast.info('Wylogowano');
                    this.showLoginScreen();
                },
                'Wyloguj',
                false
            );
        },

        initEventListeners() {
            Utils.$('#login-form')?.addEventListener('submit', (e) => this.handleLogin(e));

            Utils.$('#toggle-pin')?.addEventListener('click', () => {
                const pinInput = Utils.$('#login-pin');
                const eyeIcon = Utils.$('#toggle-pin .eye-icon');
                if (pinInput.type === 'password') {
                    pinInput.type = 'text';
                    eyeIcon.textContent = '🙈';
                } else {
                    pinInput.type = 'password';
                    eyeIcon.textContent = '👁️';
                }
            });

            Utils.$('#driver-logout-btn')?.addEventListener('click', () => this.logout());
            Utils.$('#admin-logout-btn')?.addEventListener('click', () => this.logout());
        }
    };

    // =============================================
    // 12. DRIVER PANEL
    // =============================================
    const DriverPanel = {
        async loadTasks(silent = false) {
            try {
                state.tasks = await API.getTasks({ date: state.currentDate });
                this.sortTasks();
                this.updateStats();
                this.renderTasks();
            } catch (error) {
                if (!silent) Toast.error('Nie udało się załadować zadań');
                console.error(error);
            }
        },

        sortTasks() {
            // Sort: in_progress first, then by priority, then by sort_order
            state.tasks.sort((a, b) => {
                // In progress tasks first
                if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
                if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
                
                // Then by priority
                const priorityDiff = Utils.getPriorityOrder(a.priority) - Utils.getPriorityOrder(b.priority);
                if (priorityDiff !== 0) return priorityDiff;
                
                // Then by sort_order
                return (a.sort_order || 999) - (b.sort_order || 999);
            });
        },

        updateStats() {
            const pending = state.tasks.filter(t => t.status === 'pending').length;
            const inProgress = state.tasks.filter(t => t.status === 'in_progress').length;
            const completed = state.tasks.filter(t => t.status === 'completed').length;

            Utils.$('#driver-stat-pending').textContent = pending;
            Utils.$('#driver-stat-progress').textContent = inProgress;
            Utils.$('#driver-stat-done').textContent = completed;
        },

        renderTasks() {
            const tasksList = Utils.$('#driver-tasks-list');
            const emptyState = Utils.$('#driver-tasks-empty');

            let filteredTasks = state.tasks;
            if (state.currentFilter !== 'all') {
                filteredTasks = state.tasks.filter(t => t.status === state.currentFilter);
            }

            if (filteredTasks.length === 0) {
                tasksList.innerHTML = '';
                Utils.show(emptyState);
                return;
            }

            Utils.hide(emptyState);
            tasksList.innerHTML = filteredTasks.map(task => this.renderTaskCard(task)).join('');
            this.attachTaskEventListeners();
        },

        renderTaskCard(task) {
            const isMyTask = task.assigned_to === state.currentUser.id || 
                             (task.drivers && task.drivers.includes(state.currentUser.id));
            const isInProgress = task.status === 'in_progress';
            const isLocked = isInProgress && !isMyTask;
            const canJoin = isInProgress && !isMyTask;

            let taskDescription = '';
            if (task.task_type === 'transport') {
                taskDescription = `
                    <div class="task-route">
                        <span>📍 ${Utils.escapeHtml(task.location_from || '?')}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(task.location_to || '?')}</span>
                    </div>
                `;
            } else {
                taskDescription = `
                    <div class="task-department">
                        <span>🏢</span>
                        <span>${Utils.escapeHtml(task.department || 'Nie określono')}</span>
                    </div>
                `;
            }

            const materialHtml = task.material ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            ` : '';

            const notesHtml = task.notes ? `
                <div class="task-notes-preview">
                    <span>💬</span>
                    <span>${Utils.escapeHtml(task.notes)}</span>
                </div>
            ` : '';

            // Drivers info
            const driversHtml = task.assigned_name ? `
                <span class="task-meta-item">
                    <span>👤</span>
                    <span>${Utils.escapeHtml(task.assigned_name)}</span>
                </span>
            ` : '';

            // Action buttons based on status and ownership
            let actionButtons = '';
            if (task.status === 'pending') {
                actionButtons = `
                    <button class="task-action-btn btn-start" data-action="start" data-id="${task.id}">
                        ▶️ Rozpocznij
                    </button>
                `;
            } else if (task.status === 'in_progress') {
                if (isMyTask) {
                    actionButtons = `
                        <button class="task-action-btn" data-action="add-log" data-id="${task.id}" title="Dodaj uwagę">
                            📝
                        </button>
                        <button class="task-action-btn btn-complete" data-action="complete" data-id="${task.id}" title="Zakończ">
                            ✅
                        </button>
                    `;
                } else {
                    actionButtons = `
                        <button class="task-action-btn btn-join" data-action="join" data-id="${task.id}">
                            👥 Dołącz
                        </button>
                    `;
                }
            }

            return `
                <div class="task-card priority-${task.priority} status-${task.status} ${isLocked ? 'task-locked' : ''}" 
                     data-id="${task.id}">
                    <div class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(task.status)} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-type-badge type-${task.task_type}">
                                ${Utils.getTaskTypeIcon(task.task_type)} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${task.priority}">
                                ${Utils.getPriorityIcon(task.priority)} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${task.id}">
                        <div class="task-title">${Utils.escapeHtml(task.description)}</div>
                        <div class="task-description">
                            ${taskDescription}
                            ${materialHtml}
                        </div>
                        ${notesHtml}
                    </div>
                    
                    <div class="task-footer">
                        <div class="task-meta">
                            ${task.scheduled_time ? `
                                <span class="task-meta-item">
                                    <span>🕐</span>
                                    <span>${Utils.formatTime(task.scheduled_time)}</span>
                                </span>
                            ` : ''}
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
            Utils.$$('#driver-tasks-list [data-action]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = el.dataset.action;
                    const taskId = el.dataset.id;

                    switch (action) {
                        case 'start': this.startTask(taskId); break;
                        case 'complete': this.completeTask(taskId); break;
                        case 'add-log': this.openLogModal(taskId); break;
                        case 'details': this.openTaskDetails(taskId); break;
                        case 'join': this.openJoinModal(taskId); break;
                    }
                });
            });
        },

        async startTask(taskId) {
    Modal.confirm(
        'Rozpocząć zadanie?',
        'Czy chcesz rozpocząć wykonywanie tego zadania?',
        async () => {
            // Natychmiast aktualizuj UI
            const task = state.tasks.find(t => t.id == taskId);
            if (task) {
                task.status = 'in_progress';
                task.assigned_to = state.currentUser.id;
                task.assigned_name = state.currentUser.name;
            }
            this.sortTasks();
            this.updateStats();
            this.setFilter('in_progress');
            Toast.success('Zadanie rozpoczęte!');

            // Wyślij do serwera w tle
            try {
                await API.updateTaskStatus(taskId, 'in_progress', state.currentUser.id);
            } catch (error) {
                // Cofnij zmiany jeśli błąd
                Toast.error('Błąd synchronizacji - odświeżam...');
                await this.loadTasks();
            }
        },
        'Rozpocznij',
        false
    );
},

        async completeTask(taskId) {
    Modal.confirm(
        'Zakończyć zadanie?',
        'Czy na pewno chcesz oznaczyć zadanie jako wykonane?',
        async () => {
            // Natychmiast aktualizuj UI
            const task = state.tasks.find(t => t.id == taskId);
            if (task) {
                task.status = 'completed';
            }
            this.sortTasks();
            this.updateStats();
            this.renderTasks();
            Toast.success('Zadanie zakończone! 🎉');

            // Wyślij do serwera w tle
            try {
                await API.updateTaskStatus(taskId, 'completed', state.currentUser.id);
            } catch (error) {
                Toast.error('Błąd synchronizacji - odświeżam...');
                await this.loadTasks();
            }
        },
        'Zakończ',
        false
    );
},

        openJoinModal(taskId) {
            const task = state.tasks.find(t => t.id == taskId);
            Utils.$('#join-task-id').value = taskId;
            Utils.$('#join-task-message').textContent = 
                `Czy chcesz dołączyć do zadania "${task?.description || ''}" i pomagać przy jego realizacji?`;
            Modal.open('modal-join-task');
        },

        async joinTask() {
    const taskId = Utils.$('#join-task-id').value;
    
    // Natychmiast zamknij modal i pokaż sukces
    Modal.close('modal-join-task');
    Toast.success('Dołączyłeś do zadania!');
    
    // Sync w tle
    try {
        await API.joinTask(taskId, state.currentUser.id);
        await this.loadTasks(true);
    } catch (error) {
        Toast.error('Błąd synchronizacji');
        await this.loadTasks();
    }
},

        openLogModal(taskId) {
            Utils.$('#log-task-id').value = taskId;
            Utils.$('#task-log-form').reset();
            this.toggleLogFields('note');
            Modal.open('modal-task-log');
        },

        toggleLogFields(type) {
            Utils.$$('.log-fields').forEach(el => Utils.hide(el));
            Utils.show(`#log-fields-${type}`);
        },

        async handleLogSubmit(e) {
    e.preventDefault();

    const taskId = Utils.$('#log-task-id').value;
    const logType = document.querySelector('input[name="log-type"]:checked').value;

    const logData = {
        userId: state.currentUser.id,
        logType
    };

    if (logType === 'note') {
        logData.message = Utils.$('#log-message').value.trim();
        if (!logData.message) {
            Toast.warning('Wpisz treść uwagi');
            return;
        }
    } else if (logType === 'delay') {
        logData.delayReason = Utils.$('#delay-reason').value;
        logData.delayMinutes = parseInt(Utils.$('#delay-minutes').value) || 0;
        logData.message = Utils.$('#delay-details').value.trim();
        
        if (!logData.delayReason) {
            Toast.warning('Wybierz powód przestoju');
            return;
        }
    } else if (logType === 'problem') {
        logData.message = Utils.$('#problem-message').value.trim();
        if (!logData.message) {
            Toast.warning('Opisz problem');
            return;
        }
    }

    // Natychmiast zamknij i pokaż sukces
    Modal.close('modal-task-log');
    Toast.success('Zapisano!');

    // Sync w tle
    try {
        await API.createTaskLog(taskId, logData);
    } catch (error) {
        Toast.error('Błąd synchronizacji');
    }
},

        async openTaskDetails(taskId) {
            try {
                const task = await API.getTask(taskId);
                this.renderTaskDetails(task);
                Modal.open('modal-task-detail');
            } catch (error) {
                Toast.error('Nie udało się załadować szczegółów');
            }
        },

        renderTaskDetails(task) {
            const content = Utils.$('#task-detail-content');
            const isDriver = state.currentUser.role === 'driver';
            const isMyTask = task.assigned_to === state.currentUser.id;
            
            let locationInfo = '';
            if (task.task_type === 'transport') {
                locationInfo = `
                    <div class="task-detail-row">
                        <span class="task-detail-label">Skąd</span>
                        <span class="task-detail-value">📍 ${Utils.escapeHtml(task.location_from || '-')}</span>
                    </div>
                    <div class="task-detail-row">
                        <span class="task-detail-label">Dokąd</span>
                        <span class="task-detail-value">📍 ${Utils.escapeHtml(task.location_to || '-')}</span>
                    </div>
                `;
            } else {
                locationInfo = `
                    <div class="task-detail-row">
                        <span class="task-detail-label">Dział</span>
                        <span class="task-detail-value">🏢 ${Utils.escapeHtml(task.department || '-')}</span>
                    </div>
                `;
            }

            let logsHtml = '';
            if (task.logs && task.logs.length > 0) {
                logsHtml = `
                    <div class="task-logs-section">
                        <h4>Historia i uwagi</h4>
                        ${task.logs.map(log => `
                            <div class="task-log-item log-${log.log_type}">
                                <span class="task-log-icon">${Utils.getLogTypeIcon(log.log_type)}</span>
                                <div class="task-log-content">
                                    <div class="task-log-message">
                                        ${log.log_type === 'delay' 
                                            ? `<strong>${Utils.getDelayReasonLabel(log.delay_reason)}</strong> (${log.delay_minutes || 0} min)<br>` 
                                            : ''
                                        }
                                        ${Utils.escapeHtml(log.message || '')}
                                    </div>
                                    <div class="task-log-meta">
                                        ${Utils.escapeHtml(log.user_name || 'Nieznany')} • ${Utils.formatRelativeTime(log.created_at)}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            let actionsHtml = '';
            if (isDriver) {
                if (task.status === 'pending') {
                    actionsHtml = `
                        <div class="task-detail-actions">
                            <button class="btn btn-primary btn-block" onclick="TransportTracker.DriverPanel.startTask(${task.id}); TransportTracker.Modal.close('modal-task-detail');">
                                ▶️ Rozpocznij zadanie
                            </button>
                        </div>
                    `;
                } else if (task.status === 'in_progress' && isMyTask) {
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
                } else if (task.status === 'in_progress' && !isMyTask) {
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
                        ${Utils.getTaskTypeIcon(task.task_type)} ${Utils.getTaskTypeLabel(task.task_type)}
                    </span>
                    <span class="task-priority-badge priority-${task.priority}">
                        ${Utils.getPriorityIcon(task.priority)} ${Utils.getPriorityLabel(task.priority)}
                    </span>
                    <span class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(task.status)} ${Utils.getStatusLabel(task.status)}
                    </span>
                </div>
                
                <h3 class="task-detail-title">${Utils.escapeHtml(task.description)}</h3>
                
                <div class="task-detail-section">
                    <h4>Szczegóły</h4>
                    ${locationInfo}
                    ${task.material ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Materiał</span>
                            <span class="task-detail-value">📦 ${Utils.escapeHtml(task.material)}</span>
                        </div>
                    ` : ''}
                    <div class="task-detail-row">
                        <span class="task-detail-label">Data</span>
                        <span class="task-detail-value">📅 ${Utils.formatDate(task.scheduled_date)}</span>
                    </div>
                    ${task.scheduled_time ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Godzina</span>
                            <span class="task-detail-value">🕐 ${Utils.formatTime(task.scheduled_time)}</span>
                        </div>
                    ` : ''}
                    ${task.assigned_name ? `
                        <div class="task-detail-row">
                            <span class="task-detail-label">Przypisany</span>
                            <span class="task-detail-value">👤 ${Utils.escapeHtml(task.assigned_name)}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${task.notes ? `
                    <div class="task-detail-section">
                        <h4>Uwagi</h4>
                        <div class="task-notes-preview">
                            <span>💬</span>
                            <span>${Utils.escapeHtml(task.notes)}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${logsHtml}
                ${actionsHtml}
            `;
        },

        setFilter(filter) {
            state.currentFilter = filter;
            
            Utils.$$('#screen-driver .filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            
            this.renderTasks();
        },

        initEventListeners() {
            // Filter buttons
            Utils.$$('#screen-driver .filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setFilter(btn.dataset.filter);
                });
            });

            // Log form
            Utils.$('#task-log-form')?.addEventListener('submit', (e) => this.handleLogSubmit(e));

            // Log type change
            Utils.$$('input[name="log-type"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    this.toggleLogFields(radio.value);
                });
            });

            // Join task
            Utils.$('#join-task-confirm-btn')?.addEventListener('click', () => this.joinTask());
        }
    };

    // =============================================
    // 13. TASK FORM
    // =============================================
    const TaskForm = {
        currentTaskId: null,

        open(taskId = null) {
            this.currentTaskId = taskId;

            Utils.$('#modal-task-title').textContent = taskId ? 'Edytuj zadanie' : 'Nowe zadanie';
            Utils.$('#task-form').reset();
            Utils.$('#task-id').value = '';
            Utils.$('#task-date').value = state.currentDate;

            DataLists.updateAll();
            this.toggleTaskFields('transport');

            if (taskId) {
                this.loadTask(taskId);
            } else {
                Modal.open('modal-task');
            }
        },

        async loadTask(taskId) {
            try {
                const task = await API.getTask(taskId);
                this.populateForm(task);
                Modal.open('modal-task');
            } catch (error) {
                Toast.error('Nie udało się załadować zadania');
            }
        },

        populateForm(task) {
            Utils.$('#task-id').value = task.id;

            const typeRadio = document.querySelector(`input[name="task-type"][value="${task.task_type}"]`);
            if (typeRadio) typeRadio.checked = true;
            this.toggleTaskFields(task.task_type);

            if (task.task_type === 'transport') {
                Utils.$('#transport-material').value = task.material || '';
                Utils.$('#transport-from').value = task.location_from || '';
                Utils.$('#transport-to').value = task.location_to || '';
            } else if (task.task_type === 'unloading') {
                Utils.$('#unloading-material').value = task.material || task.description || '';
                Utils.$('#unloading-department').value = task.department || '';
            } else if (task.task_type === 'loading') {
                Utils.$('#loading-material').value = task.material || task.description || '';
                Utils.$('#loading-department').value = task.department || '';
            }

            Utils.$('#task-date').value = task.scheduled_date || '';
            Utils.$('#task-time').value = task.scheduled_time || '';
            Utils.$('#task-notes').value = task.notes || '';
            Utils.$('#task-assigned').value = task.assigned_to || '';

            const priorityRadio = document.querySelector(`input[name="task-priority"][value="${task.priority}"]`);
            if (priorityRadio) priorityRadio.checked = true;
        },

        toggleTaskFields(type) {
            Utils.$$('.task-fields').forEach(el => Utils.hide(el));
            Utils.show(`#fields-${type}`);
        },

        getFormData() {
            const taskType = document.querySelector('input[name="task-type"]:checked').value;
            const priority = document.querySelector('input[name="task-priority"]:checked').value;

            const data = {
                task_type: taskType,
                scheduled_date: Utils.$('#task-date').value,
                scheduled_time: Utils.$('#task-time').value || null,
                priority,
                notes: Utils.$('#task-notes').value.trim() || null,
                assigned_to: Utils.$('#task-assigned').value || null,
                created_by: state.currentUser.id
            };

            if (taskType === 'transport') {
                data.material = Utils.$('#transport-material').value.trim();
                data.description = data.material;
                data.location_from = Utils.$('#transport-from').value.trim();
                data.location_to = Utils.$('#transport-to').value.trim();
            } else if (taskType === 'unloading') {
                data.material = Utils.$('#unloading-material').value.trim();
                data.description = `Rozładunek: ${data.material}`;
                data.department = Utils.$('#unloading-department').value;
            } else if (taskType === 'loading') {
                data.material = Utils.$('#loading-material').value.trim();
                data.description = `Załadunek: ${data.material}`;
                data.department = Utils.$('#loading-department').value;
            }

            return data;
        },

        validate(data) {
            if (!data.scheduled_date) {
                Toast.warning('Wybierz datę');
                return false;
            }

            if (data.task_type === 'transport') {
                if (!data.material) {
                    Toast.warning('Wpisz co jest przewożone');
                    return false;
                }
                if (!data.location_from || !data.location_to) {
                    Toast.warning('Podaj lokalizację początkową i końcową');
                    return false;
                }
            } else if (data.task_type === 'unloading') {
                if (!data.material) {
                    Toast.warning('Wpisz nazwę/opis rozładunku');
                    return false;
                }
                if (!data.department) {
                    Toast.warning('Wybierz dział');
                    return false;
                }
            } else if (data.task_type === 'loading') {
                if (!data.material) {
                    Toast.warning('Wpisz rodzaj materiału');
                    return false;
                }
                if (!data.department) {
                    Toast.warning('Wybierz dział');
                    return false;
                }
            }

            return true;
        },

        async handleSubmit(e) {
    e.preventDefault();

    const data = this.getFormData();
    
    if (!this.validate(data)) return;

    const taskId = Utils.$('#task-id').value;

    // Natychmiast zamknij i pokaż sukces
    Modal.close('modal-task');
    Toast.success(taskId ? 'Zadanie zaktualizowane!' : 'Zadanie dodane!');

    // Sync w tle
    try {
        if (taskId) {
            await API.updateTask(taskId, data);
        } else {
            await API.createTask(data);
        }
        await AdminPanel.loadTasks();
    } catch (error) {
        Toast.error('Błąd synchronizacji');
        await AdminPanel.loadTasks();
    }
},

        initEventListeners() {
            Utils.$$('input[name="task-type"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    this.toggleTaskFields(radio.value);
                });
            });

            Utils.$('#task-form')?.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    };
        // =============================================
    // 14. ADMIN PANEL
    // =============================================
    const AdminPanel = {
        async loadTasks(silent = false) {
    try {
        state.tasks = await API.getTasks({ date: state.currentDate });
                this.sortTasks();
                this.updateStats();
                this.updateDateDisplay();
                this.renderTasks();
                } catch (error) {
        if (!silent) Toast.error('Nie udało się załadować zadań');
        console.error(error);
    }
        },

        sortTasks() {
            state.tasks.sort((a, b) => {
                // Completed last
                if (a.status === 'completed' && b.status !== 'completed') return 1;
                if (b.status === 'completed' && a.status !== 'completed') return -1;
                
                // In progress first
                if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
                if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
                
                // Then by priority
                const priorityDiff = Utils.getPriorityOrder(a.priority) - Utils.getPriorityOrder(b.priority);
                if (priorityDiff !== 0) return priorityDiff;
                
                // Then by sort_order
                return (a.sort_order || 999) - (b.sort_order || 999);
            });
        },

        updateStats() {
            const pending = state.tasks.filter(t => t.status === 'pending').length;
            const inProgress = state.tasks.filter(t => t.status === 'in_progress').length;
            const completed = state.tasks.filter(t => t.status === 'completed').length;

            Utils.$('#admin-stat-pending').textContent = pending;
            Utils.$('#admin-stat-progress').textContent = inProgress;
            Utils.$('#admin-stat-done').textContent = completed;
        },

        updateDateDisplay() {
            const dateText = Utils.formatDate(state.currentDate);
            Utils.$('#admin-date-display').textContent = dateText;
            this.updateDateButtons();
        },

        updateDateButtons() {
    const today = Utils.getToday();
    Utils.$$('.date-quick-btn').forEach(btn => {
        const offset = parseInt(btn.dataset.offset);
        const btnDate = Utils.addDays(today, offset);
        // Porównaj daty jako stringi
        const isActive = btnDate === state.currentDate;
        btn.classList.toggle('active', isActive);
    });
    
    // Debug - możesz usunąć po testach
    console.log('Today:', today, 'Current:', state.currentDate);
},

        renderTasks() {
            const tasksList = Utils.$('#admin-tasks-list');
            const emptyState = Utils.$('#admin-tasks-empty');

            // Apply filter
            let filteredTasks = state.tasks;
            if (state.currentFilter !== 'all') {
                filteredTasks = state.tasks.filter(t => t.status === state.currentFilter);
            }

            if (filteredTasks.length === 0) {
                tasksList.innerHTML = '';
                Utils.show(emptyState);
                return;
            }

            Utils.hide(emptyState);

            tasksList.innerHTML = filteredTasks.map((task, index) => 
                this.renderTaskCard(task, index + 1)
            ).join('');

            this.attachTaskEventListeners();

            if (state.isReorderMode) {
                this.initDragAndDrop();
            }
        },

        renderTaskCard(task, order) {
            const isCompleted = task.status === 'completed';
            const isInProgress = task.status === 'in_progress';

            let taskDescription = '';
            if (task.task_type === 'transport') {
                taskDescription = `
                    <div class="task-route">
                        <span>📍 ${Utils.escapeHtml(task.location_from || '?')}</span>
                        <span class="task-route-arrow">→</span>
                        <span>📍 ${Utils.escapeHtml(task.location_to || '?')}</span>
                    </div>
                `;
            } else {
                taskDescription = `
                    <div class="task-department">
                        <span>🏢</span>
                        <span>${Utils.escapeHtml(task.department || 'Nie określono')}</span>
                    </div>
                `;
            }

            const materialHtml = task.material ? `
                <div class="task-material">
                    <span>📦</span>
                    <span>${Utils.escapeHtml(task.material)}</span>
                </div>
            ` : '';

            const assignedHtml = task.assigned_name ? `
                <span class="task-meta-item">
                    <span>👤</span>
                    <span>${Utils.escapeHtml(task.assigned_name)}</span>
                </span>
            ` : '';

            return `
                <div class="task-card priority-${task.priority} status-${task.status}" 
                     data-id="${task.id}" 
                     draggable="${state.isReorderMode && !isCompleted && !isInProgress}">
                    
                    <div class="task-drag-handle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="6" r="2"/>
                            <circle cx="15" cy="6" r="2"/>
                            <circle cx="9" cy="12" r="2"/>
                            <circle cx="15" cy="12" r="2"/>
                            <circle cx="9" cy="18" r="2"/>
                            <circle cx="15" cy="18" r="2"/>
                        </svg>
                    </div>
                    
                    <div class="task-status-indicator status-${task.status}">
                        ${Utils.getStatusIcon(task.status)} ${Utils.getStatusLabel(task.status)}
                    </div>
                    
                    <div class="task-header">
                        <div class="task-badges">
                            <span class="task-order-badge">#${order}</span>
                            <span class="task-type-badge type-${task.task_type}">
                                ${Utils.getTaskTypeIcon(task.task_type)} ${Utils.getTaskTypeLabel(task.task_type)}
                            </span>
                            <span class="task-priority-badge priority-${task.priority}" 
                                  data-action="change-priority" data-id="${task.id}" 
                                  title="Zmień priorytet">
                                ${Utils.getPriorityIcon(task.priority)} ${Utils.getPriorityLabel(task.priority)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="task-body" data-action="details" data-id="${task.id}">
                        <div class="task-title">${Utils.escapeHtml(task.description)}</div>
                        <div class="task-description">
                            ${taskDescription}
                            ${materialHtml}
                        </div>
                    </div>
                    
                    <div class="task-footer">
                        <div class="task-meta">
                            ${task.scheduled_time ? `
                                <span class="task-meta-item">
                                    <span>🕐</span>
                                    <span>${Utils.formatTime(task.scheduled_time)}</span>
                                </span>
                            ` : ''}
                            ${assignedHtml}
                        </div>
                        <div class="task-actions">
                            <button class="task-action-btn" data-action="edit" data-id="${task.id}" title="Edytuj">
                                ✏️
                            </button>
                            <button class="task-action-btn btn-delete" data-action="delete" data-id="${task.id}" title="Usuń">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        },

        attachTaskEventListeners() {
            Utils.$$('#admin-tasks-list [data-action]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = el.dataset.action;
                    const taskId = el.dataset.id;

                    switch (action) {
                        case 'edit': this.editTask(taskId); break;
                        case 'delete': this.deleteTask(taskId); break;
                        case 'details': this.openTaskDetails(taskId); break;
                        case 'change-priority': this.openPriorityModal(taskId); break;
                    }
                });
            });
        },

        editTask(taskId) {
            TaskForm.open(taskId);
        },

        async deleteTask(taskId) {
    const task = state.tasks.find(t => t.id == taskId);
    
    Modal.confirm(
        'Usunąć zadanie?',
        `Czy na pewno chcesz usunąć "${task?.description || 'to zadanie'}"?`,
        async () => {
            // Natychmiast usuń z UI
            state.tasks = state.tasks.filter(t => t.id != taskId);
            this.updateStats();
            this.renderTasks();
            Toast.success('Zadanie usunięte');

            // Sync w tle
            try {
                await API.deleteTask(taskId);
            } catch (error) {
                Toast.error('Błąd synchronizacji');
                await this.loadTasks();
            }
        }
    );
},

        async openTaskDetails(taskId) {
            try {
                const task = await API.getTask(taskId);
                DriverPanel.renderTaskDetails(task);
                Modal.open('modal-task-detail');
            } catch (error) {
                Toast.error('Nie udało się załadować szczegółów');
            }
        },

        openPriorityModal(taskId) {
            Utils.$('#priority-task-id').value = taskId;
            Modal.open('modal-priority');
        },

        async changePriority(taskId, newPriority) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;

    // Natychmiast aktualizuj UI
    task.priority = newPriority;
    this.sortTasks();
    this.renderTasks();
    Modal.close('modal-priority');
    Toast.success('Priorytet zmieniony');

    // Sync w tle
    try {
        await API.updateTask(taskId, { ...task, priority: newPriority });
    } catch (error) {
        Toast.error('Błąd synchronizacji');
        await this.loadTasks();
    }
},

        // DATE NAVIGATION
        changeDate(days) {
    state.currentDate = Utils.addDays(state.currentDate, days);
    Utils.$('#admin-date-picker').value = state.currentDate;
    state.currentFilter = 'all';
    this.updateFilterButtons();
    this.loadTasks();
},

        setDateByOffset(offset) {
            const today = Utils.getToday();
            state.currentDate = Utils.addDays(today, offset);
            Utils.$('#admin-date-picker').value = state.currentDate;
            state.currentFilter = 'all';
            this.updateFilterButtons();
            this.loadTasks();
        },

        setDate(date) {
            state.currentDate = date;
            state.currentFilter = 'all';
            this.updateFilterButtons();
            this.loadTasks();
        },

        setFilter(filter) {
            state.currentFilter = filter;
            this.updateFilterButtons();
            this.renderTasks();
        },

        updateFilterButtons() {
            Utils.$$('#admin-filters .filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === state.currentFilter);
            });
        },

        // REORDER MODE
        toggleReorderMode() {
            state.isReorderMode = !state.isReorderMode;
            
            const tasksList = Utils.$('#admin-tasks-list');
            const toggleBtn = Utils.$('#toggle-reorder-btn');
            const reorderInfo = Utils.$('#reorder-info');

            tasksList.classList.toggle('reorder-mode', state.isReorderMode);
            Utils.toggle(reorderInfo, state.isReorderMode);
            
            if (state.isReorderMode) {
                toggleBtn.innerHTML = '❌ Anuluj';
                // Filter to show only pending tasks
                state.currentFilter = 'pending';
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
            Utils.$('#admin-tasks-list').classList.remove('reorder-mode');
            Utils.hide('#reorder-info');
            Utils.$('#toggle-reorder-btn').innerHTML = `
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
            try {
                const taskCards = Utils.$$('#admin-tasks-list .task-card:not(.status-completed):not(.status-in_progress)');
                const newOrder = Array.from(taskCards).map(card => parseInt(card.dataset.id));

                await API.reorderTasks(newOrder);
                
                state.isReorderMode = false;
                Utils.$('#admin-tasks-list').classList.remove('reorder-mode');
                Utils.hide('#reorder-info');
                Utils.$('#toggle-reorder-btn').innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <span>Zmień kolejność</span>
                `;
                
                Toast.success('Kolejność zapisana!');
                state.currentFilter = 'all';
                this.updateFilterButtons();
                this.loadTasks();

            } catch (error) {
                Toast.error('Nie udało się zapisać kolejności');
            }
        },

        initDragAndDrop() {
            const tasksList = Utils.$('#admin-tasks-list');
            const cards = tasksList.querySelectorAll('.task-card:not(.status-completed):not(.status-in_progress)');
            
            let draggedItem = null;

            cards.forEach(card => {
                card.addEventListener('dragstart', (e) => {
                    draggedItem = card;
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                card.addEventListener('dragend', () => {
                    if (draggedItem) draggedItem.classList.remove('dragging');
                    draggedItem = null;
                    cards.forEach(c => c.classList.remove('drag-over'));
                    this.updateOrderBadges();
                });

                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (card !== draggedItem && !card.classList.contains('status-in_progress')) {
                        card.classList.add('drag-over');
                    }
                });

                card.addEventListener('dragleave', () => {
                    card.classList.remove('drag-over');
                });

                card.addEventListener('drop', (e) => {
                    e.preventDefault();
                    card.classList.remove('drag-over');
                    
                    if (draggedItem && card !== draggedItem) {
                        const allCards = Array.from(tasksList.querySelectorAll('.task-card:not(.status-completed):not(.status-in_progress)'));
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
            const cards = Utils.$$('#admin-tasks-list .task-card');
            cards.forEach((card, index) => {
                const badge = card.querySelector('.task-order-badge');
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
                Toast.error('Nie udało się załadować użytkowników');
            }
        },

        renderUsers() {
            const list = Utils.$('#users-list');
            const emptyState = Utils.$('#users-empty');

            if (state.users.length === 0) {
                list.innerHTML = '';
                Utils.show(emptyState);
                return;
            }

            Utils.hide(emptyState);

            list.innerHTML = state.users.map(user => `
                <div class="user-card" data-id="${user.id}">
                    <div class="user-info">
                        <div class="user-avatar ${user.role === 'admin' ? 'admin' : ''}">
                            ${user.role === 'admin' ? '👔' : '🚗'}
                        </div>
                        <div class="user-details">
                            <h3>${Utils.escapeHtml(user.name)}</h3>
                            <p>${user.role === 'admin' ? 'Kierownik' : 'Kierowca'}</p>
                        </div>
                    </div>
                    <div class="user-actions">
                        <button class="task-action-btn" data-action="edit-user" data-id="${user.id}">✏️</button>
                        <button class="task-action-btn btn-delete" data-action="delete-user" data-id="${user.id}">🗑️</button>
                    </div>
                </div>
            `).join('');

            list.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    const userId = btn.dataset.id;
                    if (action === 'edit-user') this.openUserModal(userId);
                    else if (action === 'delete-user') this.deleteUser(userId);
                });
            });
        },

        openUserModal(userId = null) {
            Utils.$('#modal-user-title').textContent = userId ? 'Edytuj użytkownika' : 'Nowy użytkownik';
            Utils.$('#user-form').reset();
            Utils.$('#user-id').value = '';
            Utils.$('#pin-hint').classList.toggle('hidden', !userId);
            Utils.$('#user-pin').required = !userId;

            if (userId) {
                const user = state.users.find(u => u.id == userId);
                if (user) {
                    Utils.$('#user-id').value = user.id;
                    Utils.$('#user-name').value = user.name;
                    document.querySelector(`input[name="user-role"][value="${user.role}"]`).checked = true;
                }
            }

            Modal.open('modal-user');
        },

        async handleUserSubmit(e) {
    e.preventDefault();

    const userId = Utils.$('#user-id').value;
    const name = Utils.$('#user-name').value.trim();
    const pin = Utils.$('#user-pin').value.trim();
    const role = document.querySelector('input[name="user-role"]:checked').value;

    if (!name) { Toast.warning('Wpisz imię'); return; }
    if (!userId && !pin) { Toast.warning('Wpisz PIN'); return; }
    if (pin && (pin.length < 4 || pin.length > 6)) { Toast.warning('PIN musi mieć 4-6 cyfr'); return; }

    // Natychmiast zamknij i pokaż sukces
    Modal.close('modal-user');
    Toast.success(userId ? 'Użytkownik zaktualizowany' : 'Użytkownik dodany');

    // Sync w tle
    try {
        if (userId) {
            await API.updateUser(userId, { name, pin: pin || undefined, role });
        } else {
            await API.createUser({ name, pin, role });
        }
        await this.loadUsers();
    } catch (error) {
        Toast.error('Błąd synchronizacji');
        await this.loadUsers();
    }
},

        async deleteUser(userId) {
    const user = state.users.find(u => u.id == userId);
    
    if (user.id === state.currentUser.id) {
        Toast.warning('Nie możesz usunąć siebie');
        return;
    }

    Modal.confirm(
        'Usunąć użytkownika?',
        `Czy na pewno chcesz usunąć "${user?.name}"?`,
        async () => {
            // Natychmiast usuń z UI
            state.users = state.users.filter(u => u.id != userId);
            this.renderUsers();
            Toast.success('Użytkownik usunięty');

            // Sync w tle
            try {
                await API.deleteUser(userId);
            } catch (error) {
                Toast.error('Błąd synchronizacji');
                await this.loadUsers();
            }
        }
    );
},

        // LOCATIONS
        async loadLocations() {
            try {
                const allLocations = await API.getLocations();
                state.locations = allLocations.filter(l => l.type === 'location');
                state.departments = allLocations.filter(l => l.type === 'department');
                this.renderLocations();
                DataLists.updateAll();
            } catch (error) {
                Toast.error('Nie udało się załadować lokalizacji');
            }
        },

        renderLocations() {
            const locationsList = Utils.$('#locations-list');
            const departmentsList = Utils.$('#departments-list');

            locationsList.innerHTML = state.locations.map(loc => `
                <div class="location-card" data-id="${loc.id}">
                    <div class="location-info">
                        <div class="location-details">
                            <h3>📍 ${Utils.escapeHtml(loc.name)}</h3>
                        </div>
                    </div>
                    <div class="location-actions">
                        <button class="task-action-btn btn-delete" data-action="delete-location" data-id="${loc.id}">🗑️</button>
                    </div>
                </div>
            `).join('') || '<p class="text-muted text-center">Brak lokalizacji</p>';

            departmentsList.innerHTML = state.departments.map(dept => `
                <div class="location-card" data-id="${dept.id}">
                    <div class="location-info">
                        <div class="location-details">
                            <h3>🏢 ${Utils.escapeHtml(dept.name)}</h3>
                        </div>
                    </div>
                    <div class="location-actions">
                        <button class="task-action-btn btn-delete" data-action="delete-location" data-id="${dept.id}">🗑️</button>
                    </div>
                </div>
            `).join('') || '<p class="text-muted text-center">Brak działów</p>';

            Utils.$$('[data-action="delete-location"]').forEach(btn => {
                btn.addEventListener('click', () => this.deleteLocation(btn.dataset.id));
            });
        },

        async handleLocationSubmit(e) {
    e.preventDefault();

    const name = Utils.$('#location-name').value.trim();
    const type = document.querySelector('input[name="location-type"]:checked').value;

    if (!name) { Toast.warning('Wpisz nazwę'); return; }

    // Natychmiast zamknij i pokaż sukces
    Modal.close('modal-location');
    Toast.success(type === 'department' ? 'Dział dodany' : 'Lokalizacja dodana');

    // Sync w tle
    try {
        await API.createLocation({ name, type });
        await this.loadLocations();
    } catch (error) {
        Toast.error('Błąd synchronizacji');
        await this.loadLocations();
    }
},

        async deleteLocation(locationId) {
    const loc = [...state.locations, ...state.departments].find(l => l.id == locationId);
    
    Modal.confirm(
        'Usunąć?',
        `Czy na pewno chcesz usunąć "${loc?.name}"?`,
        async () => {
            // Natychmiast usuń z UI
            state.locations = state.locations.filter(l => l.id != locationId);
            state.departments = state.departments.filter(l => l.id != locationId);
            this.renderLocations();
            Toast.success('Usunięto');

            // Sync w tle
            try {
                await API.deleteLocation(locationId);
            } catch (error) {
                Toast.error('Błąd synchronizacji');
                await this.loadLocations();
            }
        }
    );
},

        // REPORTS
        async loadReports() {
            const period = Utils.$('#report-period').value;
            try {
                const data = await API.getReports(period);
                this.renderReports(data);
            } catch (error) {
                console.error('Failed to load reports:', error);
                Utils.$('#report-stats').innerHTML = '<p class="text-muted">Nie udało się załadować raportów</p>';
            }
        },

        renderReports(data) {
            const statsContainer = Utils.$('#report-stats');
            const listContainer = Utils.$('#report-drivers-list');

            if (!data || !data.summary) {
                statsContainer.innerHTML = '<p class="text-muted">Brak danych</p>';
                listContainer.innerHTML = '';
                return;
            }

            statsContainer.innerHTML = `
                <div class="report-stat">
                    <div class="report-stat-value">${data.summary.total || 0}</div>
                    <div class="report-stat-label">Wszystkie</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${data.summary.completed || 0}</div>
                    <div class="report-stat-label">Ukończone</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${data.summary.avgTime || '-'}</div>
                    <div class="report-stat-label">Śr. czas</div>
                </div>
            `;

            if (data.drivers && data.drivers.length > 0) {
                listContainer.innerHTML = `
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Kierowca</th>
                                <th>Ukończone</th>
                                <th>Śr. czas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.drivers.map(d => `
                                <tr>
                                    <td>${Utils.escapeHtml(d.name)}</td>
                                    <td>${d.completed}</td>
                                    <td>${d.avgTime || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                listContainer.innerHTML = '<p class="text-muted text-center">Brak danych o kierowcach</p>';
            }
        },

        // TABS
        switchTab(tabId) {
            state.currentTab = tabId;

            Utils.$$('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabId);
            });

            Utils.$$('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tabId}`);
            });

            if (tabId === 'reports') {
                this.loadReports();
            }
        },

        // EVENT LISTENERS
        initEventListeners() {
            // Add task
            Utils.$('#add-task-btn')?.addEventListener('click', () => TaskForm.open());
            Utils.$('#add-task-empty-btn')?.addEventListener('click', () => TaskForm.open());

            // Date navigation
Utils.$('#prev-day-btn')?.addEventListener('click', () => this.changeDate(-1));
Utils.$('#next-day-btn')?.addEventListener('click', () => this.changeDate(1));
            Utils.$('#admin-date-picker')?.addEventListener('change', (e) => this.setDate(e.target.value));

            // Quick date buttons
            Utils.$$('.date-quick-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const offset = parseInt(btn.dataset.offset);
                    this.setDateByOffset(offset);
                });
            });

            // Filters
            Utils.$$('#admin-filters .filter-btn').forEach(btn => {
                btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
            });

            // Reorder
            Utils.$('#toggle-reorder-btn')?.addEventListener('click', () => this.toggleReorderMode());
            Utils.$('#save-reorder-btn')?.addEventListener('click', () => this.saveReorder());
            Utils.$('#cancel-reorder-btn')?.addEventListener('click', () => this.cancelReorder());

            // Priority modal
            Utils.$$('.priority-select-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const taskId = Utils.$('#priority-task-id').value;
                    this.changePriority(taskId, btn.dataset.priority);
                });
            });

            // Tabs
            Utils.$$('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
            });

            // Users
            Utils.$('#add-user-btn')?.addEventListener('click', () => this.openUserModal());
            Utils.$('#user-form')?.addEventListener('submit', (e) => this.handleUserSubmit(e));

            // Locations
            Utils.$('#add-location-btn')?.addEventListener('click', () => Modal.open('modal-location'));
            Utils.$('#location-form')?.addEventListener('submit', (e) => this.handleLocationSubmit(e));

            // Reports
            Utils.$('#report-period')?.addEventListener('change', () => this.loadReports());
        }
    };

    // =============================================
    // 15. INIT
    // =============================================
    async function init() {
        console.log('🚛 TransportTracker v2.0 initializing...');

        Toast.init();
        Modal.init();
        Theme.init();
        Theme.initEventListeners();
        Auth.initEventListeners();
        Notifications.initEventListeners();
        DriverPanel.initEventListeners();
        TaskForm.initEventListeners();
        AdminPanel.initEventListeners();

        await new Promise(resolve => setTimeout(resolve, 500));
        await Auth.init();

        console.log('✅ TransportTracker ready!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =============================================
    // 16. EXPORT
    // =============================================
    window.TransportTracker = {
        state,
        Utils,
        API,
        Toast,
        Modal,
        Screen,
        Theme,
        Auth,
        Notifications,
        DriverPanel,
        TaskForm,
        AdminPanel
    };

})();