// Web Bluetooth adapter for the tracker's KISS BLE service. Development
// harness only (desktop Chrome); the product uses the Capacitor BLE plugin.
//
// Receive only. Every write to the RX characteristic is a packet the firmware
// hands to LoRa_Utils::sendNewPacket(), i.e. a transmission. This adapter never
// looks up that characteristic, so it cannot transmit by accident.

export const KISS_SERVICE = '00000001-ba2a-46c9-ae49-01b0961f68bb';
export const KISS_TX_NOTIFY = '00000003-ba2a-46c9-ae49-01b0961f68bb';

export function isSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class WebBleTransport {
  #device = null;
  #characteristic = null;
  #onData = () => {};
  #onClose = () => {};

  get deviceName() {
    return this.#device?.name ?? '';
  }

  onData(cb) {
    this.#onData = cb;
  }

  onClose(cb) {
    this.#onClose = cb;
  }

  // Must be called from a user gesture (requestDevice requirement).
  async open() {
    this.#device = await navigator.bluetooth.requestDevice({ filters: [{ services: [KISS_SERVICE] }] });
    this.#device.addEventListener('gattserverdisconnected', () => this.#onClose());
    const server = await this.#device.gatt.connect();
    const service = await server.getPrimaryService(KISS_SERVICE);
    this.#characteristic = await service.getCharacteristic(KISS_TX_NOTIFY);
    this.#characteristic.addEventListener('characteristicvaluechanged', (e) => {
      const v = e.target.value;
      this.#onData(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
    });
    await this.#characteristic.startNotifications();
  }

  async write() {
    throw new Error('web-ble transport is receive-only');
  }

  async close() {
    if (this.#device?.gatt.connected) this.#device.gatt.disconnect();
  }
}
