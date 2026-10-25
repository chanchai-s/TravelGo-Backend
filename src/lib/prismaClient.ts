import "dotenv/config";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST ?? "localhost",
  user: process.env.DATABASE_USER ?? "root",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "travel_app",
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

export default prisma;