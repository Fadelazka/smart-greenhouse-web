import { useEffect, useRef } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { getSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@/store/sensorStore';
import type { Alert, DeviceStatus, Telemetry } from '@/types';
import type { ActuatorName, ActuatorState, DeviceMode, Thresholds } from '@/types';

type ControlMessage = {
  actuator?: ActuatorName;
  state?: ActuatorState;
  mode?: DeviceMode;
  overrideUntil?: number | null;
  restart?: boolean;
};

/**
 * Satu listener Socket.io untuk seluruh aplikasi.
 * Komponen subscribe ke store Zustand, bukan ke socket langsung,
 * supaya re-render tidak berantai.
 */
export function useSocket(): void {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    const { actions } = useSensorStore.getState();

    const onConnect = () => actions.setConnected(true);
    const onDisconnect = () => actions.setConnected(false);

    const onTelemetry = (payload: Telemetry) => actions.pushTelemetry(payload);

    const onStatus = (payload: DeviceStatus) =>
      actions.setStatus({
        status: payload.status,
        firmware: payload.firmware,
        uptime: payload.uptime,
      });

    const onAlert = (payload: Alert) => actions.pushAlert(payload);

    const onControl = (payload: ControlMessage) => {
      if (payload.actuator && payload.state) actions.setActuator(payload.actuator, payload.state);
      if (payload.mode) actions.setMode(payload.mode);
    };

    const onConfig = (payload: { thresholds?: Thresholds }) => {
      if (payload.thresholds) actions.setThresholds(payload.thresholds);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.TELEMETRY, onTelemetry);
    socket.on(SOCKET_EVENTS.STATUS, onStatus);
    socket.on(SOCKET_EVENTS.ALERT, onAlert);
    socket.on(SOCKET_EVENTS.CONTROL, onControl);
    socket.on(SOCKET_EVENTS.CONFIG, onConfig);

    if (socket.connected) actions.setConnected(true);

    // Liveness check: tandai offline kalau telemetry diam > 10 detik.
    const timer = setInterval(() => useSensorStore.getState().actions.checkLiveness(), 1000);

    return () => {
      clearInterval(timer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENTS.TELEMETRY, onTelemetry);
      socket.off(SOCKET_EVENTS.STATUS, onStatus);
      socket.off(SOCKET_EVENTS.ALERT, onAlert);
      socket.off(SOCKET_EVENTS.CONTROL, onControl);
      socket.off(SOCKET_EVENTS.CONFIG, onConfig);
      initialized.current = false;
    };
  }, []);
}
