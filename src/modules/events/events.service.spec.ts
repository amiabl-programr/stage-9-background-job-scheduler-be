import { EventsService } from './events.service';
import type { Response } from 'express';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(() => {
    service = new EventsService();
  });

  it('starts with no clients', () => {
    // No way to check clients directly, but broadcast should not throw
    expect(() => service.broadcast('test', {})).not.toThrow();
  });

  it('adds a client and broadcasts to it', () => {
    const write = jest.fn();
    const on = jest.fn((_event: string, _cb: () => void) => {});
    const mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write,
      on,
    } as unknown as Response;

    service.addClient('client-1', mockRes);
    service.broadcast('job.created', { jobId: '123' });

    expect(write).toHaveBeenCalledWith(
      'event: job.created\ndata: {"jobId":"123"}\n\n',
    );
  });

  it('removes client on close (does not write after close)', () => {
    let closeCb: (() => void) | undefined;
    const on = jest.fn((event: string, cb: () => void) => {
      if (event === 'close') closeCb = cb;
    });
    const write = jest.fn();
    const mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write,
      on,
    } as unknown as Response;

    service.addClient('client-1', mockRes);
    service.broadcast('job.created', { jobId: '123' });
    expect(write).toHaveBeenCalledTimes(1);

    // Simulate close, then broadcast again — write should not increase
    closeCb!();
    service.broadcast('test', {});
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('broadcasts to multiple clients', () => {
    const write1 = jest.fn();
    const write2 = jest.fn();

    const makeRes = (writeFn: jest.Mock) =>
      ({
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: writeFn,
        on: jest.fn(),
      }) as unknown as Response;

    service.addClient('c1', makeRes(write1));
    service.addClient('c2', makeRes(write2));

    service.broadcast('job.failed', { jobId: '456', error: 'ERR' });

    const expected =
      'event: job.failed\ndata: {"jobId":"456","error":"ERR"}\n\n';
    expect(write1).toHaveBeenCalledWith(expected);
    expect(write2).toHaveBeenCalledWith(expected);
  });

  it('broadcasts complex JSON payloads', () => {
    const write = jest.fn();
    const mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write,
      on: jest.fn(),
    } as unknown as Response;

    service.addClient('c1', mockRes);
    service.broadcast('dlq.threshold_exceeded', {
      count: 15,
      threshold: 10,
      lastJobId: 'job-789',
    });

    expect(write).toHaveBeenCalledWith(
      'event: dlq.threshold_exceeded\ndata: {"count":15,"threshold":10,"lastJobId":"job-789"}\n\n',
    );
  });

  it('sets correct SSE headers', () => {
    const setHeader = jest.fn();
    const mockRes = {
      setHeader,
      flushHeaders: jest.fn(),
      write: jest.fn(),
      on: jest.fn(),
    } as unknown as Response;

    service.addClient('c1', mockRes);

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(mockRes.flushHeaders).toHaveBeenCalled();
  });
});
