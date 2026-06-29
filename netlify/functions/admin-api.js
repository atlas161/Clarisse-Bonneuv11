import { EventEmitter } from 'node:events';

const normalizeHeaders = (headers = {}) =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key || '').toLowerCase(), value]));

const createMockRequest = (event) => {
  const req = new EventEmitter();
  const body =
    typeof event.body === 'string'
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '';

  req.method = event.httpMethod || 'GET';
  req.headers = normalizeHeaders(event.headers);
  const searchParams = new URLSearchParams(event.queryStringParameters || {});
  const route = String(searchParams.get('route') || '').replace(/^\/+/, '');
  searchParams.delete('route');
  req.url = `${route ? `/${route}` : '/'}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  queueMicrotask(() => {
    if (body) {
      req.emit('data', body);
    }
    req.emit('end');
  });

  return req;
};

const createMockResponse = () => {
  let statusCode = 200;
  const headers = {};
  let body = '';
  let ended = false;
  let resolveResponse;

  const done = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  return {
    response: {
      get ended() {
        return ended;
      },
      get statusCode() {
        return statusCode;
      },
      set statusCode(value) {
        statusCode = value;
      },
      setHeader(name, value) {
        headers[name] = value;
      },
      end(value = '') {
        if (ended) {
          return;
        }
        ended = true;
        body = value;
        resolveResponse({
          statusCode,
          headers,
          body,
        });
      },
    },
    done,
  };
};

export const handler = async (event) => {
  const req = createMockRequest(event);
  const { response, done } = createMockResponse();
  const timeoutMs = 9_500;
  const { handleAdminApi } = await import('../../server/admin-api.js');

  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      if (!response.ended) {
        response.statusCode = 504;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ error: 'admin_api_timeout', message: "Le serveur a mis trop de temps a repondre." }));
      }
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([handleAdminApi(req, response), timeout]);
  } catch (error) {
    console.error('[netlify-admin-api]', error);
    if (!response.ended) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(
        JSON.stringify({
          error: 'netlify_handler_error',
          message: error instanceof Error ? error.message : 'Une erreur inattendue est survenue.',
        })
      );
    }
  }

  if (!response.ended) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ error: 'admin_api_no_response', message: 'Aucune reponse retournee.' }));
  }

  return done;
};
