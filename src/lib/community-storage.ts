import type { Comment, Post } from "./types";

export const COMMUNITY_POSTS_CHANGED_EVENT = "unilink:communityPostsChanged";
export const COMMUNITY_STORAGE_KEY = "unilink:community-v2";
export interface CommunityState {
  posts: Post[];
  comments: Comment[];
  likes: Record<string, string[]>;
}

function readState(): CommunityState {
  if (typeof window === "undefined") return { posts: [], comments: [], likes: {} };
  const raw = window.localStorage.getItem(COMMUNITY_STORAGE_KEY);
  if (raw) {
    const state = JSON.parse(raw) as CommunityState;
    if (!Array.isArray(state.posts) || !Array.isArray(state.comments) || !state.likes || typeof state.likes !== "object") throw new Error("커뮤니티 저장 데이터를 읽을 수 없습니다. 브라우저 데이터를 지우지 말고 백업을 확인해주세요.");
    return state;
  }
  // Preserve legacy keys as a backup. Never seed new boards with sample posts.
  const posts = JSON.parse(window.localStorage.getItem("unilink:posts") || "[]") as Post[];
  const comments = JSON.parse(window.localStorage.getItem("unilink:comments") || "[]") as Comment[];
  if (!Array.isArray(posts) || !Array.isArray(comments)) throw new Error("기존 커뮤니티 데이터를 확인해주세요.");
  return { posts, comments, likes: {} };
}

function writeState(state: CommunityState) {
  if (typeof window === "undefined") return;
  // One storage write commits posts, comments and reactions together.
  window.localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(COMMUNITY_POSTS_CHANGED_EVENT));
}

export function getCommunitySnapshot(): CommunityState {
  const state = readState();
  const counts = new Map<string, number>();
  for (const comment of state.comments) counts.set(comment.postId, (counts.get(comment.postId) || 0) + 1);
  return { ...state, posts: state.posts.map((p) => ({ ...p, commentCount: counts.get(p.id) || 0 })) };
}

export function getCommunityPosts(): Post[] {
  return getCommunitySnapshot().posts;
}

export function saveCommunityPosts(posts: Post[]) {
  writeState({ ...readState(), posts });
}

export function publishCommunityPost(post: Post) {
  if (!post.title.trim() || !post.content.trim()) throw new Error("제목과 내용을 입력해주세요.");
  if (post.title.length > 120 || post.content.length > 10000) throw new Error("제목은 120자, 내용은 10,000자 이하로 작성해주세요.");
  const state = readState();
  if (state.posts.some((p) => p.id === post.id)) throw new Error("이미 등록된 글입니다.");
  writeState({ ...state, posts: [{ ...post, title: post.title.trim(), content: post.content.trim(), likes: 0, commentCount: 0 }, ...state.posts] });
}

export function getPostComments(postId: string): Comment[] {
  return readState().comments.filter((c) => c.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addPostComment(comment: Comment) {
  if (!comment.content.trim() || comment.content.length > 2000) throw new Error("댓글은 1~2,000자로 입력해주세요.");
  const state = readState();
  if (!state.posts.some((p) => p.id === comment.postId)) throw new Error("게시글을 찾을 수 없습니다.");
  if (state.comments.some((c) => c.id === comment.id)) return;
  writeState({ ...state, comments: [...state.comments, { ...comment, content: comment.content.trim() }] });
}

export function hasLikedPost(postId: string, actorId: string) {
  return (readState().likes[postId] || []).includes(actorId);
}

export function togglePostLike(postId: string, actorId: string) {
  const state = readState();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");
  const actors = state.likes[postId] || [];
  const liked = actors.includes(actorId);
  writeState({ ...state,
    posts: state.posts.map((p) => p.id === postId ? { ...p, likes: Math.max(0, p.likes + (liked ? -1 : 1)) } : p),
    likes: { ...state.likes, [postId]: liked ? actors.filter((id) => id !== actorId) : [...actors, actorId] },
  });
}
