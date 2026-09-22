import type { Response } from 'express';

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
