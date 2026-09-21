import type { Response } from 'express';

/**
 * Runs `callback` exactly once when the response is done, whether it completed
 * normally ('finish') or the client hung up first ('close').
 *
 * Listening only to 'finish' is the common mistake: under load testing, client
 * timeouts and cancelled connections are routine, and every aborted request
 * would silently skip its metric and its access log. An in-flight gauge that
 * only ever increments on those requests drifts upward forever.
 *
 * 'close' also fires after a normal 'finish', hence the guard.
 */
export const onResponseFinalised = (res: Response, callback: () => void): void => {
  let settled = false;
  const run = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    callback();
  };

  res.on('finish', run);
  res.on('close', run);
};
