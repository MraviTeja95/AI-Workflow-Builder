import { NextResponse } from "next/server";

export async function POST() {
  try {
    const demoEmail = process.env.DEMO_USER_EMAIL?.trim() || "demo@workflowbuilder.dev";
    const demoPassword = process.env.DEMO_USER_PASSWORD?.trim() || "SecurePassword123!";

    if (!demoEmail || !demoPassword) {
      return NextResponse.json(
        { error: "Demo user authentication is not configured." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      email: demoEmail,
      password: demoPassword,
    });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to initialize demo authentication." },
      { status: 500 }
    );
  }
}
