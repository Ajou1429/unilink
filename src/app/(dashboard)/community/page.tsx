"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, CalendarDays, MessageSquare, Plus, Search, ThumbsUp } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AJOU_TERM, type CatalogSection } from "@/lib/ajou-catalog";
import { getAllStoredCourses, COURSES_CHANGED_EVENT } from "@/lib/course-storage";
import { getCurrentAcademicTermLabel } from "@/lib/academic-term";
import { getCurrentUser, AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { buildCourseBoards, filterCoursePosts, matchesBoardSearch, referenceForBoard, resolvePostBoardKey, type CourseBoard } from "@/lib/course-community";
import { addPostComment, COMMUNITY_POSTS_CHANGED_EVENT, getCommunitySnapshot, publishCommunityPost, togglePostLike, type CommunityState } from "@/lib/community-storage";
import type { Comment, Course, Post, PostCategory } from "@/lib/types";

const CATEGORIES: PostCategory[] = ["자유", "질문", "정보", "수업", "시험"];
const selectClass = "h-10 min-w-0 rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:ring-blue-500";
const dateLabel = (value: string) => new Date(value).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function PostCard({ post, board, comments, liked, actorId, focused, onOpenBoard }: {
  post: Post; board?: CourseBoard; comments: Comment[]; liked: boolean; actorId: string; focused: boolean; onOpenBoard: (board: CourseBoard) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  function comment() {
    try {
      addPostComment({ id: crypto.randomUUID(), postId: post.id, authorName: "익명", isAnonymous: true, content: text, likes: 0, createdAt: new Date().toISOString() });
      setText("");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "댓글을 저장하지 못했습니다."); }
  }
  return <article id={"community-post-" + post.id} className={"rounded-2xl border bg-white p-5 shadow-sm " + (focused ? "ring-2 ring-blue-500" : "")}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">{post.category}</span>
      {board && <button onClick={() => onOpenBoard(board)} className="font-medium text-slate-700 hover:underline">{board.name}</button>}
      <span>{post.courseBoard?.registrationNumber ? "분반 " + post.courseBoard.registrationNumber : board ? "과목 공통" : post.courseId ? "이전 수업" : "일반 게시판"}</span>
      <span className="ml-auto">{dateLabel(post.createdAt)}</span>
    </div>
    <h3 className="break-words font-semibold text-slate-900">{post.title}</h3>
    <p className={"mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 " + (expanded || focused ? "" : "line-clamp-3")}>{post.content}</p>
    {(post.content.length > 120 || post.content.split("\n").length > 3) && <button className="mt-2 text-xs text-blue-700" onClick={() => setExpanded((v) => !v)}>{expanded ? "본문 접기" : "본문 전체 보기"}</button>}
    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
      <span>{post.isAnonymous ? "익명" : post.authorName}</span>
      <button aria-label={"좋아요 " + post.likes} aria-pressed={liked} className={"ml-auto flex items-center gap-1.5 " + (liked ? "text-blue-700" : "")} onClick={() => { try { togglePostLike(post.id, actorId); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "좋아요를 저장하지 못했습니다."); } }}><ThumbsUp className="h-4 w-4" />{post.likes}</button>
      <button aria-label={"댓글 " + comments.length} aria-expanded={showComments} className="flex items-center gap-1.5" onClick={() => setShowComments((v) => !v)}><MessageSquare className="h-4 w-4" />{comments.length}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {showComments && <div className="mt-4 space-y-3 border-t pt-4">
      {comments.map((c) => <div key={c.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between text-xs text-slate-500"><span>{c.isAnonymous ? "익명" : c.authorName}</span><span>{dateLabel(c.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.content}</p></div>)}
      {!comments.length && <p className="text-xs text-slate-500">첫 댓글을 남겨보세요.</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); comment(); }}><Input aria-label="댓글 내용" maxLength={2000} placeholder="댓글을 입력하세요" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit" size="sm" disabled={!text.trim()}>댓글 등록</Button></form>
    </div>}
  </article>;
}

function Composer({ boards, initialBoard, initialSection, actorId, onSaved }: {
  boards: CourseBoard[]; initialBoard: string; initialSection: string; actorId: string; onSaved: (post: Post) => void;
}) {
  const [boardKey, setBoardKey] = useState(initialBoard);
  const [section, setSection] = useState(initialSection);
  const [category, setCategory] = useState<PostCategory>("질문");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const board = boards.find((b) => b.key === boardKey);
  function submit() {
    try {
      if (boardKey !== "general" && !board) throw new Error("게시판을 선택해주세요.");
      const reference = board ? referenceForBoard(board, section) : undefined;
      const post: Post = { id: crypto.randomUUID(), authorId: actorId, authorName: "익명", isAnonymous: true, category, title, content, likes: 0, commentCount: 0, createdAt: new Date().toISOString(),
        ...(reference ? { courseBoard: reference } : {}),
        ...(board && section ? { courseId: board.sections.find((s) => s.registrationNumber === section)?.courseId } : {}),
      };
      publishCommunityPost(post);
      onSaved(post);
    } catch (e) { setError(e instanceof Error ? e.message : "글을 저장하지 못했습니다."); }
  }
  return <>
    <DialogHeader><DialogTitle>수업 커뮤니티 글쓰기</DialogTitle><DialogDescription>선택한 과목과 분반을 확인해주세요. 익명으로 표시됩니다.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="block space-y-1 text-sm"><span>게시판</span><select aria-label="작성 게시판" className={selectClass + " w-full"} value={boardKey} onChange={(e) => { setBoardKey(e.target.value); setSection(""); }}><option value="general">일반 게시판</option>{boards.map((b) => <option key={b.key} value={b.key}>{b.name} · {b.term}</option>)}</select></label>
      {board && <label className="block space-y-1 text-sm"><span>글을 공유할 분반</span><select aria-label="작성 분반" className={selectClass + " w-full"} value={section} onChange={(e) => setSection(e.target.value)}><option value="">과목 공통 · 모든 분반</option>{board.sections.map((s) => <option key={s.registrationNumber} value={s.registrationNumber}>{s.registrationNumber} · {s.professor || "교수 미정"}{s.mine ? " · 내 분반" : ""}</option>)}</select></label>}
      <label className="block space-y-1 text-sm"><span>말머리</span><select aria-label="작성 말머리" className={selectClass + " w-full"} value={category} onChange={(e) => setCategory(e.target.value as PostCategory)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="block space-y-1 text-sm"><span>제목</span><Input aria-label="글 제목" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 이번 주 과제 범위가 어디까지인가요?" /></label>
      <label className="block space-y-1 text-sm"><span>내용</span><Textarea aria-label="글 내용" maxLength={10000} rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="같은 수업을 듣는 학생들에게 질문과 정보를 남겨보세요." /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">이 브라우저에 저장됩니다.</span><Button type="submit" disabled={!title.trim() || !content.trim()}>게시하기</Button></div>
    </form>
  </>;
}

function CommunityContent() {
  const queryKey = useSearchParams().toString();
  const [snapshot, setSnapshot] = useState<CommunityState>({ posts: [], comments: [], likes: {} });
  const [courses, setCourses] = useState<Course[]>([]);
  const [catalog, setCatalog] = useState<CatalogSection[]>([]);
  const [ready, setReady] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [actorId, setActorId] = useState("local-guest");
  const [term, setTerm] = useState(() => getCurrentAcademicTermLabel());
  const [view, setView] = useState("my");
  const [section, setSection] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("latest");
  const [boardSearch, setBoardSearch] = useState("");
  const [explore, setExplore] = useState(false);
  const [boardLimit, setBoardLimit] = useState(20);
  const [postLimit, setPostLimit] = useState(30);
  const [focused, setFocused] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const appliedLink = useRef<string | null>(null);

  useEffect(() => {
    function sync() {
      try {
        setSnapshot(getCommunitySnapshot());
        setCourses(getAllStoredCourses());
        setActorId(getCurrentUser()?.id || "local-guest");
        setError("");
      } catch { setError("저장된 커뮤니티 데이터를 읽지 못했습니다. 기존 데이터는 보존되어 있습니다."); }
      setReady(true);
    }
    const timer = window.setTimeout(sync, 0);
    for (const event of [COMMUNITY_POSTS_CHANGED_EVENT, COURSES_CHANGED_EVENT, AUTH_CHANGED_EVENT, "storage"]) window.addEventListener(event, sync);
    return () => {
      window.clearTimeout(timer);
      for (const event of [COMMUNITY_POSTS_CHANGED_EVENT, COURSES_CHANGED_EVENT, AUTH_CHANGED_EVENT, "storage"]) window.removeEventListener(event, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    import("@/data/ajou-2026-2.json").then((data) => { if (active) setCatalog(data.courses); })
      .catch(() => { if (active) setCatalogError("아주대 개설 목록을 불러오지 못했습니다. 새로고침해주세요."); })
      .finally(() => { if (active) setCatalogReady(true); });
    return () => { active = false; };
  }, []);

  const boards = useMemo(() => buildCourseBoards(courses, catalog, AJOU_TERM, snapshot.posts), [courses, catalog, snapshot.posts]);
  const board = boards.find((b) => b.key === view);
  const myBoards = boards.filter((b) => b.term === term && b.myCourseIds.length > 0);
  const terms = [...new Set([getCurrentAcademicTermLabel(), AJOU_TERM, ...boards.map((b) => b.term)])].sort().reverse();
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const p of snapshot.posts) { const key = resolvePostBoardKey(p, boards) || "general"; result.set(key, (result.get(key) || 0) + 1); }
    return result;
  }, [snapshot.posts, boards]);
  const listedBoards = (explore ? boards.filter((b) => b.term === term) : myBoards).filter((b) => matchesBoardSearch(b, boardSearch));
  const filtered = filterCoursePosts(snapshot.posts, boards, { view, term, section, category, search, sort });
  const activeFeed = filterCoursePosts(snapshot.posts, boards, { view, term, section });
  const popular = [...activeFeed].sort((a, b) => b.likes - a.likes).slice(0, 3);
  const composerBoards = [...new Map([...myBoards, ...(board ? [board] : [])].filter((b) => !b.archived).map((b) => [b.key, b])).values()];

  function selectView(next: string, nextSection = "") {
    setView(next); setSection(nextSection); setCategory(""); setSearch(""); setFocused(""); setPostLimit(30);
    const target = boards.find((b) => b.key === next);
    if (target) setTerm(target.term);
    const url = new URL(window.location.href);
    url.search = "";
    if (target) { url.searchParams.set("board", next); if (nextSection) url.searchParams.set("section", nextSection); }
    window.history.replaceState(null, "", url);
  }

  useEffect(() => {
    if (!ready || !catalogReady || appliedLink.current === queryKey) return;
    const params = new URLSearchParams(queryKey);
    const post = snapshot.posts.find((p) => p.id === params.get("postId"));
    const courseId = params.get("courseId");
    const target = post ? resolvePostBoardKey(post, boards) || "general"
      : params.get("board") || (courseId ? boards.find((b) => b.myCourseIds.includes(courseId) || b.sections.some((s) => s.courseId === courseId))?.key : undefined);
    const selected = boards.find((b) => b.key === target);
    const targetSection = courseId && selected ? selected.sections.find((s) => s.courseId === courseId)?.registrationNumber : params.get("section");
    const timer = window.setTimeout(() => {
      appliedLink.current = queryKey;
      if (target && (selected || target === "general" || target === "legacy")) {
        setView(target);
        if (selected) setTerm(selected.term);
        setSection("");
        setCategory("");
        setSearch("");
        if (!post && targetSection && selected?.sections.some((s) => s.registrationNumber === targetSection)) setSection(targetSection);
        if (post) { setFocused(post.id); setPostLimit(snapshot.posts.length); }
      } else if (params.get("postId") || params.get("courseId") || params.get("board")) setError("연결된 글 또는 수업을 찾지 못했습니다. 게시판 목록에서 선택해주세요.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, catalogReady, boards, snapshot.posts, queryKey]);

  useEffect(() => {
    if (!focused) return;
    const timer = window.setTimeout(() => document.getElementById("community-post-" + focused)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [focused]);

  function saved(post: Post) {
    setCreateOpen(false);
    selectView(post.courseBoard?.key || "general", post.courseBoard?.registrationNumber || "");
    setFocused(post.id);
    const url = new URL(window.location.href); url.searchParams.set("postId", post.id); window.history.replaceState(null, "", url);
  }

  return <div className="min-h-screen">
    <Header title="수업 커뮤니티" />
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
        <div><p className="text-xs font-semibold text-blue-700">시간표에서 이어지는 수업 이야기</p><h1 className="mt-1 text-xl font-bold text-slate-900">같은 과목, 같은 분반과 함께</h1><p className="mt-2 text-sm text-slate-600">내 시간표의 과목을 자동으로 연결하고, 분반별 질문과 정보를 모아보세요.</p></div>
        <Button variant="outline" render={<Link href="/timetable" />}><CalendarDays className="h-4 w-4" />시간표 편성하기</Button>
      </div>
      <p className="text-xs text-slate-500">현재 글·댓글은 이 브라우저에만 저장됩니다. 다른 기기·사용자와의 온라인 공유는 아직 연결되지 않았습니다.</p>
      {(error || catalogError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || catalogError}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_240px]">
        <aside className="space-y-4 rounded-2xl border bg-white p-4" aria-label="수업 게시판 목록">
          <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-blue-600" />수업 게시판</div>
          <select aria-label="게시판 학기" className={selectClass + " w-full"} value={term} onChange={(e) => { setTerm(e.target.value); selectView("my"); setBoardLimit(20); }}>{terms.map((t) => <option key={t}>{t}</option>)}</select>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"><button className={"rounded-md py-2 text-xs " + (!explore ? "bg-white font-semibold shadow-sm" : "")} aria-pressed={!explore} onClick={() => { setExplore(false); setBoardLimit(20); }}>내 수업 {myBoards.length}</button><button className={"rounded-md py-2 text-xs " + (explore ? "bg-white font-semibold shadow-sm" : "")} aria-pressed={explore} onClick={() => { setExplore(true); setBoardLimit(20); }}>개설 과목 탐색</button></div>
          <Input aria-label="수업 게시판 검색" placeholder="과목·교수·수강번호 검색" value={boardSearch} onChange={(e) => { setBoardSearch(e.target.value); setBoardLimit(20); }} />
          <button aria-pressed={view === "my"} className={"w-full rounded-lg p-3 text-left text-sm " + (view === "my" ? "bg-blue-50 font-semibold text-blue-800" : "hover:bg-slate-50")} onClick={() => selectView("my")}>내 수업 모아보기 <span className="float-right text-xs">{myBoards.reduce((sum, b) => sum + (counts.get(b.key) || 0), 0)}</span></button>
          <div className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[50vh]">
            {listedBoards.slice(0, boardLimit).map((b) => <button key={b.key} aria-label={"게시판 " + b.name + " " + b.courseCode} aria-pressed={view === b.key} onClick={() => selectView(b.key)} className={"w-full rounded-lg border p-3 text-left " + (view === b.key ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-slate-50")}>
              <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{b.name}</span><span className="text-xs text-slate-500">{counts.get(b.key) || 0}</span></div>
              <p className="mt-1 text-[11px] text-slate-500">{b.courseCode || "직접 추가"} · {b.sections.length}개 분반{b.archived ? " · 보관됨" : ""}</p>
              {b.myCourseIds.length > 0 && <p className="mt-1 text-[11px] text-blue-600">내 분반 {b.sections.filter((s) => s.mine).map((s) => s.registrationNumber).join(", ")}</p>}
            </button>)}
            {!listedBoards.length && <p className="p-3 text-xs leading-relaxed text-slate-500">{!ready || !catalogReady ? "수업을 불러오는 중…" : boardSearch ? "검색 결과가 없습니다." : "이 학기에 담은 수업이 없습니다. 시간표에서 과목을 추가하거나 개설 과목을 탐색해보세요."}</p>}
            {listedBoards.length > boardLimit && <Button size="sm" variant="ghost" className="w-full" onClick={() => setBoardLimit((v) => v + 20)}>게시판 더 보기</Button>}
          </div>
          <div className="space-y-1 border-t pt-3"><button className="w-full rounded-lg p-2 text-left text-sm hover:bg-slate-50" aria-pressed={view === "general"} onClick={() => selectView("general")}>일반 게시판 · {counts.get("general") || 0}</button>{Boolean(counts.get("legacy")) && <button className="w-full rounded-lg p-2 text-left text-xs text-slate-500" onClick={() => selectView("legacy")}>이전 수업 글 보관함 · {counts.get("legacy")}</button>}</div>
        </aside>
        <main className="min-w-0 space-y-4">
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-blue-600">{board ? board.university + " · " + board.term : term}</p><h2 className="mt-1 text-lg font-bold">{board?.name || (view === "my" ? "내 수업 모아보기" : view === "general" ? "일반 게시판" : "이전 수업 글 보관함")}</h2><p className="mt-1 text-xs text-slate-500">{board ? board.courseCode + " · " + board.sections.length + "개 분반 · " + activeFeed.length + "개 글" : "현재 선택한 게시판의 글 " + activeFeed.length + "개"}</p></div><Button onClick={() => setCreateOpen(true)} disabled={!ready || !!error || view === "legacy" || !!board?.archived} className="shrink-0 gap-1"><Plus className="h-4 w-4" />글쓰기</Button></div>
            {board && <div className="mt-4 space-y-2"><select aria-label="분반 필터" className={selectClass + " w-full"} value={section} onChange={(e) => { setSection(e.target.value); setFocused(""); setPostLimit(30); }}><option value="">전체 분반</option>{board.sections.map((s) => <option key={s.registrationNumber} value={s.registrationNumber}>{s.registrationNumber} · {s.professor || "교수 미정"}{s.mine ? " · 내 분반" : ""}</option>)}</select><p className="text-xs text-slate-500">분반을 선택하면 해당 분반 글과 과목 공통 글을 함께 보여줍니다.</p>{section && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{board.sections.find((s) => s.registrationNumber === section)?.schedule || "강의시간 미기재"}</p>}</div>}
          </section>
          <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="게시글 검색" placeholder="제목·내용 검색" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPostLimit(30); }} /></div><select aria-label="게시글 정렬" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}><option value="latest">최신순</option><option value="popular">인기순</option></select></div>
          <div className="flex flex-wrap gap-2" aria-label="말머리 필터">{["", ...CATEGORIES].map((c) => <button key={c} aria-pressed={category === c} className={"rounded-full border px-3 py-1.5 text-xs " + (category === c ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-slate-600")} onClick={() => { setCategory(c); setPostLimit(30); }}>{c || "전체 글"}</button>)}</div>
          <p role="status" className="text-xs text-slate-500">{!ready ? "글을 불러오는 중…" : filtered.length + "개의 글"}</p>
          {filtered.slice(0, postLimit).map((post) => <PostCard key={post.id} post={post} board={boards.find((b) => b.key === resolvePostBoardKey(post, boards))} comments={snapshot.comments.filter((c) => c.postId === post.id)} liked={(snapshot.likes[post.id] || []).includes(actorId)} actorId={actorId} focused={focused === post.id} onOpenBoard={(b) => selectView(b.key)} />)}
          {filtered.length > postLimit && <Button variant="outline" className="w-full" onClick={() => setPostLimit((v) => v + 30)}>글 더 보기</Button>}
          {ready && !filtered.length && <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><MessageSquare className="mx-auto h-8 w-8 text-blue-200" /><p className="mt-3 font-medium">{search || category ? "조건에 맞는 글이 없습니다." : "아직 게시글이 없습니다."}</p><p className="mt-2 text-sm text-slate-500">{view === "my" && !myBoards.length ? "시간표에서 과목을 담으면 내 수업 게시판이 연결됩니다." : "첫 질문이나 수업 정보를 남겨보세요."}</p></div>}
        </main>
        <aside className="hidden space-y-4 xl:block">
          <section className="rounded-2xl border bg-white p-4"><h3 className="text-sm font-semibold">이 게시판의 인기글</h3><div className="mt-3 space-y-3">{popular.map((p, i) => <button key={p.id} className="flex w-full gap-2 text-left text-xs" onClick={() => { setCategory(""); setSearch(""); setPostLimit(snapshot.posts.length); setFocused(p.id); }}><span className="font-bold text-blue-600">{i + 1}</span><span className="line-clamp-2">{p.title}</span></button>)}{!popular.length && <p className="text-xs text-slate-500">글이 등록되면 표시됩니다.</p>}</div></section>
          <section className="space-y-2 rounded-2xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600"><h3 className="font-semibold text-slate-800">게시판 연결 기준</h3><p>아주대 과목은 학기와 과목 ID로 묶고 수강번호로 분반을 구분합니다.</p><p>시간표에서 수업을 빼도 이미 작성한 글은 보존됩니다.</p><p>직접 추가한 수업은 별도 게시판으로 구분됩니다.</p><p>개설 자료: 2026-09-02 기준</p></section>
        </aside>
      </div>
    </div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">{createOpen && <Composer boards={composerBoards} initialBoard={board?.key || (view === "general" ? "general" : myBoards[0]?.key || "general")} initialSection={section} actorId={actorId} onSaved={saved} />}</DialogContent></Dialog>
  </div>;
}

export default function CommunityPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">수업 게시판을 불러오는 중…</p>}><CommunityContent /></Suspense>;
}
