import { EventEmitter } from 'events';

export const parentPort = new EventEmitter();

// Simulate postMessage by emitting an event that tests can listen to
parentPort.postMessage = (msg) => {
  parentPort.emit('workerMessage', msg);
};

export class Worker {}

export default {
  parentPort,
  Worker,
};
