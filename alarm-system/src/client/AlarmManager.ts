import { io, Socket } from 'socket.io-client';
import { AlarmEvent, TaskListResponse, AlarmHistoryResponse } from '../types/alarm';

export interface AlarmManagerConfig {
  socketUrl: string;
  apiUrl: string;
  authTokenProvider: () => string;
  onUnreadCountChange?: (count: number) => void;
  onAlarmTriggered?: (alarm: AlarmEvent) => void;
}

export class AlarmManager {
  private socket: Socket | null = null;
  private config: AlarmManagerConfig;
  private shownAlarms = new Set<string>(); // Client-side deduplication key
  private toastContainer: HTMLDivElement | null = null;
  private isPanelOpen = false;

  constructor(config: AlarmManagerConfig) {
    this.config = config;
    this.injectStyles();
    this.createToastContainer();
  }

  /**
   * Initializes the WebSocket connection and event listeners.
   */
  public connect(): void {
    const token = this.config.authTokenProvider();
    
    this.socket = io(this.config.socketUrl, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[AlarmManager] Connected to WebSocket server');
    });

    this.socket.on('alarm:triggered', (alarm: AlarmEvent) => {
      console.log('[AlarmManager] Received alarm event:', alarm);
      this.handleAlarmTriggered(alarm);
    });

    this.socket.on('alarm:unread_count', (data: { count: number }) => {
      if (this.config.onUnreadCountChange) {
        this.config.onUnreadCountChange(data.count);
      }
      this.updateBellBadge(data.count);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[AlarmManager] WebSocket disconnected:', reason);
    });
  }

  /**
   * Disconnects the WebSocket.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Sets the panel open state.
   */
  public setPanelState(isOpen: boolean): void {
    this.isPanelOpen = isOpen;
    if (isOpen) {
      this.markAllAlarmsAsRead();
    }
  }

  /**
   * Handles incoming alarm events, checking for deduplication.
   */
  private handleAlarmTriggered(alarm: AlarmEvent): void {
    // Prevent duplicate toasts
    if (this.shownAlarms.has(alarm.alarm_id)) {
      console.log(`[AlarmManager] Duplicate alarm ${alarm.alarm_id} skipped.`);
      return;
    }

    this.shownAlarms.add(alarm.alarm_id);

    if (this.config.onAlarmTriggered) {
      this.config.onAlarmTriggered(alarm);
    }

    this.renderToast(alarm);
  }

  /**
   * Renders a premium toast notification in the top-right corner.
   */
  private renderToast(alarm: AlarmEvent): void {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'sigma-toast';
    toast.setAttribute('data-alarm-id', alarm.alarm_id);

    // Toast header & content
    toast.innerHTML = `
      <div class="sigma-toast-header">
        <svg class="sigma-toast-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span class="sigma-toast-title">${this.escapeHTML(alarm.task_name)}</span>
      </div>
      <div class="sigma-toast-body">마감까지 5분 남았습니다</div>
      <div class="sigma-toast-progress-bar">
        <div class="sigma-toast-progress-fill"></div>
      </div>
    `;

    this.toastContainer.appendChild(toast);

    // After 5 seconds, animate out and remove
    const dismissDuration = 5000;
    
    // Animate progress bar fill draining
    const progressFill = toast.querySelector('.sigma-toast-progress-fill') as HTMLElement;
    if (progressFill) {
      progressFill.style.transition = `width ${dismissDuration}ms linear`;
      // Allow DOM repaint then start draining
      requestAnimationFrame(() => {
        progressFill.style.width = '0%';
      });
    }

    setTimeout(() => {
      // Animate slide-out + fade-out
      toast.classList.add('sigma-toast-exit');
      
      // Wait for exit transition (300ms) before deleting from DOM
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, dismissDuration);
  }

  /**
   * Marks all unread alarms as read.
   */
  public async markAllAlarmsAsRead(): Promise<void> {
    try {
      const token = this.config.authTokenProvider();
      const response = await fetch(`${this.config.apiUrl}/api/alarms/mark-read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark alarms as read');
      }
      
      console.log('[AlarmManager] Successfully marked all alarms as read');
    } catch (error) {
      console.error('[AlarmManager] Error marking alarms as read:', error);
    }
  }

  /**
   * Fetches alarm history split into Section A (Deferred) and Section B (Other).
   */
  public async fetchAlarmHistory(): Promise<AlarmHistoryResponse> {
    try {
      const token = this.config.authTokenProvider();
      const response = await fetch(`${this.config.apiUrl}/api/alarms`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alarm history');
      }

      return await response.json() as AlarmHistoryResponse;
    } catch (error) {
      console.error('[AlarmManager] Error fetching alarm history:', error);
      throw error;
    }
  }

  /**
   * Triggered when the bell button is clicked.
   * Re-fetches the prioritized tasks and performs an animation
   * sliding the deferred tasks (is_deferred = true) to the absolute top of the list container.
   */
  public async handleBellClick(listContainer: HTMLElement): Promise<TaskListResponse> {
    try {
      const token = this.config.authTokenProvider();
      const response = await fetch(`${this.config.apiUrl}/api/tasks/today`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch today tasks');
      }

      const data = await response.json() as TaskListResponse;

      // Animate elements using FLIP transition technique
      this.animateTaskReordering(listContainer, data);

      return data;
    } catch (error) {
      console.error('[AlarmManager] Error in handleBellClick:', error);
      throw error;
    }
  }

  /**
   * Animates task elements re-ordering inside a container (FLIP technique: First, Last, Invert, Play).
   */
  private animateTaskReordering(container: HTMLElement, data: TaskListResponse): void {
    // 1. First: Record current position of all task nodes
    const children = Array.from(container.children) as HTMLElement[];
    const firstPositions = new Map<string, DOMRect>();

    children.forEach((child) => {
      const id = child.getAttribute('data-task-id');
      if (id) {
        firstPositions.set(id, child.getBoundingClientRect());
      }
    });

    // 2. Perform DOM Update (Re-arrange elements in the DOM based on API order)
    // We assume the children nodes are matched by 'data-task-id' corresponding to task_id
    const nodeMap = new Map<string, HTMLElement>();
    children.forEach((child) => {
      const id = child.getAttribute('data-task-id');
      if (id) nodeMap.set(id, child);
    });

    // Append nodes in the new sorted order
    data.tasks.forEach((task) => {
      const node = nodeMap.get(task.task_id.toString());
      if (node) {
        // Apply priority styling if is_deferred
        if (task.is_deferred && task.deferred_count > 0) {
          node.style.borderLeft = '4px solid #E24B4A';
          
          // Ensure badge exists
          let badge = node.querySelector('.sigma-deferred-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'sigma-deferred-badge';
            node.appendChild(badge);
          }
          badge.textContent = `${task.deferred_count}번 미뤄짐`;
        } else {
          node.style.borderLeft = '';
          const badge = node.querySelector('.sigma-deferred-badge');
          if (badge) badge.remove();
        }

        container.appendChild(node);
      }
    });

    // 3. Last & Invert: Calculate displacement and apply transform
    const newChildren = Array.from(container.children) as HTMLElement[];
    newChildren.forEach((child) => {
      const id = child.getAttribute('data-task-id');
      if (!id) return;

      const firstRect = firstPositions.get(id);
      if (!firstRect) return;

      const lastRect = child.getBoundingClientRect();
      const dy = firstRect.top - lastRect.top;
      const dx = firstRect.left - lastRect.left;

      if (dx !== 0 || dy !== 0) {
        // Invert: Disable transition and apply starting transform
        child.style.transition = 'none';
        child.style.transform = `translate(${dx}px, ${dy}px)`;

        // Play: Enable transition and animate to translation(0, 0)
        requestAnimationFrame(() => {
          child.style.transition = 'transform 150ms ease-in-out, border-left 150ms ease-in-out';
          child.style.transform = '';
        });
      }
    });
  }

  /**
   * Helper to update the bell unread badge DOM element if it exists.
   */
  private updateBellBadge(count: number): void {
    const badge = document.querySelector('.sigma-bell-badge');
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count.toString();
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }
  }

  /**
   * Creates the Toast Container element at top: 72px, right: 16px, z-index: 9999.
   */
  private createToastContainer(): void {
    let container = document.getElementById('sigma-toast-container') as HTMLDivElement;
    if (!container) {
      container = document.createElement('div');
      container.id = 'sigma-toast-container';
      document.body.appendChild(container);
    }
    this.toastContainer = container;
  }

  /**
   * Injects the required CSS styles dynamically to match the premium design spec.
   */
  private injectStyles(): void {
    const styleId = 'sigma-alarm-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #sigma-toast-container {
        position: fixed;
        top: 72px;
        right: 16px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }
      .sigma-toast {
        width: 320px;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(226, 75, 74, 0.3);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.08);
        font-family: 'Inter', -apple-system, sans-serif;
        color: #1e1e24;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(120%);
        animation: sigma-slide-in 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        overflow: hidden;
        position: relative;
      }
      [data-theme="dark"] .sigma-toast {
        background: rgba(26, 26, 36, 0.85);
        color: #f4f4f9;
        border: 1px solid rgba(226, 75, 74, 0.4);
      }
      .sigma-toast-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 6px;
      }
      .sigma-toast-icon {
        color: #E24B4A;
        animation: sigma-bell-ring 1s ease infinite alternate;
      }
      .sigma-toast-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
      }
      .sigma-toast-body {
        font-size: 13px;
        opacity: 0.8;
        padding-left: 28px;
        margin-bottom: 12px;
      }
      .sigma-toast-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: rgba(0, 0, 0, 0.05);
      }
      [data-theme="dark"] .sigma-toast-progress-bar {
        background: rgba(255, 255, 255, 0.05);
      }
      .sigma-toast-progress-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #E24B4A, #F08080);
      }
      .sigma-toast-exit {
        animation: sigma-slide-out-fade 300ms ease forwards !important;
      }
      .sigma-deferred-badge {
        background-color: #E24B4A;
        color: white;
        font-size: 11px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 8px;
        display: inline-block;
      }
      .sigma-bell-badge {
        background: #E24B4A;
        color: white;
        font-size: 10px;
        font-weight: 700;
        border-radius: 50%;
        padding: 2px 5px;
        position: absolute;
        top: -2px;
        right: -2px;
        display: none;
      }
      .sigma-bell-badge.visible {
        display: block;
      }
      @keyframes sigma-slide-in {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes sigma-slide-out-fade {
        to {
          opacity: 0;
          transform: translateX(120%);
        }
      }
      @keyframes sigma-bell-ring {
        0% { transform: rotate(0); }
        100% { transform: rotate(15deg); }
      }
    `;
    document.head.appendChild(style);
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
