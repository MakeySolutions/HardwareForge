/**
 * Nahranie suboru do lokalneho uloziska appky. Telo requestu je priamo
 * subor (nie multipart) - server ho streamuje na disk bez nacitania do pamate.
 */
export async function uploadToApp(
  params: Record<string, string>,
  body: Blob,
): Promise<{ id: string }> {
  const res = await fetch(`/api/upload?${new URLSearchParams(params)}`, {
    method: "POST",
    body,
    headers: { "Content-Type": body.type || "application/octet-stream" },
  });
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Upload failed (${res.status})`);
  }
  return res.json();
}
