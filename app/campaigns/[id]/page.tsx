import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CampaignDetailBrand } from "./CampaignDetailBrand";
import { CampaignDetailCreator, type MySubmission } from "./CampaignDetailCreator";
import { CampaignSubmissionsTable, type SubmissionRow } from "./CampaignSubmissionsTable";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { deposit?: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const [{ data: campaign }, { data: staff }] = await Promise.all([
    admin
      .from("campaigns")
      .select(
        "id, title, budget_amount, escrow_balance, currency, status, rate_per_creator, max_submissions_per_creator, brands!inner(user_id)"
      )
      .eq("id", params.id)
      .maybeSingle(),
    admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!campaign) {
    redirect("/dashboard");
  }

  const isOwningBrand = (campaign.brands as any).user_id === user.id;

  const { data: creator } = await admin
    .from("creators")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  let assignment: { agreedAmount: number } | null = null;
  if (creator) {
    const { data } = await admin
      .from("campaign_creators")
      .select("agreed_amount")
      .eq("campaign_id", campaign.id)
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (data) assignment = { agreedAmount: data.agreed_amount };
  }

  if (!isOwningBrand && !assignment && !staff) {
    redirect("/dashboard");
  }

  let assignedCreators: { displayName: string; agreedAmount: number }[] = [];
  let submissionRows: SubmissionRow[] = [];
  if (isOwningBrand || staff) {
    const { data: assignments } = await admin
      .from("campaign_creators")
      .select("creator_id, agreed_amount, creators(display_name)")
      .eq("campaign_id", campaign.id);

    assignedCreators = (assignments ?? []).map((a: any) => ({
      displayName: a.creators?.display_name ?? "Unknown",
      agreedAmount: a.agreed_amount,
    }));

    if (isOwningBrand) {
      const [{ data: submissions }, { data: payouts }] = await Promise.all([
        admin
          .from("submissions")
          .select("id, creator_id, content_url, status, rejection_reason, verified_at, flagged_at, flag_reason, flag_resolved_at")
          .eq("campaign_id", campaign.id),
        admin.from("payouts").select("submission_id, status").eq("campaign_id", campaign.id),
      ]);

      const payoutBySubmission = new Map((payouts ?? []).map((p) => [p.submission_id, p.status]));
      const submissionsByCreator = new Map<string, any[]>();
      for (const s of submissions ?? []) {
        const list = submissionsByCreator.get(s.creator_id) ?? [];
        list.push(s);
        submissionsByCreator.set(s.creator_id, list);
      }

      for (const a of assignments ?? []) {
        const displayName = (a.creators as any)?.display_name ?? "Unknown";
        const subs = submissionsByCreator.get(a.creator_id) ?? [];
        if (subs.length === 0) {
          submissionRows.push({
            key: a.creator_id,
            id: null,
            displayName,
            agreedAmount: a.agreed_amount,
            contentUrl: null,
            submissionStatus: "not_submitted",
            payoutStatus: null,
            rejectionReason: null,
            verifiedAt: null,
            flaggedAt: null,
            flagReason: null,
            flagResolvedAt: null,
          });
        } else {
          for (const s of subs) {
            submissionRows.push({
              key: s.id,
              id: s.id,
              displayName,
              agreedAmount: a.agreed_amount,
              contentUrl: s.content_url,
              submissionStatus: s.status as SubmissionRow["submissionStatus"],
              payoutStatus: (payoutBySubmission.get(s.id) ?? null) as SubmissionRow["payoutStatus"],
              rejectionReason: s.rejection_reason,
              verifiedAt: s.verified_at,
              flaggedAt: s.flagged_at,
              flagReason: s.flag_reason,
              flagResolvedAt: s.flag_resolved_at,
            });
          }
        }
      }
    }
  }

  let mySubmissions: MySubmission[] = [];
  if (assignment && creator) {
    const [{ data: subs }, { data: payouts }] = await Promise.all([
      admin
        .from("submissions")
        .select("id, content_url, status, rejection_reason")
        .eq("campaign_id", campaign.id)
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false }),
      admin
        .from("payouts")
        .select("submission_id, status")
        .eq("campaign_id", campaign.id)
        .eq("creator_id", creator.id),
    ]);

    const payoutBySubmission = new Map((payouts ?? []).map((p) => [p.submission_id, p.status]));
    mySubmissions = (subs ?? []).map((s) => ({
      id: s.id,
      contentUrl: s.content_url,
      status: s.status as MySubmission["status"],
      payoutStatus: (payoutBySubmission.get(s.id) ?? null) as MySubmission["payoutStatus"],
      rejectionReason: s.rejection_reason,
    }));
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <Link href="/dashboard" className="text-sm text-white/50 underline">
        &larr; Back to dashboard
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-white">{campaign.title}</h1>
      </div>

      {searchParams.deposit === "success" && (
        <p className="mt-4 border border-positive/30 bg-positive/10 px-4 py-2 text-sm text-positive">
          Payment successful.
        </p>
      )}
      {searchParams.deposit === "cancelled" && (
        <p className="mt-4 border border-white/10 bg-surface px-4 py-2 text-sm text-white/70">
          Payment cancelled.
        </p>
      )}

      <div className="mt-4 space-y-1 text-sm text-white/55">
        <p>
          Status: {campaign.status} — {(campaign.budget_amount / 100).toFixed(2)} {campaign.currency.toUpperCase()}{" "}
          budget, {(campaign.escrow_balance / 100).toFixed(2)} {campaign.currency.toUpperCase()} in escrow
        </p>
        {campaign.rate_per_creator && (
          <p>
            Rate per creator: {(campaign.rate_per_creator / 100).toFixed(2)} {campaign.currency.toUpperCase()}
          </p>
        )}
        <p>
          Max paid videos per creator: {campaign.max_submissions_per_creator}
        </p>
        {assignedCreators.length > 0 && (
          <p>
            Assigned:{" "}
            {assignedCreators.map((a) => `${a.displayName} (${(a.agreedAmount / 100).toFixed(2)})`).join(", ")}
          </p>
        )}
      </div>

      {isOwningBrand && (
        <CampaignDetailBrand
          campaignId={campaign.id}
          status={campaign.status}
          currency={campaign.currency}
        />
      )}

      {isOwningBrand && <CampaignSubmissionsTable rows={submissionRows} currency={campaign.currency} />}

      {assignment && (
        <CampaignDetailCreator
          campaignId={campaign.id}
          agreedAmount={assignment.agreedAmount}
          currency={campaign.currency}
          submissions={mySubmissions}
        />
      )}

      {staff && !isOwningBrand && !assignment && (
        <p className="mt-8 text-sm text-white/50">
          Staff view — manage verification and payouts from the main dashboard.
        </p>
      )}
    </main>
  );
}
