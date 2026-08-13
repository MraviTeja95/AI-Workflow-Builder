import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const authHeader = request.headers.get("x-custom-auth") || "";

  return NextResponse.json({
    status: 200,
    method: "GET",
    queryParam: q,
    receivedHeaders: {
      "x-custom-auth": authHeader,
    },
    message: "HTTP GET executed successfully.",
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = { raw: "empty_or_text" };
  }

  const customHeader = request.headers.get("x-api-key") || "";

  // Failure simulation hook
  if (body.simulate_error === true) {
    return NextResponse.json(
      { error: "Internal Server Error Simulation", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: 200,
    method: "POST",
    receivedData: body,
    receivedApiKey: customHeader,
    message: "HTTP POST processed successfully.",
  });
}
