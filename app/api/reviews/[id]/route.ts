import { errorResponse, HttpError, json, requireUser } from "../../../../lib/server";
import { runtimeEnv } from "../../../../lib/runtime";

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
    const [findings, claims, sources] = await Promise.all([
      env.DB.prepare("SELECT * FROM findings WHERE review_id = ? ORDER BY created_at").bind(id).all(),
      env.DB.prepare("SELECT * FROM claims WHERE review_id = ? ORDER BY created_at").bind(id).all(),
      env.DB.prepare("SELECT * FROM sources WHERE review_id = ? ORDER BY reliability_tier, created_at").bind(id).all(),
    ]);
    return json({
      review: {
        ...review,
        result: review.result_json ? JSON.parse(String(review.result_json)) : null,
        result_json: undefined,
      },
      findings: findings.results,
      claims: claims.results,
      sources: sources.results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
