import { buildMetadataSummary, type listPdfFilesInFolderTree } from "./google.ts";
import type { getAdminClient } from "./supabaseAdmin.ts";

type DriveFile = Awaited<ReturnType<typeof listPdfFilesInFolderTree>>[number];

// Manual sync and webhook retries must preserve classification and avoid duplicate versions.
export async function saveDriveNote(admin: ReturnType<typeof getAdminClient>, userId: string, file: DriveFile) {
  const fields = {
    file_name: file.name,
    file_size: file.size ? Number(file.size) : null,
    drive_folder_id: file.driveFolderId ?? null,
    drive_folder_name: file.driveFolderName ?? null,
    drive_folder_path: file.driveFolderPath ?? [],
    drive_folder_path_ids: file.driveFolderPathIds ?? [],
    drive_modified_time: file.modifiedTime ?? null,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: readError } = await admin.from("notes").select("*")
      .eq("user_id", userId).eq("drive_file_id", file.id).maybeSingle();
    if (readError) throw new Error("Cannot read Drive note");
    const incomingTime = fields.drive_modified_time ? Date.parse(fields.drive_modified_time) : null;
    const savedTime = existing?.drive_modified_time ? Date.parse(existing.drive_modified_time) : null;
    if (existing) {
      if (incomingTime !== null && savedTime !== null && incomingTime < savedTime) return false;
      const unchanged = Object.entries(fields).every(([key, value]) => key === "drive_modified_time"
        ? incomingTime === savedTime : JSON.stringify(existing[key]) === JSON.stringify(value));
      if (unchanged && existing.sync_status === "synced") return false;
    }
    const values = {
      ...fields, title: file.name.replace(/\.[^.]+$/, ""), source: "GoodNotes", sync_status: "synced",
      content: buildMetadataSummary(file, !existing), version: (existing?.version ?? 0) + 1,
    };
    if (!existing) {
      const { error } = await admin.from("notes").insert({ ...values, user_id: userId,
        drive_file_id: file.id, course_name: "미분류", linked_type: "unassigned", tags: ["GoodNotes"] });
      if (error?.code === "23505") continue;
      if (error) throw new Error("Cannot insert Drive note");
      return true;
    }
    const { data, error } = await admin.from("notes").update({ ...values, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("id", existing.id).eq("version", existing.version).select("id").maybeSingle();
    if (error) throw new Error("Cannot update Drive note");
    if (data) return true;
  }
  throw new Error("Drive note changed concurrently; retry sync");
}
