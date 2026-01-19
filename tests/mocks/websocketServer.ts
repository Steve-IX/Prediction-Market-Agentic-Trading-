/**
 * Mock WebSocket Server for testing
 * Provides a simple WebSocket server that can simulate platform-specific behavior
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { AddressInfo } from 'net';

export interface MockWebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export class MockWebSocketServer extends EventEmitter {
  private server: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private url: string | null = null;
  private messageHandler?: (ws: WebSocket, message: string) => void;

  constructor(port: number = 0) {
    super();
    this.port = port;
  }

  /**
   * Start the mock WebSocket server
   */
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({ port: this.port });

        this.server.on('listening', () => {
          const address = this.server?.address() as AddressInfo;
          this.port = address.port;
          this.url = `ws://localhost:${this.port}`;
          this.emit('listening', this.url);
          resolve(this.url);
        });

        this.server.on('connection', (ws: WebSocket, req) => {
          this.clients.add(ws);
          this.emit('connection', ws, req);

          ws.on('message', (data: Buffer) => {
            const message = data.toString();
            this.emit('message', ws, message);

            if (this.messageHandler) {
              this.messageHandler(ws, message);
            }
          });

          ws.on('close', () => {
            this.clients.delete(ws);
            this.emit('disconnect', ws);
          });

          ws.on('error', (error) => {
            this.emit('error', ws, error);
          });
        });

        this.server.on('error', (error) => {
          this.emit('server-error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the mock WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      // Close the server
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.url = null;
          this.emit('closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the server URL
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * Send a message to all connected clients
   */
  broadcast(message: string | object): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(client: WebSocket, message: string | object): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }

  /**
   * Set a custom message handler
   */
  setMessageHandler(handler: (ws: WebSocket, message: string) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Simulate Polymarket WebSocket behavior
   */
  simulatePolymarket(): void {
    this.setMessageHandler((ws, message) => {
      try {
        const msg = JSON.parse(message);

        // Handle subscribe
        if (msg.type === 'subscribe' && msg.channel === 'book') {
          // Send initial orderbook snapshot
          const snapshot = {
            type: 'book',
            channel: 'book',
            asset_id: msg.assets_ids?.[0] || 'test-asset',
            bids: [
              { price: '0.50', size: '100' },
              { price: '0.49', size: '200' },
            ],
            asks: [
              { price: '0.51', size: '150' },
              { price: '0.52', size: '250' },
            ],
          };
          this.sendToClient(ws, snapshot);
        }

        // Handle unsubscribe
        if (msg.type === 'unsubscribe') {
          // Acknowledge unsubscribe
          this.sendToClient(ws, { type: 'unsubscribed', channel: msg.channel });
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
  }

  /**
   * Simulate Kalshi WebSocket behavior
   */
  simulateKalshi(): void {
    this.setMessageHandler((ws, message) => {
      try {
        const msg = JSON.parse(message);

        // Handle subscribe command
        if (msg.cmd === 'subscribe') {
          // Send subscription confirmation
          const confirm = {
            type: 'subscription',
            channels: msg.params?.channels || [],
            market_tickers: msg.params?.market_tickers || [],
          };
          this.sendToClient(ws, confirm);

          // Send initial orderbook snapshot
          if (msg.params?.channels?.includes('orderbook')) {
            const ticker = msg.params?.market_tickers?.[0] || 'TEST-2024';
            const snapshot = {
              type: 'orderbook',
              market_ticker: ticker,
              yes: {
                bids: [[50, 100], [49, 200]],
                asks: [[51, 150], [52, 250]],
              },
              no: {
                bids: [[50, 100], [49, 200]],
                asks: [[51, 150], [52, 250]],
              },
              seq: 1,
            };
            this.sendToClient(ws, snapshot);
          }
        }

        // Handle unsubscribe
        if (msg.cmd === 'unsubscribe') {
          this.sendToClient(ws, { type: 'unsubscribed', channels: msg.params?.channels || [] });
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
  }
}
