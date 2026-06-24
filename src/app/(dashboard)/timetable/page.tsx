"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, MapPin, Clock, BookOpen, X } from "lucide-react";
import { mockCourses, COURSE_COLORS } from "@/lib/mock-data";
import { Course, DayOfWeek } from "@/lib/types";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금"];

export default function TimetablePage() {
  const [courses, setCourses] = useState<Course[]>(mockCourses);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    name: "",
    professor: "",
    location: "",
    days: [] as DayOfWeek[],
    startTime: "09:00",
    endTime: "10:30",
    credits: 3,
    color: COURSE_COLORS[0],
  });

  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);

  function toggleDay(day: DayOfWeek) {
    setNewCourse((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  }

  function addCourse() {
    if (!newCourse.name || newCourse.days.length === 0) return;
    const course: Course = {
      ...newCourse,
      id: Date.now().toString(),
    };
    setCourses((prev) => [...prev, course]);
    setAddOpen(false);
    setNewCourse({
      name: "",
      professor: "",
      location: "",
      days: [],
      startTime: "09:00",
      endTime: "10:30",
      credits: 3,
      color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
    });
  }

  function removeCourse(id: string) {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setSelectedCourse(null);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="시간표" />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted-foreground text-sm">2024년 1학기 · 총 {totalCredits}학점</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button className="gap-2" />}>
              <Plus className="h-4 w-4" /> 수업 추가
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>수업 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>수업명</Label>
                  <Input
                    placeholder="예) 운영체제"
                    value={newCourse.name}
                    onChange={(e) => setNewCourse((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>교수명</Label>
                    <Input
                      placeholder="예) 김철수"
                      value={newCourse.professor}
                      onChange={(e) => setNewCourse((p) => ({ ...p, professor: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>학점</Label>
                    <Select
                      value={String(newCourse.credits)}
                      onValueChange={(v) => v != null && setNewCourse((p) => ({ ...p, credits: Number(v) }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}학점</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>강의실</Label>
                  <Input
                    placeholder="예) 공학관 301"
                    value={newCourse.location}
                    onChange={(e) => setNewCourse((p) => ({ ...p, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>요일</Label>
                  <div className="flex gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                          newCourse.days.includes(day)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>시작 시간</Label>
                    <Input
                      type="time"
                      value={newCourse.startTime}
                      onChange={(e) => setNewCourse((p) => ({ ...p, startTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>종료 시간</Label>
                    <Input
                      type="time"
                      value={newCourse.endTime}
                      onChange={(e) => setNewCourse((p) => ({ ...p, endTime: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>색상</Label>
                  <div className="flex gap-2">
                    {COURSE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCourse((p) => ({ ...p, color }))}
                        className={`h-7 w-7 rounded-full transition-transform ${
                          newCourse.color === color ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <Button onClick={addCourse} className="w-full">추가하기</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Timetable */}
          <div className="lg:col-span-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <TimetableGrid courses={courses} onCourseClick={setSelectedCourse} />
              </CardContent>
            </Card>
          </div>

          {/* Course list / detail */}
          <div className="space-y-4">
            {selectedCourse ? (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">수업 상세</CardTitle>
                    <button onClick={() => setSelectedCourse(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedCourse.color }} />
                    <span className="font-semibold">{selectedCourse.name}</span>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{selectedCourse.professor} 교수</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{selectedCourse.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{selectedCourse.days.join(", ")} {selectedCourse.startTime}–{selectedCourse.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>같은 수업 49명</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-2">
                    <Button size="sm" className="w-full text-xs gap-1">
                      <Users className="h-3.5 w-3.5" /> 수업 커뮤니티 보기
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full text-xs"
                      onClick={() => removeCourse(selectedCourse.id)}
                    >
                      수업 삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">수강 목록</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourse(course)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{course.name}</p>
                        <p className="text-xs text-muted-foreground">{course.days.join("")} · {course.credits}학점</p>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-primary">{totalCredits}</div>
                  <div className="text-xs text-muted-foreground">총 학점</div>
                  <div className="flex justify-center gap-2 mt-3">
                    <Badge variant="secondary" className="text-[10px]">수업 {courses.length}개</Badge>
                    <Badge variant={totalCredits >= 18 ? "destructive" : "secondary"} className="text-[10px]">
                      {totalCredits >= 18 ? "최대 학점" : `${18 - totalCredits}학점 여유`}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
