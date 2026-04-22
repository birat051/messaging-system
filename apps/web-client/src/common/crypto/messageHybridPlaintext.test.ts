import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseDecryptedHybridUtf8,
  serializeHybridInnerPlaintextV1,
} from './messageHybridPlaintext';

describe('messageHybridPlaintext v1', () => {
  it('serializes media+text as JSON; text-only without media stays raw', () => {
    expect(
      serializeHybridInnerPlaintextV1({
        text: 'hi',
        mediaObjectKey: 'users/u/k.png',
      }),
    ).toBe('{"v":1,"t":"hi","m":{"k":"users/u/k.png"}}');
    expect(
      serializeHybridInnerPlaintextV1({
        text: 'caption',
        mediaObjectKey: null,
      }),
    ).toBe('caption');
  });

  it('parses v1 JSON back to caption + key + url fields', () => {
    const p = parseDecryptedHybridUtf8(
      '{"v":1,"t":"x","m":{"k":"users/a/b.jpg"}}',
    );
    expect(p).toEqual({
      text: 'x',
      mediaObjectKey: 'users/a/b.jpg',
      mediaRetrievableUrl: null,
    });
  });

  it('includes m.u when mediaRetrievableUrl is a valid http(s) URL', () => {
    expect(
      serializeHybridInnerPlaintextV1({
        text: '',
        mediaObjectKey: 'users/u/k.png',
        mediaRetrievableUrl: 'https://cdn.example.com/o/k.png',
      }),
    ).toBe(
      '{"v":1,"m":{"k":"users/u/k.png","u":"https://cdn.example.com/o/k.png"}}',
    );
  });

  it('derives m.u from VITE public URL when env is set', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    expect(
      serializeHybridInnerPlaintextV1({
        text: '',
        mediaObjectKey: 'users/1/a.png',
      }),
    ).toBe(
      '{"v":1,"m":{"k":"users/1/a.png","u":"http://localhost:9000/messaging-media/users/1/a.png"}}',
    );
  });

  it('uses m.b when public URL cannot be built from env', () => {
    vi.unstubAllEnvs();
    expect(
      serializeHybridInnerPlaintextV1({
        text: '',
        mediaObjectKey: 'users/1/a.png',
      }),
    ).toBe('{"v":1,"m":{"k":"users/1/a.png"}}');
  });

  it('treats legacy ciphertext-looking strings as plain text when not v1 JSON', () => {
    expect(parseDecryptedHybridUtf8('hello')).toEqual({
      text: 'hello',
      mediaObjectKey: null,
      mediaRetrievableUrl: null,
    });
  });

  it('resolves mediaRetrievableUrl from m.b + m.k', () => {
    const p = parseDecryptedHybridUtf8(
      '{"v":1,"m":{"k":"users/1/a.png","b":"http://localhost:9000/messaging-media"}}',
    );
    expect(p.mediaObjectKey).toBe('users/1/a.png');
    expect(p.mediaRetrievableUrl).toBe(
      'http://localhost:9000/messaging-media/users/1/a.png',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
