"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ThumbsUp,
  MessageSquare,
  Plus,
  Search,
  TrendingUp,
  Clock,
  Users,
  Flame,
  Send,
} from "lucide-react";
import { mockCourses, mockPosts } from "@/lib/mock-data";
import { Comment, Course, Post, PostCategory } from "@/lib/types";
import {
  addPostComment,
  getCommunityPosts,
  getPostComments,
  saveCommunityPosts,
} from "@/lib/community-storage";
import { getStoredCourses } from "@/lib/course-storage";

const CATEGORIES: PostCategory[] = ["자유", "질문", "정보", "수업", "시험"];

const CATEGORY_COLORS: Record<PostCategory, string> = {
  자유: "bg-slate-100 text-slate-700",
  질문: "bg-blue-50 text-blue-700",
  정보: "bg-green-50 text-green-700",
  수업: "bg-violet-50 text-violet-700",
  시험: "bg-red-50 text-red-700",
};

function PostCard({
  post,
  course,
  onCommentAdded,
}: {
  post: Post;
  course?: Course;
  onCommentAdded: (postId: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");

  function handleLike() {
    setLiked((prev) => !prev);
    setLikes((prev) => (liked ? prev - 1 : prev + 1));
  }

  function toggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen) {
      setComments(getPostComments(post.id));
    }
  }

  function submitComment() {
    const content = commentText.trim();
    if (!content) return;

    const comment: Comment = {
      id: Date.now().toString(),
      postId: post.id,
      authorName: "익명",
      isAnonymous: true,
      content,
      likes: 0,
      createdAt: new Date().toISOString(),
    };

    addPostComment(comment);
    setComments((prev) => [comment, ...prev]);
    setCommentText("");
    onCommentAdded(post.id);
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-muted">익명</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge
                className={`text-[10px] px-1.5 py-0 border-0 font-medium ${
                  CATEGORY_COLORS[post.category]
                }`}
              >
                {post.category}
              </Badge>
              <span className="text-xs text-muted-foreground">{post.authorName}</span>
              {course && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {course.name}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                ·{" "}
                {new Date(post.createdAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <h3 className="font-semibold text-sm leading-snug mb-1">{post.title}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {post.content}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <button
                onClick={handleLike}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  liked ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                {likes}
              </button>
              <button
                onClick={toggleComments}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  commentsOpen
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {post.commentCount}
              </button>
            </div>

            {commentsOpen && (
              <div className="mt-4 border-t pt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="댓글을 입력하세요"
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitComment();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={submitComment}
                    aria-label="댓글 등록"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {comments.length > 0 ? (
                  <div className="space-y-2">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2 rounded-lg bg-muted/50 p-3">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="text-[10px] bg-background">
                            익명
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{comment.authorName}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(comment.createdAt).toLocaleString("ko-KR", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm mt-1 leading-relaxed">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    아직 댓글이 없어요. 첫 댓글을 남겨보세요.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [activeTab, setActiveTab] = useState<"all" | PostCategory>("all");
  const [activeCourseId, setActiveCourseId] = useState<"all" | string>("all");
  const [courses, setCourses] = useState<Course[]>(mockCourses);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    category: "자유" as PostCategory,
    courseId: "",
  });

  useEffect(() => {
    window.setTimeout(() => {
      setCourses(getStoredCourses());
      setPosts(getCommunityPosts());
    }, 0);
  }, []);

  const courseById = useMemo(() => {
    return new Map(courses.map((course) => [course.id, course]));
  }, [courses]);

  const requiresCourse =
    newPost.category === "질문" ||
    newPost.category === "수업" ||
    newPost.category === "시험";

  const filtered = posts.filter((p) => {
    const matchCat = activeTab === "all" || p.category === activeTab;
    const matchCourse = activeCourseId === "all" || p.courseId === activeCourseId;
    const matchSearch =
      !search ||
      p.title.includes(search) ||
      p.content.includes(search) ||
      (p.courseId ? courseById.get(p.courseId)?.name.includes(search) : false);
    return matchCat && matchCourse && matchSearch;
  });

  function submitPost() {
    if (!newPost.title.trim() || !newPost.content.trim()) return;
    if (requiresCourse && !newPost.courseId) return;

    const post: Post = {
      id: Date.now().toString(),
      authorId: "me",
      authorName: "익명",
      isAnonymous: true,
      category: newPost.category,
      title: newPost.title.trim(),
      content: newPost.content.trim(),
      likes: 0,
      commentCount: 0,
      courseId: newPost.courseId || undefined,
      createdAt: new Date().toISOString(),
    };
    const nextPosts = [post, ...posts];
    setPosts(nextPosts);
    saveCommunityPosts(nextPosts);
    setCreateOpen(false);
    setNewPost({ title: "", content: "", category: "자유", courseId: "" });
  }

  function increaseCommentCount(postId: string) {
    setPosts((prev) => {
      const nextPosts = prev.map((post) =>
        post.id === postId
          ? { ...post, commentCount: post.commentCount + 1 }
          : post,
      );
      saveCommunityPosts(nextPosts);
      return nextPosts;
    });
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="커뮤니티" />
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="게시글 검색..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger render={<Button className="gap-2 shrink-0" />}>
                  <Plus className="h-4 w-4" /> 글쓰기
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>새 글 작성</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>카테고리</Label>
                      <Select
                        value={newPost.category}
                        onValueChange={(v) =>
                          setNewPost((p) => ({
                            ...p,
                            category: v as PostCategory,
                            courseId:
                              v === "질문" || v === "수업" || v === "시험"
                                ? p.courseId
                                : "",
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {requiresCourse && (
                      <div className="space-y-2">
                        <Label>질문할 수업</Label>
                        <Select
                          value={newPost.courseId}
                          onValueChange={(value) =>
                            setNewPost((prev) => ({
                              ...prev,
                              courseId: value ?? prev.courseId,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="내 수업 중 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {courses.map((course) => (
                              <SelectItem key={course.id} value={course.id}>
                                {course.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          선택한 수업 커뮤니티에 묶여 같은 수업 글로 분류됩니다.
                        </p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>제목</Label>
                      <Input
                        placeholder="제목을 입력하세요"
                        value={newPost.title}
                        onChange={(e) =>
                          setNewPost((p) => ({ ...p, title: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>내용</Label>
                      <Textarea
                        placeholder="내용을 입력하세요"
                        rows={6}
                        value={newPost.content}
                        onChange={(e) =>
                          setNewPost((p) => ({ ...p, content: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>익명으로 게시됩니다.</span>
                      <Button
                        onClick={submitPost}
                        disabled={
                          !newPost.title.trim() ||
                          !newPost.content.trim() ||
                          (requiresCourse && !newPost.courseId)
                        }
                      >
                        게시하기
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            >
              <TabsList className="bg-white border shadow-sm h-10">
                <TabsTrigger value="all" className="text-xs">
                  전체
                </TabsTrigger>
                {CATEGORIES.map((c) => (
                  <TabsTrigger key={c} value={c} className="text-xs">
                    {c}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="space-y-3">
              {filtered.length > 0 ? (
                filtered.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    course={post.courseId ? courseById.get(post.courseId) : undefined}
                    onCommentAdded={increaseCommentCount}
                  />
                ))
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">게시글이 없어요.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-orange-500" /> 인기글
                </h3>
                <div className="space-y-3">
                  {[...mockPosts]
                    .sort((a, b) => b.likes - a.likes)
                    .slice(0, 3)
                    .map((post, idx) => (
                      <div key={post.id} className="flex gap-2">
                        <span className="text-xs font-bold text-primary w-4 shrink-0">
                          {idx + 1}
                        </span>
                        <p className="text-xs line-clamp-2 leading-snug flex-1">
                          {post.title}
                        </p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" /> 내 수업 커뮤니티
                </h3>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setActiveCourseId("all")}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${
                      activeCourseId === "all" ? "bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">전체 수업</p>
                      <p className="text-[10px] text-muted-foreground">
                        내 수업 글 모두 보기
                      </p>
                    </div>
                    <Badge className="h-4 text-[10px] px-1.5">
                      {posts.filter((post) => post.courseId).length}
                    </Badge>
                  </button>
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setActiveCourseId(course.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${
                        activeCourseId === course.id ? "bg-primary/10" : "hover:bg-accent"
                      }`}
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: course.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{course.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          같은 수업 커뮤니티
                        </p>
                      </div>
                      <Badge className="h-4 text-[10px] px-1.5">
                        {posts.filter((post) => post.courseId === course.id).length}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> 오늘 올라온 글
                  </span>
                  <span className="font-semibold">24개</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> 현재 접속 중
                  </span>
                  <span className="font-semibold">318명</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> 이번 주 게시글
                  </span>
                  <span className="font-semibold">142개</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
