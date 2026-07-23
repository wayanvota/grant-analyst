import crypto from "node:crypto";
import { config } from "./config.mjs";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function requestOwner(request) {
  const token = request.get("x-grant-session") || "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new HttpError(401, "A valid private browser session is required.");
  }
  return crypto.createHash("sha256").update(`${config.sessionPepper}:${token}`).digest("hex");
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function cleanText(value, label, { required = false, max = 500 } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new HttpError(400, `${label} is required.`);
  if (text.length > max) throw new HttpError(400, `${label} is too long.`);
  return text || null;
}

export function errorMiddleware(error, _request, response, _next) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error("Grant Analyst API error", error instanceof Error ? error.message : error);
  response.status(status).json({
    error: status >= 500 ? "The request could not be completed." : error.message,
  });
}
