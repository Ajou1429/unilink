import { isDemoMode, DEMO_MODE_KEY } from "./demo-mode";
import { getStorageUser, privateStorage } from "./private-storage";
import { mockCourses, mockNotes, mockPosts, mockStudyPlans } from "./mock-data";
import { getCurrentAcademicTermLabel } from "./academic-term";

/** Only seed the isolated demo namespace; never migrate these rows to an account. */
export function initializeDemoData() {
  if (!isDemoMode() || getStorageUser()) return;
  window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
  const now = new Date().toISOString();
  const plans = mockStudyPlans.map(plan => ({ ...plan, dueDate: now.slice(0, 10), createdAt: now }));
  const samples: Record<string, unknown> = {
    "unilink:courses": mockCourses.map(course => ({ ...course, term: getCurrentAcademicTermLabel() })),
    "unilink:course-notes": mockNotes,
    "unilink:course-plans": plans,
    "unilink:weekly-study-plans": plans,
    "unilink:community-v2": { posts: mockPosts, comments: [], likes: {} },
    "unilink:my-notes": mockNotes.map(note => ({
      ...note, title: `[샘플] ${note.title}`, linkedType: "course", linkedId: note.courseId,
      linkedTitle: note.courseName, source: "직접 작성", syncStatus: "manual", version: 1,
      createdAt: now, updatedAt: now,
    })),
  };
  for (const [key, value] of Object.entries(samples)) {
    if (privateStorage.getItem(key) === null) privateStorage.setItem(key, JSON.stringify(value));
  }
}
