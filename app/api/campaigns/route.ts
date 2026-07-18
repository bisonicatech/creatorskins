import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { title, budgetAmount, ratePerCreator, maxSubmissionsPerCreator } = (await request.json()) as {
      title: string;
      budgetAmount: number;
      ratePerCreator?: number;
      maxSubmissionsPerCreator?: number;
    };

    if (!title || !Number.isInteger(budgetAmount) || budgetAmount <= 0) {
      return NextResponse.json({ error: "Invalid campaign details" }, { status: 400 });
    }

    if (ratePerCreator !== undefined && (!Number.isInteger(ratePerCreator) || ratePerCreator <= 0)) {
      return NextResponse.json({ error: "Invalid rate per creator" }, { status: 400 });
    }

    if (
      maxSubmissionsPerCreator !== undefined &&
      (!Number.isInteger(maxSubmissionsPerCreator) || maxSubmissionsPerCreator <= 0)
    ) {
      return NextResponse.json({ error: "Invalid max submissions per creator" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).single();

    if (!brand) {
      return NextResponse.json({ error: "No brand profile found for this account" }, { status: 403 });
    }

    const { data: campaign, error } = await admin
      .from("campaigns")
      .insert({
        brand_id: brand.id,
        title,
        budget_amount: budgetAmount,
        rate_per_creator: ratePerCreator ?? null,
        ...(maxSubmissionsPerCreator !== undefined && { max_submissions_per_creator: maxSubmissionsPerCreator }),
      })
      .select()
      .single();

    if (error) {
      console.error("create campaign route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("create campaign route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
