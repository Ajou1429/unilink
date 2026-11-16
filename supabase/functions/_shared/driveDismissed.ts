// 사용자가 UniLink에서 지운 Drive 파일인지 (다시 가져오지 않는다). 0038 적용 전에는 표가 없으므로 지운 것이 없다고 본다.
interface DismissedQuery {
  select(columns: string): DismissedQuery;
  eq(column: string, value: string): DismissedQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export async function isDismissedDriveFile(admin: { from(table: string): unknown }, userId: string, driveFileId: string): Promise<boolean> {
  const query = admin.from("dismissed_drive_files") as DismissedQuery;
  const { data, error } = await query.select("drive_file_id").eq("user_id", userId).eq("drive_file_id", driveFileId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error("Cannot read dismissed Drive files");
  return Boolean(data);
}
