import { errorResponse, json } from "../../../lib/server";
import { runtimeEnv } from "../../../lib/runtime";

export async function GET() {
  try {
    await runtimeEnv().DB.prepare("SELECT 1 AS ok").first();
    return json({ status: "ok", database: "connected" });
  } catch (error) {
    return errorResponse(error);
  }
}
