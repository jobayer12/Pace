declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by HttpLoggerMiddleware. */
      requestId?: string;
    }
  }
}

export {};
