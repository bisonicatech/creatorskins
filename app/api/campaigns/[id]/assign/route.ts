import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, brands!inner(user_id)")
      .eq("id", params.id)
      .single();

    if (!campaign || (campaign.brands as any).user_id !== user.id) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { email, creatorId: creatorIdInput, agreedAmount } = (await request.json()) as {
      email?: string;
      creatorId?: string;
      agreedAmount: number;
    };

    if (!Number.isInteger(agreedAmount) || agreedAmount <= 0) {
      return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
    }

    let creatorId = creatorIdInput ?? null;

    if (!creatorId) {
      if (!email) {
        return NextResponse.json({ error: "Provide either email or creatorId" }, { status: 400 });
      }
      const { data } = await admin.rpc("get_creator_id_by_email", { p_email: email });
      creatorId = data;
    }

    if (!creatorId) {
      return NextResponse.json({ error: "No creator found with that email" }, { status: 404 });
    }

    const { data: assignment, error } = await admin
      .from("campaign_creators")
      .insert({ campaign_id: params.id, creator_id: creatorId, agreed_amount: agreedAmount })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That creator is already assigned to this campaign" }, { status: 409 });
      }
      console.error("assign creator route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ assignment });
  } catch (err) {
    console.error("assign creator route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
