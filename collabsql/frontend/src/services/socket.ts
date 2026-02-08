import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  joinDatabase(databaseId: number) {
    this.socket?.emit('join-database', databaseId);
  }

  leaveDatabase(databaseId: number) {
    this.socket?.emit('leave-database', databaseId);
  }

  notifyQueryExecuted(data: {
    databaseId: number;
    queryType: string;
    affectedTables?: string;
    rowsAffected?: number;
  }) {
    this.socket?.emit('query-executed', data);
  }

  onUserJoined(callback: (data: any) => void) {
    this.socket?.on('user-joined', callback);
  }

  onUserLeft(callback: (data: any) => void) {
    this.socket?.on('user-left', callback);
  }

  onDatabaseUpdated(callback: (data: any) => void) {
    this.socket?.on('database-updated', callback);
  }

  onJoinedDatabase(callback: (data: any) => void) {
    this.socket?.on('joined-database', callback);
  }

  typing(databaseId: number) {
    this.socket?.emit('typing', databaseId);
  }

  stopTyping(databaseId: number) {
    this.socket?.emit('stop-typing', databaseId);
  }

  onUserTyping(callback: (data: any) => void) {
    this.socket?.on('user-typing', callback);
  }

  onUserStopTyping(callback: (data: any) => void) {
    this.socket?.on('user-stop-typing', callback);
  }

  heartbeat() {
    this.socket?.emit('heartbeat');
  }

  removeAllListeners() {
    this.socket?.removeAllListeners();
  }
}

export default new SocketService();
