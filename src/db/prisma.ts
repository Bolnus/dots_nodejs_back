import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { DATABASE_CONNECTION_STRING } from "../config.js";

const pool = new pg.Pool({ connectionString: DATABASE_CONNECTION_STRING });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
