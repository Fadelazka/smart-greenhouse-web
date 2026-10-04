import type {
  ActuatorName,
  ActuatorState,
  Calibration,
  ActivityRow,
  DeviceMode,
  HardwareComponentId,
  HardwareStatus,
  HistoryRange,
  HistoryResponse,
  PublicUser,
  Thresholds,
} from '@/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api';
const TOKEN_KEY = 'greenhouse.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage tidak tersedia (mis. mode privat) - abaikan */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const message =
      (isJson && payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? `Permintaan gagal (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /** Validasi token yang tersimpan dan ambil profil terbaru dari server. */
  me: () => request<{ user: PublicUser }>('/auth/me'),

  history: (range: HistoryRange) =>
    request<HistoryResponse>(`/sensors/history?range=${range}`),

  latest: () => request<Record<string, number | string>>('/sensors/latest'),

  activity: (limit = 50) => request<{ entries: ActivityRow[] }>(`/logs/activity?limit=${limit}`),

  /**
   * Catat perubahan status komponen hardware ke activity log yang sama dengan
   * halaman Log Aktivitas, memakai tipe `sensor_error` yang sudah ada.
   *
   * Sengaja tidak `await` di call site: log hardware adalah pelengkap, bukan
   * jalur kritis. Kegagalan POST tidak boleh menggagalkan pergantian status di
   * scene, jadi promise-nya dibiarkan tanpa catch dan log lokal tetap jadi
   * sumber tampilan di panel Hardware.
   */
  logHardwareChange: (change: {
    component: HardwareComponentId;
    from: HardwareStatus;
    to: HardwareStatus;
    reason: string;
  }) =>
    request<{ ok: boolean; message: string }>('/logs/activity', {
      method: 'POST',
      body: JSON.stringify(change),
    }),

  alerts: (limit = 50) => request<{ alerts: Array<Record<string, string>> }>(`/logs/alerts?limit=${limit}`),

  setActuator: (actuator: ActuatorName, state: ActuatorState, overrideSeconds = 60) =>
    request<{ ok: boolean; message: string }>('/control/actuator', {
      method: 'POST',
      body: JSON.stringify({ actuator, state, overrideSeconds }),
    }),

  setMode: (mode: DeviceMode) =>
    request<{ ok: boolean; message: string }>('/control/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  restart: () => request<{ ok: boolean; message: string }>('/control/restart', { method: 'POST' }),

  settings: () => request<{ thresholds: Thresholds; calibration: Calibration }>('/settings'),

  saveThresholds: (thresholds: Thresholds) =>
    request<{ ok: boolean; message: string }>('/settings/thresholds', {
      method: 'PUT',
      body: JSON.stringify({ thresholds }),
    }),

  saveCalibration: (calibration: Calibration) =>
    request<{ ok: boolean; message: string }>('/settings/calibration', {
      method: 'PUT',
      body: JSON.stringify({ calibration }),
    }),

  exportUrl: (range: HistoryRange) => `${API_URL}/sensors/export.csv?range=${range}`,
};
