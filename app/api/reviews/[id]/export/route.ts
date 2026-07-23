import { markdownReport } from "../../../../../lib/reviews";
import { errorResponse, HttpError, requireUser } from "../../../../../lib/server";
import { runtimeEnv } from "../../../../../lib/runtime";
import type { FullAnalysis } from "../../../../../lib/openai";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const env = runtimeEnv();
    const review = await env.DB.prepare(
      "SELECT * FROM reviews WHERE id = ? AND owner_email = ?",
    ).bind(id, user.email).first<Record<string, unknown>>();
    if (!review) throw new HttpError(404, "Review not found.");
    if (!review.result_json) throw new HttpError(409, "This review is not complete.");
    const workspace = await env.DB.prepare(
      "SELECT * FROM workspaces WHERE id = ? AND owner_email = ?",
    ).bind(review.workspace_id, user.email).first<Record<string, unknown>>();
    if (!workspace) throw new HttpError(404, "Workspace not found.");
    const format = new URL(request.url).searchParams.get("format") ?? "markdown";
    const analysis = JSON.parse(String(review.result_json)) as FullAnalysis;
    if (format === "json") {
      return new Response(JSON.stringify({ workspace, review: { ...review, result_json: undefined }, analysis }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="grant-review-v${review.version}.json"`,
        },
      });
    }
    return new Response(markdownReport(workspace, analysis), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="grant-review-v${review.version}.md"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
