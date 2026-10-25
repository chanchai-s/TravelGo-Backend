import express from "express";
import { listUserPosts, createUserPost, toggleUserPostLike } from "../controllers/posts.controllers";
import authCheck from "../middleware/error.middleware";

const postRoutes = express.Router();

postRoutes.get("/posts", listUserPosts);
postRoutes.post("/posts", authCheck, createUserPost);
postRoutes.post("/posts/:id/like", authCheck, toggleUserPostLike);

export default postRoutes;
