import { io } from 'socket.io-client';
import { SERVER_URL } from './config.js';

// Thin wrapper around the Socket.IO connection. The rest of the app subscribes
// to high-level game events and sends inputs through here.
export class Net {
  constructor() {
    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    this.selfId = null;
    this.handlers = {};

    this.socket.on('connect', () => this.emitLocal('open'));
    this.socket.on('disconnect', () => this.emitLocal('close'));
    this.socket.on('connect_error', (e) => this.emitLocal('error', e));

    // Forward all game events to local handlers.
    ['init', 'state', 'paint', 'match', 'matchStart', 'shotFx', 'left'].forEach(
      (ev) => this.socket.on(ev, (data) => this.emitLocal(ev, data))
    );
  }

  on(event, cb) {
    (this.handlers[event] ||= []).push(cb);
    return this;
  }

  emitLocal(event, data) {
    (this.handlers[event] || []).forEach((cb) => cb(data));
  }

  join(name) {
    this.socket.emit('join', { name });
  }

  sendInput(x, z, a) {
    this.socket.emit('input', { x, z, a });
  }

  sendShoot(dx, dz) {
    this.socket.emit('shoot', { dx, dz });
  }

  get id() {
    return this.socket.id;
  }
}
