import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/backend/contracts/http";

export function jsonOk<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    ok(data, {
      timestamp: new Date().toISOString(),
      apiVersion: "v1",
      ...(meta ?? {}),
    }),
    { status },
  );
}

export function jsonError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(fail(code, message, details), { status });
}
