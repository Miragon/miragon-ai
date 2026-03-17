import { trace, SpanStatusCode, propagation, context, metrics } from '@opentelemetry/api';
import { EngineApiError } from './errors.js';
import type { HttpClientConfig } from './types.js';

export interface HttpClient {
  get<T = unknown>(path: string, options?: { params?: Record<string, unknown> }): Promise<T>;
  post<T = unknown>(path: string, options?: { body?: unknown; params?: Record<string, unknown> }): Promise<T>;
  put<T = unknown>(path: string, options?: { body?: unknown }): Promise<T>;
  delete(path: string): Promise<void>;
  postMultipart<T = unknown>(path: string, formData: FormData): Promise<T>;
}

const tracer = trace.getTracer('engine-adapter');
const meter = metrics.getMeter('engine-adapter');
const httpDuration = meter.createHistogram('engine.http.duration_ms', {
  description: 'Duration of engine HTTP requests in milliseconds',
  unit: 'ms',
});

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl, authType, username, password, token } = config;

  function buildHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (authType === 'basic' && username && password) {
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (authType === 'bearer' && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  function buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return '';
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        searchParams.set(key, value.join(','));
      } else {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
  }

  async function request<T>(method: string, path: string, options?: {
    body?: unknown;
    params?: Record<string, unknown>;
    contentType?: string;
    rawBody?: BodyInit;
    rawHeaders?: Record<string, string>;
  }): Promise<T> {
    return tracer.startActiveSpan(`engine.http ${method}`, async (span) => {
      const url = `${baseUrl}${path}${buildQueryString(options?.params)}`;
      span.setAttribute('http.method', method);
      span.setAttribute('http.url', url);
      span.setAttribute('api.path', path);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const start = performance.now();

      try {
        const headers = options?.rawHeaders ?? buildHeaders(options?.contentType ?? (options?.body !== undefined ? 'application/json' : undefined));

        // Inject trace context for end-to-end correlation
        propagation.inject(context.active(), headers);

        const response = await fetch(url, {
          method,
          headers,
          body: options?.rawBody ?? (options?.body !== undefined ? JSON.stringify(options.body) : undefined),
          signal: controller.signal,
        });

        span.setAttribute('http.status_code', response.status);
        httpDuration.record(performance.now() - start, {
          'http.method': method,
          'http.status_code': response.status,
        });

        if (!response.ok) {
          let errorMessage: string;
          try {
            const errorBody = await response.json() as { message?: string };
            errorMessage = errorBody.message ?? response.statusText;
          } catch {
            errorMessage = response.statusText;
          }
          throw new EngineApiError(response.status, errorMessage, `${method} ${path}`);
        }

        if (response.status === 204 || response.headers.get('content-length') === '0') {
          span.setStatus({ code: SpanStatusCode.OK });
          return undefined as T;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return await response.json() as T;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.recordException(error as Error);
        throw error;
      } finally {
        clearTimeout(timeout);
        span.end();
      }
    });
  }

  return {
    get<T = unknown>(path: string, options?: { params?: Record<string, unknown> }): Promise<T> {
      return request<T>('GET', path, { params: options?.params });
    },

    post<T = unknown>(path: string, options?: { body?: unknown; params?: Record<string, unknown> }): Promise<T> {
      return request<T>('POST', path, { body: options?.body, params: options?.params });
    },

    put<T = unknown>(path: string, options?: { body?: unknown }): Promise<T> {
      return request<T>('PUT', path, { body: options?.body });
    },

    async delete(path: string): Promise<void> {
      await request<void>('DELETE', path);
    },

    postMultipart<T = unknown>(path: string, formData: FormData): Promise<T> {
      // Don't set Content-Type header — let fetch set it with the boundary
      const headers = buildHeaders();
      return request<T>('POST', path, { rawBody: formData, rawHeaders: headers });
    },
  };
}
