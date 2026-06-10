import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class EventsService {
  private clients: Map<string, Response> = new Map();

  addClient(clientId: string, response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    this.clients.set(clientId, response);
    response.on('close', () => this.clients.delete(clientId));
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const response of this.clients.values()) {
      response.write(payload);
    }
  }
}
