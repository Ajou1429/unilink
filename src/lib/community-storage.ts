import { mockPosts } from "./mock-data";
import { Comment, Post } from "./types";

const COMMENTS_STORAGE_KEY = "unilink:comments";
const POSTS_STORAGE_KEY = "unilink:posts";

const defaultComments: Comment[] = [
  {
    id: "c1",
    postId: "1",
    authorName: "익명",
    isAnonymous: true,
    content: "교수님이 3장 연습문제까지 보라고 하셨어요.",
    likes: 3,
    createdAt: "2024-03-20T11:00:00Z",
  },
  {
    id: "c2",
    postId: "1",
    authorName: "익명",
    isAnonymous: true,
    content: "강의자료 7주차 PDF도 같이 보면 좋을 것 같아요.",
    likes: 1,
    createdAt: "2024-03-20T11:20:00Z",
  },
  {
    id: "c3",
    postId: "2",
    authorName: "익명",
    isAnonymous: true,
    content: "오전 7시 맞춰서 들어가니까 진짜 잡히네요.",
    likes: 5,
    createdAt: "2024-03-19T15:00:00Z",
  },
];

function readComments(): Comment[] {
  if (typeof window === "undefined") return defaultComments;

  try {
    const raw = window.localStorage.getItem(COMMENTS_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(defaultComments));
      return defaultComments;
    }
    return JSON.parse(raw) as Comment[];
  } catch {
    return defaultComments;
  }
}

function writeComments(comments: Comment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(comments));
}

function readPosts(): Post[] {
  if (typeof window === "undefined") return mockPosts;

  try {
    const raw = window.localStorage.getItem(POSTS_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(mockPosts));
      return mockPosts;
    }
    return JSON.parse(raw) as Post[];
  } catch {
    return mockPosts;
  }
}

function writePosts(posts: Post[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts));
}

export function getCommunityPosts(): Post[] {
  return readPosts();
}

export function saveCommunityPosts(posts: Post[]) {
  writePosts(posts);
}

export function getPostComments(postId: string): Comment[] {
  return readComments().filter((comment) => comment.postId === postId);
}

export function addPostComment(comment: Comment) {
  const comments = readComments();
  writeComments([comment, ...comments]);
}
