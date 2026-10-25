import { Request, Response } from "express";

const mockAttractions = [
  { id: "1", title: "Cafe Aurora", category: "Cafe", distanceMinutes: 5, image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80", description: "Cozy cafe" },
  { id: "2", title: "Nature Trail", category: "Nature", distanceMinutes: 10, image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80", description: "Forest walk" },
  { id: "3", title: "Old Town", category: "Culture", distanceMinutes: 15, image: "https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=600&q=80", description: "Historic district" },
];

export const listAttractions = async (req: Request, res: Response) => {
  const category = String(req.query.category || "all");
  const data = category === "all" ? mockAttractions : mockAttractions.filter((a) => a.category === category);
  return res.status(200).json({ success: true, data });
};
