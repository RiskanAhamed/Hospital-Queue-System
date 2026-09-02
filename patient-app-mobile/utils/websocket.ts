import { Client, IFrame, IMessage } from '@stomp/stompjs';
import { WS_BASE } from './api';

let stompClient: Client | null = null;
let queueSubscription: any = null;
let notificationSubscription: any = null;
let doctorsSubscription: any = null;

export interface QueueSummary {
  doctorId: string;
  currentlyServingToken: string;
  entries: Array<{
    id: string;
    queueNumber: string;
    status: 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED';
  }>;
}

export function connectWebSocket(
  token: string,
  onConnected: (frame: IFrame) => void,
  onDisconnected?: () => void
) {
  if (stompClient?.connected) {
    onConnected({} as IFrame);
    return stompClient;
  }

  stompClient = new Client({
    webSocketFactory: () => new WebSocket('wss://hospital-queue-system-production.up.railway.app/ws-queue'),
    connectHeaders: {
      Authorization: `Bearer ${token}`,
    },
    debug: (str) => {
      console.log('[STOMP]', str);
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
  });

  stompClient.onConnect = (frame) => {
    // console.log('STOMP Connected successfully');
    onConnected(frame);
  };

  stompClient.onWebSocketClose = () => {
    // console.log('STOMP Connection closed');
    if (onDisconnected) onDisconnected();
  };

  stompClient.onStompError = (frame) => {
    console.error('STOMP Error:', frame.headers['message']);
  };

  stompClient.activate();
  return stompClient;
}

export function subscribeToQueue(
  hospitalId: string,
  doctorId: string,
  onMessage: (summary: QueueSummary) => void
) {
  if (!stompClient || !stompClient.connected) {
    console.warn('STOMP Client is not connected');
    return;
  }

  if (queueSubscription) {
    queueSubscription.unsubscribe();
    queueSubscription = null;
  }

  const topic = `/topic/hospital/${hospitalId}/queue/${doctorId}`;
  queueSubscription = stompClient.subscribe(topic, (message: IMessage) => {
    try {
      const summary = JSON.parse(message.body) as QueueSummary;
      onMessage(summary);
    } catch (e) {
      console.error('Error parsing queue update:', e);
    }
  });
}

export function unsubscribeFromQueue() {
  if (queueSubscription) {
    queueSubscription.unsubscribe();
    queueSubscription = null;
  }
}

export function subscribeToNotifications(
  hospitalId: string,
  userId: string,
  onMessage: () => void
) {
  if (!stompClient || !stompClient.connected) {
    console.warn('STOMP Client is not connected');
    return;
  }

  if (notificationSubscription) {
    notificationSubscription.unsubscribe();
    notificationSubscription = null;
  }

  const topic = `/topic/hospital/${hospitalId}/user/${userId}/notifications`;
  notificationSubscription = stompClient.subscribe(topic, () => {
    onMessage();
  });
}

export function subscribeToDoctors(
  hospitalId: string,
  onMessage: (doctor: any) => void
) {
  if (!stompClient || !stompClient.connected) {
    console.warn('STOMP Client is not connected');
    return;
  }

  if (doctorsSubscription) {
    doctorsSubscription.unsubscribe();
    doctorsSubscription = null;
  }

  const topic = `/topic/hospital/${hospitalId}/doctors`;
  doctorsSubscription = stompClient.subscribe(topic, (message: IMessage) => {
    try {
      const doctor = JSON.parse(message.body);
      onMessage(doctor);
    } catch (e) {
      console.error('Error parsing doctor update:', e);
    }
  });
}

export function unsubscribeFromDoctors() {
  if (doctorsSubscription) {
    doctorsSubscription.unsubscribe();
    doctorsSubscription = null;
  }
}

export function disconnectWebSocket() {
  unsubscribeFromQueue();
  unsubscribeFromDoctors();
  if (notificationSubscription) {
    notificationSubscription.unsubscribe();
    notificationSubscription = null;
  }
  if (stompClient) {
    stompClient.deactivate();
    stompClient = null;
  }
}

export function getStompClient() {
  return stompClient;
}
