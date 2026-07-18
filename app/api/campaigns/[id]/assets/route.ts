import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "image/png"];
const MAX_SIZE_BYTES = 200 * 1024 * 1024;

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type — use mp4, mov, webm, or png" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large — 200MB max" }, { status: 400 });
    }

    const storagePath = `${params.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await admin.storage
      .from("campaign-assets")
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("asset upload route: storage upload failed", uploadError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    const { data: asset, error } = await admin
      .from("campaign_assets")
      .insert({
        campaign_id: params.id,
        file_name: file.name,
        storage_path: storagePath,
        content_type: file.type,
        size_bytes: file.size,
      })
      .select()
      .single();

    if (error) {
      console.error("asset upload route: db insert failed", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ asset });
  } catch (err) {
    console.error("asset upload route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();

    const [{ data: campaign }, { data: staff }] = await Promise.all([
      admin.from("campaigns").select("id, brands!inner(user_id)").eq("id", params.id).single(),
      admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const isOwningBrand = (campaign.brands as any).user_id === user.id;

    let isAssignedCreator = false;
    if (!isOwningBrand && !staff) {
      const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();
      if (creator) {
        const { data: assignment } = await admin
          .from("campaign_creators")
          .select("id")
          .eq("campaign_id", params.id)
          .eq("creator_id", creator.id)
          .maybeSingle();
        isAssignedCreator = Boolean(assignment);
      }
    }

    if (!isOwningBrand && !staff && !isAssignedCreator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: assets } = await admin
      .from("campaign_assets")
      .select("id, file_name, storage_path, content_type, size_bytes, created_at")
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: false });

    const withUrls = await Promise.all(
      (assets ?? []).map(async (a) => {
        // Two separate signed URLs: `url` plays/previews inline (video tag, or opened in
        // a new tab), `downloadUrl` sets Content-Disposition: attachment via Supabase's
        // `download` option so it reliably forces a real save-as on the device instead of
        // just opening/playing in the browser tab — the plain HTML `download` attribute
        // alone isn't honored reliably for cross-origin URLs like Supabase Storage's.
        const [{ data: signed }, { data: signedDownload }] = await Promise.all([
          admin.storage.from("campaign-assets").createSignedUrl(a.storage_path, 3600),
          admin.storage.from("campaign-assets").createSignedUrl(a.storage_path, 3600, { download: a.file_name }),
        ]);
        return {
          id: a.id,
          fileName: a.file_name,
          contentType: a.content_type,
          sizeBytes: a.size_bytes,
          createdAt: a.created_at,
          url: signed?.signedUrl ?? null,
          downloadUrl: signedDownload?.signedUrl ?? null,
        };
      })
    );

    return NextResponse.json({ assets: withUrls });
  } catch (err) {
    console.error("list assets route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
