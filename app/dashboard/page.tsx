import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "./LogoutButton";
import { BrandCampaigns } from "./BrandCampaigns";
import { CreatorConnect } from "./CreatorConnect";
import { CreatorChannels, type Channel } from "./CreatorChannels";
import { CreatorCampaigns, type CreatorCampaignRow } from "./CreatorCampaigns";
import { BrowseCampaigns } from "./BrowseCampaigns";
import { StaffSubmissions } from "./StaffSubmissions";
import { StaffCampaignRequests } from "./StaffCampaignRequests";

export default async function DashboardPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const [{ data: brand }, { data: creator }, { data: staff }] = await Promise.all([
    supabase.from("brands").select("id, company_name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("creators")
      .select("id, display_name, stripe_onboarding_complete, stripe_payouts_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    // staff membership check uses the service-role client — same reason as the
    // submissions read below, RLS doesn't grant the regular client visibility here.
    admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!brand && !creator && !staff) {
    redirect("/onboarding");
  }

  let campaigns: {
    id: string;
    title: string;
    budget_amount: number;
    escrow_balance: number;
    currency: string;
    status: string;
    assignedCreators: { displayName: string; agreedAmount: number }[];
  }[] = [];

  if (brand) {
    const { data: rawCampaigns } = await supabase
      .from("campaigns")
      .select("id, title, budget_amount, escrow_balance, currency, status")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false });

    const campaignIds = (rawCampaigns ?? []).map((c) => c.id);
    // Uses the service-role client — a brand has RLS access to the campaign_creators
    // row itself, but not to an arbitrary creator's display_name (only creators can
    // read their own row), so the nested join silently comes back null otherwise.
    const { data: assignments } =
      campaignIds.length > 0
        ? await admin
            .from("campaign_creators")
            .select("campaign_id, agreed_amount, creators(display_name)")
            .in("campaign_id", campaignIds)
        : { data: [] };

    campaigns = (rawCampaigns ?? []).map((c) => ({
      ...c,
      assignedCreators: (assignments ?? [])
        .filter((a: any) => a.campaign_id === c.id)
        .map((a: any) => ({ displayName: a.creators?.display_name ?? "Unknown", agreedAmount: a.agreed_amount })),
    }));
  }

  let creatorCampaignRows: CreatorCampaignRow[] = [];

  if (creator) {
    // Uses the service-role client — creators don't have RLS read access to the
    // campaigns table itself, only to their own campaign_creators assignment rows.
    const { data: assignments } = await admin
      .from("campaign_creators")
      .select("agreed_amount, campaigns(id, title, currency)")
      .eq("creator_id", creator.id);

    const { data: mySubmissions } = await admin
      .from("submissions")
      .select("id, campaign_id, content_url, status, payouts(status)")
      .eq("creator_id", creator.id);

    const submissionsByCampaign = new Map<string, any[]>();
    for (const s of mySubmissions ?? []) {
      const list = submissionsByCampaign.get(s.campaign_id) ?? [];
      list.push(s);
      submissionsByCampaign.set(s.campaign_id, list);
    }

    for (const a of (assignments ?? []) as any[]) {
      const campaign = a.campaigns;
      if (!campaign) continue;
      const subs = submissionsByCampaign.get(campaign.id) ?? [];
      if (subs.length === 0) {
        creatorCampaignRows.push({
          key: campaign.id,
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currency: campaign.currency,
          agreedAmount: a.agreed_amount,
          contentUrl: null,
          submissionStatus: "not_submitted",
          payoutStatus: null,
        });
      } else {
        for (const s of subs) {
          creatorCampaignRows.push({
            key: s.id,
            campaignId: campaign.id,
            campaignTitle: campaign.title,
            currency: campaign.currency,
            agreedAmount: a.agreed_amount,
            contentUrl: s.content_url,
            submissionStatus: s.status,
            payoutStatus: s.payouts?.status ?? null,
          });
        }
      }
    }
  }

  let channels: Channel[] = [];

  if (creator) {
    const { data } = await admin
      .from("creator_channels")
      .select("id, platform, handle_or_url")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false });

    channels = (data ?? []).map((c) => ({
      id: c.id,
      platform: c.platform as Channel["platform"],
      handleOrUrl: c.handle_or_url,
    }));
  }

  let submissions: {
    id: string;
    content_url: string | null;
    agreed_amount: number;
    status: string;
    campaign_title: string;
    currency: string;
    creator_name: string;
    payout_status: string | null;
    rejection_reason: string | null;
    verified_at: string | null;
    flagged_at: string | null;
    flag_reason: string | null;
    flag_resolved_at: string | null;
  }[] = [];

  if (staff) {
    // Staff need cross-user visibility that RLS deliberately doesn't grant to the
    // anon/authenticated role, so this uses the service-role client — same pattern
    // as the staff-gated checks in the API routes (verify membership first, then
    // bypass RLS for the actual privileged read).
    const { data } = await admin
      .from("submissions")
      .select(
        "id, content_url, agreed_amount, status, rejection_reason, verified_at, flagged_at, flag_reason, flag_resolved_at, campaigns(title, currency), creators(display_name), payouts(status)"
      )
      .order("created_at", { ascending: false });

    submissions = (data ?? []).map((s: any) => ({
      id: s.id,
      content_url: s.content_url,
      agreed_amount: s.agreed_amount,
      status: s.status,
      campaign_title: s.campaigns?.title ?? "Unknown campaign",
      currency: s.campaigns?.currency ?? "gbp",
      creator_name: s.creators?.display_name ?? "Unknown creator",
      payout_status: s.payouts?.status ?? null,
      rejection_reason: s.rejection_reason,
      verified_at: s.verified_at,
      flagged_at: s.flagged_at,
      flag_reason: s.flag_reason,
      flag_resolved_at: s.flag_resolved_at,
    }));
  }

  let campaignRequests: {
    id: string;
    campaignTitle: string;
    ratePerCreator: number | null;
    currency: string;
    creatorName: string;
  }[] = [];

  if (staff) {
    const { data } = await admin
      .from("campaign_requests")
      .select("id, campaigns(title, rate_per_creator, currency), creators(display_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    campaignRequests = (data ?? []).map((r: any) => ({
      id: r.id,
      campaignTitle: r.campaigns?.title ?? "Unknown campaign",
      ratePerCreator: r.campaigns?.rate_per_creator ?? null,
      currency: r.campaigns?.currency ?? "gbp",
      creatorName: r.creators?.display_name ?? "Unknown creator",
    }));
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-white">Dashboard</h1>
        <LogoutButton />
      </div>

      <div className="mt-8 space-y-2 text-sm text-white/55">
        <p>Signed in as {user.email}</p>
        {brand && <p>Brand account: {brand.company_name}</p>}
        {creator && <p>Creator account: {creator.display_name}</p>}
        {staff && <p>Staff access enabled</p>}
      </div>

      {brand && <BrandCampaigns campaigns={campaigns} />}
      {creator && (
        <>
          <CreatorChannels channels={channels} />
          <CreatorConnect
            onboardingComplete={creator.stripe_onboarding_complete}
            payoutsEnabled={creator.stripe_payouts_enabled}
          />
          <CreatorCampaigns rows={creatorCampaignRows} />
          <BrowseCampaigns />
        </>
      )}
      {staff && (
        <>
          <StaffCampaignRequests requests={campaignRequests} />
          <StaffSubmissions submissions={submissions} />
        </>
      )}
    </main>
  );
}
