declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        role?: string | null;
      };
    }
  }
}

export {};
