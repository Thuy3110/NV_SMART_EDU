"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  GraduationCap,
  Info,
  Layers,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

type Plo = {
  id: number;
  code: string;
  name: string;
  rate: number;
  status: "Đạt" | "Cần cải thiện" | "Chưa đạt";
  result: "Xuất sắc" | "Tốt" | "Khá" | "Trung bình";
  hk1?: number;
  hk2?: number;
};

type MajorItem = {
  id: number;
  code: string;
  name: string;
  programName?: string;
  courseCount: number;
  ploCount: number;
  cloCount: number;
  assessmentCount?: number;
  averagePloRate: number | null;
};

type ScoreSpectrumItem = {
  range: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
};

type Analysis = {
  studentCount: number;
  ploCount: number;
  programCount: number;
  matrixCount: number;
  assessmentCount?: number;
  averagePloRate: number;
  averageCloRate?: number;
  selectedMajor?: {
    id: number;
    code: string;
    name: string;
  } | null;
  selectedSchoolYear: string;
  academicYears: string[];
  majors: MajorItem[];
  plos: Plo[];
  scoreSpectrum?: ScoreSpectrumItem[];
  resultDistribution?: {
    achieved: number;
    notAchieved: number;
    xuatSac: number;
    tot: number;
    kha: number;
    trungBinh: number;
    yeu: number;
  };
};

export default function ScoreAnalysisPage() {
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [selectedMajorCode, setSelectedMajorCode] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<string>("all");

  // Local Search & Tab Filters
  const [ploFilter, setPloFilter] = useState<"ALL" | "ACHIEVED" | "WARNING" | "NOT_ACHIEVED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [majorSearch, setMajorSearch] = useState("");

  const fetchData = async (majorCode?: string, year?: string, semester?: string, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const params = new URLSearchParams();
      if (majorCode) params.set("major", majorCode);
      if (year) params.set("schoolYear", year);
      if (semester && semester !== "all") params.set("semester", semester);

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API}/statistics/analysis${queryString}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi lỗi (HTTP ${res.status})`);
      }

      const result: Analysis = await res.json();
      setData(result);

      if (result.selectedMajor?.code && !majorCode) {
        setSelectedMajorCode(result.selectedMajor.code);
      }
      if (result.selectedSchoolYear && !year) {
        setSelectedYear(result.selectedSchoolYear);
      }
    } catch (err: any) {
      console.error("Lỗi khi tải dữ liệu phân tích phổ điểm:", err);
      setError(err?.message || "Không thể tải dữ liệu phân tích phổ điểm.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMajorChange = (code: string) => {
    setSelectedMajorCode(code);
    fetchData(code, selectedYear, selectedSemester);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    fetchData(selectedMajorCode, year, selectedSemester);
  };

  const handleSemesterChange = (semester: string) => {
    setSelectedSemester(semester);
    fetchData(selectedMajorCode, selectedYear, semester);
  };

  const handleRefresh = () => {
    fetchData(selectedMajorCode, selectedYear, selectedSemester, true);
  };

  // Xuất file Excel báo cáo phân tích phổ điểm
  const handleExportExcel = () => {
    if (!data) return;

    const currentMajorName = data.selectedMajor?.name || selectedMajorCode || "Tong-hop";
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Chi tiết PLO
    const ploRows = (data.plos || []).map((p, idx) => ({
      STT: idx + 1,
      "Mã PLO": p.code,
      "Nội dung chuẩn đầu ra": p.name,
      "Tỷ lệ đạt (%)": p.rate,
      "Ngưỡng chuẩn (%)": 75,
      "Trạng thái": p.status,
      "Xếp loại": p.result,
      "Học kỳ 1 (%)": p.hk1 ?? p.rate,
      "Học kỳ 2 (%)": p.hk2 ?? p.rate,
    }));
    const ploSheet = XLSX.utils.json_to_sheet(ploRows.length > 0 ? ploRows : [{ ThongBao: "Chưa có dữ liệu PLO" }]);
    XLSX.utils.book_append_sheet(workbook, ploSheet, "KetQua_PLO");

    // Sheet 2: So sánh ngành
    const majorRows = (data.majors || []).map((m, idx) => ({
      STT: idx + 1,
      "Mã ngành": m.code,
      "Tên ngành": m.name,
      "Chương trình": m.programName || "",
      "Số học phần": m.courseCount,
      "Số PLO": m.ploCount,
      "Số CLO": m.cloCount,
      "Tỷ lệ PLO bình quân (%)": m.averagePloRate !== null ? m.averagePloRate : "Chưa có điểm",
    }));
    const majorSheet = XLSX.utils.json_to_sheet(majorRows);
    XLSX.utils.book_append_sheet(workbook, majorSheet, "SoSanh_Nganh");

    XLSX.writeFile(workbook, `Phan-tich-pho-diem-${data.selectedMajor?.code || "OBE"}-${data.selectedSchoolYear || "2024"}.xlsx`);
  };

  // Filtered PLOs
  const filteredPlos = useMemo(() => {
    if (!data?.plos) return [];
    return data.plos.filter((plo) => {
      const matchSearch =
        plo.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plo.name.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (ploFilter === "ACHIEVED") return plo.status === "Đạt";
      if (ploFilter === "WARNING") return plo.status === "Cần cải thiện";
      if (ploFilter === "NOT_ACHIEVED") return plo.status === "Chưa đạt";
      return true;
    });
  }, [data?.plos, searchTerm, ploFilter]);

  // Filtered Majors for right table
  const filteredMajors = useMemo(() => {
    if (!data?.majors) return [];
    if (!majorSearch.trim()) return data.majors;
    const term = majorSearch.toLowerCase();
    return data.majors.filter((m) =>
      m.code.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term) ||
      (m.programName && m.programName.toLowerCase().includes(term))
    );
  }, [data?.majors, majorSearch]);

  // Insights
  const bestPlo = useMemo(() => {
    if (!data?.plos || data.plos.length === 0) return null;
    return [...data.plos].sort((a, b) => b.rate - a.rate)[0];
  }, [data?.plos]);

  const lowestPlo = useMemo(() => {
    if (!data?.plos || data.plos.length === 0) return null;
    return [...data.plos].sort((a, b) => a.rate - b.rate)[0];
  }, [data?.plos]);

  return (
    <AdminLayout>
      <div className="space-y-6 pb-12">
        {/* ========================================================================= */}
        {/* HEADER & CONTROLS BAR                                                     */}
        {/* ========================================================================= */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#881337] text-white shadow-md shadow-[#881337]/20">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Phân tích phổ điểm & Đánh giá CĐR
                </h1>
                <p className="text-sm text-slate-500">
                  Theo dõi kết quả đo lường Chuẩn đầu ra (PLO/CLO), phân bố phổ điểm và tỷ lệ đạt chuẩn OBE
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-[#881337]" : "text-slate-500"}`} />
              <span>{refreshing ? "Đang tải..." : "Làm mới"}</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={!data || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#881337] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#70102d] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Xuất báo cáo Excel</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FILTER BAR                                                                */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-12 items-end">
            {/* Major Dropdown */}
            <div className="lg:col-span-6 space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ngành đào tạo
              </label>
              <div className="relative">
                <select
                  value={selectedMajorCode || data?.selectedMajor?.code || ""}
                  onChange={(e) => handleMajorChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                >
                  {data?.majors.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} - {m.name} {m.ploCount > 0 ? `(${m.ploCount} PLO)` : "(Chưa có PLO)"}
                    </option>
                  ))}
                </select>
                <GraduationCap className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              </div>
            </div>

            {/* Academic Year Dropdown */}
            <div className="lg:col-span-3 space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Năm học / Niên khóa
              </label>
              <div className="relative">
                <select
                  value={selectedYear || data?.selectedSchoolYear || ""}
                  onChange={(e) => handleYearChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                >
                  {(data?.academicYears || ["2024 - 2025", "2023 - 2024"]).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <Calendar className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              </div>
            </div>

            {/* Semester Dropdown */}
            <div className="lg:col-span-3 space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Học kỳ
              </label>
              <div className="relative">
                <select
                  value={selectedSemester}
                  onChange={(e) => handleSemesterChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                >
                  <option value="all">Tất cả các học kỳ</option>
                  <option value="Học kỳ 1">Học kỳ 1</option>
                  <option value="Học kỳ 2">Học kỳ 2</option>
                </select>
                <SlidersHorizontal className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="flex-1 font-medium">{error}</span>
            <button
              onClick={() => fetchData(selectedMajorCode, selectedYear, selectedSemester)}
              className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-200"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* KPI METRIC CARDS                                                          */}
        {/* ========================================================================= */}
        {data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Sinh viên */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Sinh viên tham gia</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {data.studentCount}
                </span>
                <span className="text-xs font-medium text-slate-400">sinh viên</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Được đồng bộ từ hệ thống đào tạo
              </p>
            </div>

            {/* Card 2: PLO */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Chuẩn đầu ra (PLO)</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <Award className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-[#881337]">
                  {data.plos.length}
                </span>
                <span className="text-xs font-medium text-slate-400">chỉ số PLO</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {data.plos.filter((p) => p.status === "Đạt").length} Đạt
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {data.plos.filter((p) => p.status !== "Đạt").length} Cần lưu ý
                </span>
              </div>
            </div>

            {/* Card 3: Tỷ lệ PLO bình quân */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Tỷ lệ PLO bình quân</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tracking-tight ${data.averagePloRate >= 75 ? "text-emerald-700" : "text-amber-600"}`}>
                  {data.averagePloRate}%
                </span>
                <span className="text-xs font-semibold text-slate-400">/ 100%</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Target className="h-3.5 w-3.5 text-slate-400" />
                Ngưỡng chuẩn tối thiểu: <span className="font-semibold text-slate-700">75%</span>
              </p>
            </div>

            {/* Card 4: Ma trận liên kết */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Ma trận CLO-PLO</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#881337]">
                  <Layers className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {data.matrixCount}
                </span>
                <span className="text-xs font-medium text-slate-400">cặp ánh xạ</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#881337]" />
                Phục vụ đo lường trực tiếp & gián tiếp
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCORE DISTRIBUTION / SPECTRUM OVERVIEW (PHỔ ĐIỂM)                          */}
        {/* ========================================================================= */}
        {data && data.plos.length > 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#881337]" />
                  Phân bố phổ điểm Chuẩn đầu ra (Score Spectrum)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tỷ lệ phân hạng kết quả đạt được của sinh viên theo các mức xếp loại OBE
                </p>
              </div>

              {/* Quick Status Pill */}
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <span>Ngành:</span>
                <span className="text-[#881337] font-bold">{data.selectedMajor?.code || selectedMajorCode}</span>
              </div>
            </div>

            {/* Segmented visual progress bar */}
            <div className="mt-5">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 shadow-inner">
                {/* Xuất sắc */}
                <div
                  style={{ width: `${data.scoreSpectrum?.[3]?.percentage ?? (data.plos.filter(p => p.result === "Xuất sắc").length / data.plos.length * 100)}%` }}
                  className="h-full bg-[#881337] rounded-l-full transition-all duration-500 hover:opacity-90"
                  title={`Xuất sắc (≥85%): ${data.plos.filter(p => p.result === "Xuất sắc").length} PLO`}
                />
                {/* Tốt */}
                <div
                  style={{ width: `${data.scoreSpectrum?.[2]?.percentage ?? (data.plos.filter(p => p.result === "Tốt").length / data.plos.length * 100)}%` }}
                  className="h-full bg-emerald-500 transition-all duration-500 hover:opacity-90"
                  title={`Tốt (75-84%): ${data.plos.filter(p => p.result === "Tốt").length} PLO`}
                />
                {/* Khá / Cần cải thiện */}
                <div
                  style={{ width: `${data.scoreSpectrum?.[1]?.percentage ?? (data.plos.filter(p => p.status === "Cần cải thiện").length / data.plos.length * 100)}%` }}
                  className="h-full bg-amber-400 transition-all duration-500 hover:opacity-90"
                  title={`Cần cải thiện (65-74%): ${data.plos.filter(p => p.status === "Cần cải thiện").length} PLO`}
                />
                {/* Chưa đạt */}
                <div
                  style={{ width: `${data.scoreSpectrum?.[0]?.percentage ?? (data.plos.filter(p => p.status === "Chưa đạt").length / data.plos.length * 100)}%` }}
                  className="h-full bg-red-500 rounded-r-full transition-all duration-500 hover:opacity-90"
                  title={`Chưa đạt (<65%): ${data.plos.filter(p => p.status === "Chưa đạt").length} PLO`}
                />
              </div>

              {/* Legend tiles */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="h-3.5 w-3.5 shrink-0 rounded-md bg-[#881337]" />
                  <div>
                    <div className="text-xs font-semibold text-slate-600">Xuất sắc (≥ 85%)</div>
                    <div className="text-sm font-bold text-slate-900">
                      {data.plos.filter((p) => p.result === "Xuất sắc").length} PLO{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({Math.round((data.plos.filter((p) => p.result === "Xuất sắc").length / data.plos.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="h-3.5 w-3.5 shrink-0 rounded-md bg-emerald-500" />
                  <div>
                    <div className="text-xs font-semibold text-slate-600">Đạt / Tốt (75% - 84%)</div>
                    <div className="text-sm font-bold text-slate-900">
                      {data.plos.filter((p) => p.result === "Tốt").length} PLO{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({Math.round((data.plos.filter((p) => p.result === "Tốt").length / data.plos.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="h-3.5 w-3.5 shrink-0 rounded-md bg-amber-400" />
                  <div>
                    <div className="text-xs font-semibold text-slate-600">Cần cải thiện (65% - 74%)</div>
                    <div className="text-sm font-bold text-slate-900">
                      {data.plos.filter((p) => p.status === "Cần cải thiện").length} PLO{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({Math.round((data.plos.filter((p) => p.status === "Cần cải thiện").length / data.plos.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="h-3.5 w-3.5 shrink-0 rounded-md bg-red-500" />
                  <div>
                    <div className="text-xs font-semibold text-slate-600">Chưa đạt (&lt; 65%)</div>
                    <div className="text-sm font-bold text-slate-900">
                      {data.plos.filter((p) => p.status === "Chưa đạt").length} PLO{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({Math.round((data.plos.filter((p) => p.status === "Chưa đạt").length / data.plos.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MAIN 2-COLUMN LAYOUT: LEFT (PLO DETAILS) + RIGHT (MAJORS COMPARISON)      */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* ======================================================================= */}
          {/* LEFT COLUMN: CHI TIẾT PLO CỦA NGÀNH (7 COLS)                           */}
          {/* ======================================================================= */}
          <div className="lg:col-span-7 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              {/* Header Box */}
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#881337]" />
                      <h2 className="text-lg font-bold text-slate-900">
                        Kết quả PLO · {data?.selectedMajor?.name || selectedMajorCode || "Ngành đào tạo"}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Đo lường mức độ đạt Chuẩn đầu ra ngành dựa trên kết quả CLO của các học phần thành phần
                    </p>
                  </div>

                  {data && data.plos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {data.plos.length} Chuẩn đầu ra
                      </span>
                    </div>
                  )}
                </div>

                {/* Sub-toolbar: Search & Tabs */}
                {data && data.plos.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-slate-100">
                    {/* Status Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setPloFilter("ALL")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          ploFilter === "ALL"
                            ? "bg-[#881337] text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Tất cả ({data.plos.length})
                      </button>
                      <button
                        onClick={() => setPloFilter("ACHIEVED")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          ploFilter === "ACHIEVED"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        Đạt ({data.plos.filter((p) => p.status === "Đạt").length})
                      </button>
                      <button
                        onClick={() => setPloFilter("WARNING")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          ploFilter === "WARNING"
                            ? "bg-amber-500 text-white shadow-xs"
                            : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                        }`}
                      >
                        Cần cải thiện ({data.plos.filter((p) => p.status === "Cần cải thiện").length})
                      </button>
                    </div>

                    {/* Search PLO */}
                    <div className="relative w-full sm:w-48">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm PLO..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Content Body */}
              <div className="p-5">
                {/* 1. TRƯỜNG HỢP NGÀNH CHƯA CÓ DỮ LIỆU PLO (NHƯ CNPM TRONG ẢNH GẶP PHẢI) */}
                {data && data.plos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
                      <AlertCircle className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-900">
                      Chưa có dữ liệu Chuẩn đầu ra (PLO) cho ngành này
                    </h3>
                    <p className="mt-1.5 max-w-md text-xs text-slate-500 leading-relaxed">
                      Ngành <span className="font-semibold text-slate-700">{data.selectedMajor?.name || selectedMajorCode}</span> hiện chưa có bảng chuẩn đầu ra PLO hoặc chưa được nhập điểm đánh giá trực tiếp/gián tiếp.
                    </p>

                    {/* Quick switch button to a major that HAS data */}
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      {data.majors
                        .filter((m) => m.ploCount > 0)
                        .slice(0, 2)
                        .map((m) => (
                          <button
                            key={m.code}
                            onClick={() => handleMajorChange(m.code)}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#881337] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#70102d] transition"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Xem mẫu ngành {m.name} ({m.ploCount} PLO)</span>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : filteredPlos.length === 0 ? (
                  /* 2. TRƯỜNG HỢP FILTER KHÔNG CÓ KẾT QUẢ */
                  <div className="py-12 text-center">
                    <p className="text-sm font-medium text-slate-500">
                      Không tìm thấy PLO nào phù hợp với điều kiện tìm kiếm.
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setPloFilter("ALL");
                      }}
                      className="mt-3 text-xs font-semibold text-[#881337] hover:underline"
                    >
                      Xóa bộ lọc
                    </button>
                  </div>
                ) : (
                  /* 3. DANH SÁCH PLO ĐƯỢC THIẾT KẾ ĐẸP MẮT & ĐẦY ĐỦ */
                  <div className="space-y-4">
                    {filteredPlos.map((plo) => {
                      const isPass = plo.status === "Đạt";
                      const isWarning = plo.status === "Cần cải thiện";

                      return (
                        <div
                          key={plo.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-[#881337]/10 px-2.5 py-0.5 text-xs font-bold text-[#881337]">
                                  {plo.code}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                                    isPass
                                      ? "bg-emerald-50 text-emerald-700"
                                      : isWarning
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-red-50 text-red-700"
                                  }`}
                                >
                                  {plo.status}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                  Xếp loại: <strong className="text-slate-700">{plo.result}</strong>
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-800 line-clamp-2">
                                {plo.name}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-xl font-extrabold ${
                                  isPass ? "text-emerald-700" : isWarning ? "text-amber-600" : "text-red-600"
                                }`}
                              >
                                {plo.rate}%
                              </span>
                              <div className="text-[11px] text-slate-400 font-medium">
                                Ngưỡng: 75%
                              </div>
                            </div>
                          </div>

                          {/* Progress bar with target threshold marker (75%) */}
                          <div className="mt-3 relative">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  plo.rate >= 85
                                    ? "bg-[#881337]"
                                    : isPass
                                    ? "bg-emerald-500"
                                    : isWarning
                                    ? "bg-amber-400"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, plo.rate))}%` }}
                              />
                            </div>

                            {/* Target threshold indicator (75%) */}
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60 z-10"
                              style={{ left: "75%" }}
                              title="Ngưỡng đạt tối thiểu 75%"
                            />
                          </div>

                          {/* Detail footer notes */}
                          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {isPass ? "✓ Đạt chuẩn đầu ra yêu cầu" : "⚠ Cần rà soát các học phần liên kết"}
                            </span>
                            <span className="flex items-center gap-2">
                              <span>HK1: <strong>{plo.hk1 ?? plo.rate}%</strong></span>
                              <span>•</span>
                              <span>HK2: <strong>{plo.hk2 ?? plo.rate}%</strong></span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ======================================================================= */}
          {/* RIGHT COLUMN: SO SÁNH THEO NGÀNH & CHỌN NGÀNH NHANH (5 COLS)           */}
          {/* ======================================================================= */}
          <div className="lg:col-span-5 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-[#881337]" />
                    So sánh theo ngành
                  </h2>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {data?.majors.length || 0} Ngành
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Bấm vào ngành bất kỳ để xem chi tiết phổ điểm và chuẩn đầu ra PLO tương ứng
                </p>

                {/* Search Major Input */}
                <div className="mt-3 relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo mã hoặc tên ngành..."
                    value={majorSearch}
                    onChange={(e) => setMajorSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                  />
                </div>
              </div>

              {/* Major List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Ngành</th>
                      <th className="px-3 py-3 text-center">Học phần</th>
                      <th className="px-3 py-3 text-center">PLO</th>
                      <th className="px-4 py-3 text-right">Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredMajors.map((major) => {
                      const isSelected =
                        major.code === selectedMajorCode ||
                        major.code === data?.selectedMajor?.code;
                      const hasScore = major.averagePloRate !== null;

                      return (
                        <tr
                          key={major.code}
                          onClick={() => handleMajorChange(major.code)}
                          className={`group cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-rose-50/70 font-semibold text-[#881337] ring-1 ring-inset ring-[#881337]/30"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {isSelected && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-[#881337]" />
                              )}
                              <div>
                                <div className="font-bold text-slate-900 group-hover:text-[#881337] transition">
                                  {major.code}
                                </div>
                                <div className="text-[11px] text-slate-500 line-clamp-1">
                                  {major.name}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3.5 text-center font-medium">
                            {major.courseCount}
                          </td>

                          <td className="px-3 py-3.5 text-center">
                            <span
                              className={`inline-block rounded-md px-1.5 py-0.5 font-bold ${
                                major.ploCount > 0
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {major.ploCount}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-right font-bold">
                            {hasScore ? (
                              <div className="flex flex-col items-end">
                                <span
                                  className={
                                    (major.averagePloRate ?? 0) >= 75
                                      ? "text-emerald-700"
                                      : "text-amber-600"
                                  }
                                >
                                  {major.averagePloRate}%
                                </span>
                                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 mt-1">
                                  <div
                                    className={`h-full ${
                                      (major.averagePloRate ?? 0) >= 75 ? "bg-emerald-500" : "bg-amber-400"
                                    }`}
                                    style={{ width: `${Math.min(100, major.averagePloRate ?? 0)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-400">
                                Chưa có điểm
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer info */}
              <div className="border-t border-slate-100 bg-slate-50/50 p-3 text-center text-[11px] text-slate-400">
                Nhấp chuột vào hàng bất kỳ để đổi dữ liệu ngành trực tiếp
              </div>
            </section>

            {/* Quick Quality Insights (Báo cáo tóm tắt chất lượng) */}
            {data && data.plos.length > 0 && (
              <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/50 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#881337]" />
                  Điểm nhấn chất lượng chuẩn đầu ra
                </h3>

                <div className="mt-3 space-y-2.5 text-xs">
                  {bestPlo && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <span className="font-bold text-emerald-900">PLO đạt cao nhất: </span>
                        <strong className="text-emerald-700">{bestPlo.code}</strong> đạt mức{" "}
                        <strong className="text-emerald-800">{bestPlo.rate}%</strong> ({bestPlo.result}).
                      </div>
                    </div>
                  )}

                  {lowestPlo && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-900">PLO cần lưu ý cải tiến: </span>
                        <strong className="text-amber-700">{lowestPlo.code}</strong> hiện đạt{" "}
                        <strong className="text-amber-800">{lowestPlo.rate}%</strong> ({lowestPlo.status}).
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
