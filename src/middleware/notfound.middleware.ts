import type { Request, Response, NextFunction } from "express";

const notFoundMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    message: "Path not found",
  });
};

export default notFoundMiddleware;