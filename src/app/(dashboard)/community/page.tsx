"use client";

import { useState } from "react";
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
} from "lucide-react";
import { mockCourses, mockPosts } from "@/lib/mock-data";
import { Post, PostCategory } from "@/lib/types";

const CATEGORIES: PostCategory[] = ["자유", "질문", "정보", "수업", "시험"];

const CATEGORY_COLORS: Record<PostCategory, string> = {
  자유: "bg-slate-100 text-slate-700",
  질문: "bg-blue-50 text-blue-700",
  정보: "bg-green-50 text-green-700",
  수업: "bg-violet-50 text-violet-700",
  시험: "bg-red-50 text-red-700",
};

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes);

  function handleLike() {
    setLiked((prev) => !prev);
    setLikes((prev) => (liked ? prev - 1 : prev + 1));
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike();
                }}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  liked ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                {likes}
              </button>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {post.commentCount}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [activeTab, setActiveTab] = useState<"all" | PostCategory>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    category: "자유" as PostCategory,
  });

  const filtered = posts.filter((p) => {
    const matchCat = activeTab === "all" || p.category === activeTab;
    const matchSearch =
      !search || p.title.includes(search) || p.content.includes(search);
    return matchCat && matchSearch;
  });

  function submitPost() {
    if (!newPost.title || !newPost.content) return;
    const post: Post = {
      id: Date.now().toString(),
      authorId: "me",
      authorName: "익명",
      isAnonymous: true,
      category: newPost.category,
      title: newPost.title,
      content: newPost.content,
      likes: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };
    setPosts((prev) => [post, ...prev]);
    setCreateOpen(false);
    setNewPost({ title: "", content: "", category: "자유" });
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
                          setNewPost((p) => ({ ...p, category: v as PostCategory }))
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
                      <Button onClick={submitPost}>게시하기</Button>
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
                filtered.map((post) => <PostCard key={post.id} post={post} />)
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
                  {mockCourses.slice(0, 3).map((course, idx) => (
                    <button
                      key={course.id}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: course.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{course.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[49, 62, 53][idx]}명
                        </p>
                      </div>
                      <Badge className="h-4 text-[10px] px-1.5">{[3, 1, 5][idx]}</Badge>
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
