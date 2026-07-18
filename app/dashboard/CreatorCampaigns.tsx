import Link from "next/link";

export type CreatorCampaignRow = {
  key: string;
  campaignId: string;
  campaignTitle: string;
  currency: string;
  agreedAmount: number;
  contentUrl: string | null;
  submissionStatus: "not_submitted" | "pending" | "verified" | "rejected";
  payoutStatus: "processing" | "pending" | "paid" | "failed" | null;
};

function statusLabel(row: CreatorCampaignRow) {
  if (row.submissionStatus === "not_submitted") return "Awaiting your content";
  if (row.submissionStatus === "rejected") return "Rejected";
  if (row.submissionStatus === "pending") return "This video is now awaiting verification before payout — please bear with us";
  if (row.payoutStatus === "paid") return "Paid";
  if (row.payoutStatus === "processing") return "Payout processing";
  if (row.payoutStatus === "failed") return "Payout failed";
  return "Verified — payout pending";
}

export function CreatorCampaigns({ rows }: { rows: CreatorCampaignRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-medium text-white">Your campaigns</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">No campaigns assigned yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="py-2 pr-4 font-display text-xs font-medium uppercase tracking-wider">Campaign</th>
                <th className="py-2 pr-4 font-display text-xs font-medium uppercase tracking-wider">Rate</th>
                <th className="py-2 pr-4 font-display text-xs font-medium uppercase tracking-wider">Content</th>
                <th className="py-2 pr-4 font-display text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-white/5">
                  <td className="py-2 pr-4 text-white">{row.campaignTitle}</td>
                  <td className="py-2 pr-4 text-white/70">
                    {(row.agreedAmount / 100).toFixed(2)} {row.currency.toUpperCase()}
                  </td>
                  <td className="py-2 pr-4">
                    {row.contentUrl ? (
                      <a href={row.contentUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                        View
                      </a>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-white/70">{statusLabel(row)}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/campaigns/${row.campaignId}`} className="text-accent underline">
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
