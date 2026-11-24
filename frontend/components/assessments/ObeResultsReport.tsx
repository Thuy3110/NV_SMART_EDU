"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  GraduationCap,
  Layers,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import {
  AttainmentStatus,
  getLecturerAssessmentYears,
  getLecturerProgramReport,
  LecturerProgramReport,
} from "@/services/lecturer-assessment.service";

function statusStyle(status: AttainmentStatus) {
  if (status === "Đạt") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (status === "Chưa đạt") return "bg-red-50 text-red-700 border border-red-200";
  return "bg-amber-50 text-amber-700 border border-amber-200";
}

function downloadReport(
  program: LecturerProgramReport["programs"][number],
  majorId: number,
  academicYear: number,
) {
  const major = program.majors.find((item) => item.id === majorId);
  if (!major) return;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      major.plos.map((plo) => ({
        NamHoc: academicYear,
        MaCTDT: program.program.code,
        MaNganh: major.code,
        MaPLO: plo.code,
        MoTaPLO: plo.description,
        TyLeDatPLO: plo.attainmentRate ?? "Chưa có dữ liệu",
        NguongDat: major.evaluation.threshold,
        KetQua: plo.status,
      })),
    ),
    "PLO",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      major.cloAssessments.map((assessment) => ({
        NamHoc: academicYear,
        MaNganh: major.code,
        MaHocPhan: assessment.courseCode,
        TenHocPhan: assessment.courseName,
        MaCLO: assessment.cloCode,
        MoTaCLO: assessment.cloDescription,
        TyLeDatCLOTrungBinh: assessment.averageRate ?? "Chưa có dữ liệu",
        SoGiangVienDanhGia: assessment.lecturerCount,
        DanhGiaGiangVien: assessment.lecturerAssessments
          .map((item) => `${item.lecturerName} (${item.attainmentRate}%)`)
          .join(", "),
      })),
    ),
    "CLO",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      major.cloPloAssessments.map((assessment) => ({
        NamHoc: academicYear,
        MaNganh: major.code,
        MaHocPhan: assessment.courseCode,
        TenHocPhan: assessment.courseName,
        MaCLO: assessment.cloCode,
        TyLeDatCLO: assessment.averageRate ?? "Chưa có dữ liệu",
        MaPLO: assessment.ploCode,
        TyLeDatPLO: assessment.ploAttainmentRate ?? "Chưa có dữ liệu",
        MucDongGop: assessment.contributionLevel,
        KetQuaPLO: assessment.ploStatus,
      })),
    ),
    "CLO_PLO",
  );
  XLSX.writeFile(
    workbook,
    `Bao-cao-OBE-${major.code}-${academicYear}.xlsx`,
  );
}

function ReportContent() {
  const searchParams = useSearchParams();
  const rawMajorId = Number(
    searchParams.get("id") ?? searchParams.get("majorId") ?? "",
  );
  const cohortParam = searchParams.get("cohort") ?? "";
  const requestedYear = Number(cohortParam.match(/\d{4}/)?.[0]) || null;

  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [report, setReport] = useState<LecturerProgramReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Quản lý ngành đang chọn (mặc định lấy theo URL hoặc ngành CNTT/ngành đầu tiên có dữ liệu)
  const [activeMajorId, setActiveMajorId] = useState<number | null>(
    !isNaN(rawMajorId) && rawMajorId > 0 ? rawMajorId : null
  );

  // Tab navigation: "PLO" | "CLO" | "CLO_PLO"
  const [activeTab, setActiveTab] = useState<"PLO" | "CLO" | "CLO_PLO">("PLO");

  // Local Filter & Search cho Tab 2 (CLO)
  const [cloStatusFilter, setCloStatusFilter] = useState<"ALL" | "EVALUATED" | "NOT_EVALUATED">("EVALUATED");
  const [cloSearch, setCloSearch] = useState("");
  const [cloPage, setCloPage] = useState(1);
  const PAGE_SIZE = 15;

  // Local Filter & Search cho Tab 3 (CLO-PLO)
  const [cloPloStatusFilter, setCloPloStatusFilter] = useState<"ALL" | "EVALUATED" | "NOT_EVALUATED">("EVALUATED");
  const [selectedPloFilter, setSelectedPloFilter] = useState<string>("ALL");
  const [cloPloSearch, setCloPloSearch] = useState("");
  const [cloPloPage, setCloPloPage] = useState(1);

  // Tải danh sách năm học
  useEffect(() => {
    let active = true;
    void getLecturerAssessmentYears()
      .then((availableYears) => {
        if (!active) return;
        const ordered = [...availableYears].sort((a, b) => b - a);
        const initialYear = requestedYear ?? ordered[0] ?? new Date().getFullYear();
        setYears(ordered.includes(initialYear) ? ordered : [initialYear, ...ordered]);
        setSelectedYear(initialYear);
      })
      .catch((cause: unknown) => {
        console.error("Lỗi tải năm học báo cáo OBE:", cause);
        if (active) {
          setError(cause instanceof Error ? cause.message : "Không tải được danh sách năm học đánh giá.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestedYear]);

  // Tải dữ liệu báo cáo khi đổi năm học
  useEffect(() => {
    if (selectedYear === null) return;
    let active = true;

    setLoading(true);
    void getLecturerProgramReport(selectedYear)
      .then((result) => {
        if (active) {
          setReport(result);
          setError("");

          // Tự động chọn ngành nếu chưa chọn hoặc ngành hiện tại không tồn tại
          const allMajors = result.programs.flatMap((p) => p.majors);
          if (allMajors.length > 0) {
            if (!activeMajorId || !allMajors.some((m) => m.id === activeMajorId)) {
              // Ưu tiên chọn ngành CNTT (id = 8) hoặc ngành đầu tiên có PLO
              const cnttMajor = allMajors.find((m) => m.code === "CNTT");
              const firstWithData = allMajors.find((m) => m.plos.length > 0);
              setActiveMajorId(cnttMajor?.id ?? firstWithData?.id ?? allMajors[0].id);
            }
          }
        }
      })
      .catch((cause: unknown) => {
        console.error("Lỗi tải dữ liệu báo cáo OBE:", cause);
        if (active) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu báo cáo OBE.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedYear]);

  // Danh sách tất cả các ngành có trong báo cáo để hiển thị dropdown
  const allAvailableMajors = useMemo(() => {
    if (!report?.programs) return [];
    return report.programs.flatMap((p) =>
      p.majors.map((m) => ({
        ...m,
        programCode: p.program.code,
        programName: p.program.name,
      }))
    );
  }, [report]);

  // Ngành và CTĐT đang được chọn
  const selectedProgram = useMemo(
    () => report?.programs.find((p) => p.majors.some((m) => m.id === activeMajorId)) ?? null,
    [activeMajorId, report]
  );

  const selectedMajor = useMemo(
    () => selectedProgram?.majors.find((m) => m.id === activeMajorId) ?? null,
    [activeMajorId, selectedProgram]
  );

  const refresh = () => {
    if (selectedYear === null) return;
    setLoading(true);
    setError("");
    void getLecturerProgramReport(selectedYear)
      .then((res) => {
        setReport(res);
      })
      .catch((cause: unknown) => {
        console.error("Lỗi làm mới báo cáo OBE:", cause);
        setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu báo cáo OBE.");
      })
      .finally(() => setLoading(false));
  };

  // Thống kê nhanh cho Tab 2 (CLO)
  const evaluatedClosCount = useMemo(() => {
    if (!selectedMajor?.cloAssessments) return 0;
    return selectedMajor.cloAssessments.filter((c) => c.averageRate !== null).length;
  }, [selectedMajor?.cloAssessments]);

  // Lọc danh sách CLO (Tab 2)
  const filteredClos = useMemo(() => {
    if (!selectedMajor?.cloAssessments) return [];
    return selectedMajor.cloAssessments.filter((c) => {
      const matchSearch =
        c.courseCode.toLowerCase().includes(cloSearch.toLowerCase()) ||
        c.courseName.toLowerCase().includes(cloSearch.toLowerCase()) ||
        c.cloCode.toLowerCase().includes(cloSearch.toLowerCase()) ||
        c.cloDescription.toLowerCase().includes(cloSearch.toLowerCase());

      if (!matchSearch) return false;

      if (cloStatusFilter === "EVALUATED") return c.averageRate !== null;
      if (cloStatusFilter === "NOT_EVALUATED") return c.averageRate === null;
      return true;
    });
  }, [selectedMajor?.cloAssessments, cloSearch, cloStatusFilter]);

  // Phân trang cho Tab 2
  const paginatedClos = useMemo(() => {
    const start = (cloPage - 1) * PAGE_SIZE;
    return filteredClos.slice(start, start + PAGE_SIZE);
  }, [filteredClos, cloPage]);

  const totalCloPages = Math.ceil(filteredClos.length / PAGE_SIZE) || 1;

  // Thống kê nhanh cho Tab 3 (CLO-PLO)
  const evaluatedCloPloCount = useMemo(() => {
    if (!selectedMajor?.cloPloAssessments) return 0;
    return selectedMajor.cloPloAssessments.filter((cp) => cp.averageRate !== null).length;
  }, [selectedMajor?.cloPloAssessments]);

  // Lọc danh sách CLO-PLO (Tab 3)
  const filteredCloPlos = useMemo(() => {
    if (!selectedMajor?.cloPloAssessments) return [];
    return selectedMajor.cloPloAssessments.filter((cp) => {
      const matchSearch =
        cp.courseCode.toLowerCase().includes(cloPloSearch.toLowerCase()) ||
        cp.courseName.toLowerCase().includes(cloPloSearch.toLowerCase()) ||
        cp.cloCode.toLowerCase().includes(cloPloSearch.toLowerCase()) ||
        cp.ploCode.toLowerCase().includes(cloPloSearch.toLowerCase());

      if (!matchSearch) return false;

      if (selectedPloFilter !== "ALL" && cp.ploCode !== selectedPloFilter) {
        return false;
      }

      if (cloPloStatusFilter === "EVALUATED") return cp.averageRate !== null;
      if (cloPloStatusFilter === "NOT_EVALUATED") return cp.averageRate === null;
      return true;
    });
  }, [selectedMajor?.cloPloAssessments, cloPloSearch, selectedPloFilter, cloPloStatusFilter]);

  // Phân trang cho Tab 3
  const paginatedCloPlos = useMemo(() => {
    const start = (cloPloPage - 1) * PAGE_SIZE;
    return filteredCloPlos.slice(start, start + PAGE_SIZE);
  }, [filteredCloPlos, cloPloPage]);

  const totalCloPloPages = Math.ceil(filteredCloPlos.length / PAGE_SIZE) || 1;

  // Danh sách các PLO duy nhất để làm filter cho Tab 3
  const distinctPloCodes = useMemo(() => {
    if (!selectedMajor?.plos) return [];
    return selectedMajor.plos.map((p) => p.code);
  }, [selectedMajor?.plos]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* ========================================================================= */}
      {/* HEADER SECTION & CONTROLS                                                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <Link
            href="/assessments/direct/analysis/courses"
            className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#881337] transition"
          >
            <ArrowLeft size={14} />
            Quay lại phân tích học phần
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#881337] text-white shadow-md shadow-[#881337]/20">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Báo cáo Kết quả CLO – PLO (OBE)
              </h1>
              <p className="text-xs text-slate-500">
                Tổng hợp kết quả đánh giá Chuẩn đầu ra từ giảng viên và ma trận trọng số đóng góp
              </p>
            </div>
          </div>
        </div>

        {/* Filter bar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown Chọn Ngành */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-slate-600 shrink-0">Ngành:</label>
            <div className="relative">
              <select
                value={activeMajorId ?? ""}
                onChange={(e) => {
                  setActiveMajorId(Number(e.target.value));
                  setCloPage(1);
                  setCloPloPage(1);
                }}
                className="h-10 appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
              >
                {allAvailableMajors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name}
                  </option>
                ))}
              </select>
              <GraduationCap className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* Dropdown Năm học */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-slate-600 shrink-0">Năm học:</label>
            <div className="relative">
              <select
                value={selectedYear ?? ""}
                onChange={(event) => {
                  setSelectedYear(Number(event.target.value));
                  setCloPage(1);
                  setCloPloPage(1);
                }}
                disabled={!years.length}
                className="h-10 appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <Calendar className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={loading || selectedYear === null}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#881337]" : "text-slate-500"} />
            Làm mới
          </button>

          <button
            type="button"
            onClick={() =>
              selectedProgram &&
              selectedMajor &&
              selectedYear !== null &&
              downloadReport(selectedProgram, selectedMajor.id, selectedYear)
            }
            disabled={!selectedProgram || !selectedMajor || loading}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#881337] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#70102d] disabled:opacity-50"
          >
            <Download size={14} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin text-[#881337] mb-2" />
          Đang tải dữ liệu báo cáo kết quả OBE...
        </div>
      ) : !selectedMajor ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-xs text-amber-800"
        >
          <AlertCircle className="mx-auto h-7 w-7 text-amber-600 mb-2" />
          <p className="font-bold text-sm text-slate-900">Không tìm thấy thông tin ngành đào tạo</p>
          <p className="mt-1 text-slate-600">Vui lòng chọn ngành khác từ danh sách phía trên.</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TOP SUMMARY KPI CARDS                                                     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Tỷ lệ PLO bình quân */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Tỷ lệ PLO bình quân</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-black ${
                    (selectedMajor.evaluation.averagePloRate ?? 0) >= selectedMajor.evaluation.threshold
                      ? "text-emerald-700"
                      : "text-amber-600"
                  }`}
                >
                  {selectedMajor.evaluation.averagePloRate === null
                    ? "Chưa có điểm"
                    : `${selectedMajor.evaluation.averagePloRate}%`}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  / Ngưỡng {selectedMajor.evaluation.threshold}%
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                <span
                  className={`rounded-md px-1.5 py-0.5 font-bold ${statusStyle(selectedMajor.evaluation.status)}`}
                >
                  {selectedMajor.evaluation.status}
                </span>
                <span className="text-slate-400">Đánh giá cấp ngành</span>
              </div>
            </div>

            {/* Card 2: Tổng PLO */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Chuẩn đầu ra (PLO)</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Award className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {selectedMajor.plos.length}
                </span>
                <span className="text-[11px] font-medium text-slate-400">chỉ số</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="font-semibold text-emerald-600">
                  {selectedMajor.plos.filter((p) => p.status === "Đạt").length} Đạt
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-amber-600">
                  {selectedMajor.plos.filter((p) => p.status !== "Đạt").length} Cần lưu ý
                </span>
              </div>
            </div>

            {/* Card 3: CLO Đã đánh giá */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>CLO đã có đánh giá</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <UserCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-[#881337]">
                  {evaluatedClosCount}
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  / {selectedMajor.cloAssessments.length} CLO
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Từ giảng viên phụ trách học phần năm {selectedYear}
              </p>
            </div>

            {/* Card 4: Liên kết CLO-PLO */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Liên kết CLO–PLO tính toán</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-[#881337]">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {evaluatedCloPloCount}
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  / {selectedMajor.cloPloAssessments.length} liên kết
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Tham gia trực tiếp vào tính điểm PLO
              </p>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB NAVIGATION: GIÚP CHUYỂN ĐỔI GỌN GÀNG, KHÔNG PHẢI CUỘN BẢNG DÀI        */}
          {/* ========================================================================= */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-1">
            <button
              onClick={() => setActiveTab("PLO")}
              className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === "PLO"
                  ? "border-[#881337] bg-white text-[#881337] shadow-xs"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Award className="h-4 w-4" />
              <span>1. Kết quả PLO của ngành</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                {selectedMajor.plos.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("CLO")}
              className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === "CLO"
                  ? "border-[#881337] bg-white text-[#881337] shadow-xs"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>2. Chi tiết CLO theo học phần</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  evaluatedClosCount > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                }`}
              >
                {evaluatedClosCount} có điểm / {selectedMajor.cloAssessments.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("CLO_PLO")}
              className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === "CLO_PLO"
                  ? "border-[#881337] bg-white text-[#881337] shadow-xs"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>3. Liên kết đóng góp CLO – PLO</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                {evaluatedCloPloCount} / {selectedMajor.cloPloAssessments.length}
              </span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: KẾT QUẢ PLO CỦA NGÀNH                                              */}
          {/* ========================================================================= */}
          {activeTab === "PLO" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-[#881337]" />
                      Kết quả Chuẩn đầu ra (PLO) · {selectedMajor.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      PLO được tính toán từ tỷ lệ CLO đã đánh giá và trọng số đóng góp trong ma trận CLO–PLO.
                    </p>
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    Ngưỡng chuẩn tối thiểu: <strong className="text-slate-900">{selectedMajor.evaluation.threshold}%</strong>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 w-28">Mã PLO</th>
                      <th className="px-5 py-3">Nội dung chuẩn đầu ra</th>
                      <th className="px-5 py-3 w-48">Tỷ lệ đạt (%)</th>
                      <th className="px-5 py-3 w-24 text-center">Ngưỡng</th>
                      <th className="px-5 py-3 w-32 text-center">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedMajor.plos.map((plo) => {
                      const isPass = plo.status === "Đạt";
                      const rate = plo.attainmentRate;

                      return (
                        <tr key={plo.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-5 py-3.5 font-bold text-[#881337]">
                            {plo.code}
                          </td>
                          <td className="px-5 py-3.5 text-slate-800 leading-relaxed font-medium">
                            {plo.description}
                          </td>
                          <td className="px-5 py-3.5">
                            {rate !== null ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between font-bold">
                                  <span className={rate >= 75 ? "text-emerald-700" : "text-amber-600"}>
                                    {rate}%
                                  </span>
                                </div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      rate >= 85 ? "bg-[#881337]" : rate >= 75 ? "bg-emerald-500" : "bg-amber-400"
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-normal italic">Chưa có dữ liệu</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center font-semibold text-slate-600">
                            {selectedMajor.evaluation.threshold}%
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${statusStyle(plo.status)}`}>
                              {plo.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {selectedMajor.plos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-slate-500 text-xs">
                          Chưa có dữ liệu chuẩn đầu ra PLO cho ngành này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: CHI TIẾT CLO THEO HỌC PHẦN (CÓ FILTER ĐÃ ĐÁNH GIÁ & PHÂN TRANG)    */}
          {/* ========================================================================= */}
          {activeTab === "CLO" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen size={18} className="text-[#881337]" />
                      Chi tiết đánh giá CLO theo học phần
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Tỷ lệ CLO là kết quả tổng hợp giảng viên phụ trách đã nhập và lưu trong năm học {selectedYear}.
                    </p>
                  </div>

                  {/* Filter Status buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCloStatusFilter("EVALUATED");
                        setCloPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        cloStatusFilter === "EVALUATED"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      Đã có điểm ({evaluatedClosCount})
                    </button>
                    <button
                      onClick={() => {
                        setCloStatusFilter("ALL");
                        setCloPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        cloStatusFilter === "ALL"
                          ? "bg-[#881337] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Tất cả ({selectedMajor.cloAssessments.length})
                    </button>
                    <button
                      onClick={() => {
                        setCloStatusFilter("NOT_EVALUATED");
                        setCloPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        cloStatusFilter === "NOT_EVALUATED"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      Chưa có điểm ({selectedMajor.cloAssessments.length - evaluatedClosCount})
                    </button>
                  </div>
                </div>

                {/* Search CLO */}
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="relative w-full sm:w-80">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm theo mã HP, tên học phần hoặc mã CLO..."
                      value={cloSearch}
                      onChange={(e) => {
                        setCloSearch(e.target.value);
                        setCloPage(1);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#881337] focus:outline-none focus:ring-1 focus:ring-[#881337]"
                    />
                  </div>

                  <span className="text-xs text-slate-400 font-medium">
                    Hiển thị <strong>{filteredClos.length}</strong> kết quả (Trang {cloPage}/{totalCloPages})
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 w-56">Học phần</th>
                      <th className="px-4 py-3 w-28">Mã CLO</th>
                      <th className="px-5 py-3">Mô tả chuẩn đầu ra CLO</th>
                      <th className="px-4 py-3 w-28 text-center">Tỷ lệ CLO</th>
                      <th className="px-4 py-3 w-24 text-center">Số GV</th>
                      <th className="px-5 py-3 w-64">Giảng viên đánh giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedClos.map((assessment) => {
                      const hasRate = assessment.averageRate !== null;

                      return (
                        <tr
                          key={`${assessment.courseId}-${assessment.cloId}`}
                          className={`transition ${hasRate ? "hover:bg-emerald-50/30" : "hover:bg-slate-50/80"}`}
                        >
                          <td className="px-5 py-3.5">
                            <span className="font-bold text-[#881337] block">
                              {assessment.courseCode}
                            </span>
                            <span className="text-[11px] text-slate-500 line-clamp-1 font-medium">
                              {assessment.courseName}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 font-bold text-blue-700">
                            {assessment.cloCode}
                          </td>

                          <td className="px-5 py-3.5 text-slate-800 font-medium leading-relaxed">
                            {assessment.cloDescription}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {hasRate ? (
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 font-black text-xs ${
                                  (assessment.averageRate ?? 0) >= 75
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {assessment.averageRate}%
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal italic">Chưa đánh giá</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                            {assessment.lecturerCount}
                          </td>

                          <td className="px-5 py-3.5 text-slate-600">
                            {assessment.lecturerAssessments.length > 0 ? (
                              <div className="space-y-1">
                                {assessment.lecturerAssessments.map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-slate-800">{item.lecturerName}:</span>
                                    <span className="font-bold text-emerald-700">({item.attainmentRate}%)</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Chưa có người đánh giá</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {paginatedClos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-xs">
                          {cloStatusFilter === "EVALUATED" ? (
                            <div>
                              <p className="font-semibold text-slate-700">Chưa có học phần nào được giảng viên nhập điểm CLO trong năm học {selectedYear}.</p>
                              <button
                                onClick={() => setCloStatusFilter("ALL")}
                                className="mt-2 text-xs font-bold text-[#881337] hover:underline"
                              >
                                Bấm vào đây để xem toàn bộ danh sách CLO của chương trình
                              </button>
                            </div>
                          ) : (
                            "Không tìm thấy CLO nào phù hợp với điều kiện tìm kiếm."
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalCloPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                  <span className="text-xs text-slate-500">
                    Trang <strong>{cloPage}</strong> trên tổng số <strong>{totalCloPages}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCloPage((p) => Math.max(1, p - 1))}
                      disabled={cloPage === 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Trước
                    </button>
                    <button
                      onClick={() => setCloPage((p) => Math.min(totalCloPages, p + 1))}
                      disabled={cloPage === totalCloPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Sau <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: LIÊN KẾT ĐÓNG GÓP CLO – PLO (CÓ FILTER PLO & PHÂN TRANG)           */}
          {/* ========================================================================= */}
          {activeTab === "CLO_PLO" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers size={18} className="text-[#881337]" />
                      Liên kết đóng góp CLO – PLO
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Chi tiết mức đóng góp (level 1-5) của từng CLO vào các chỉ số PLO tương ứng trong ma trận.
                    </p>
                  </div>

                  {/* Filter Evaluated / All */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCloPloStatusFilter("EVALUATED");
                        setCloPloPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        cloPloStatusFilter === "EVALUATED"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      Đã có đánh giá ({evaluatedCloPloCount})
                    </button>
                    <button
                      onClick={() => {
                        setCloPloStatusFilter("ALL");
                        setCloPloPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        cloPloStatusFilter === "ALL"
                          ? "bg-[#881337] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Tất cả liên kết ({selectedMajor.cloPloAssessments.length})
                    </button>
                  </div>
                </div>

                {/* Sub-filters: PLO dropdown + Search */}
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <select
                        value={selectedPloFilter}
                        onChange={(e) => {
                          setSelectedPloFilter(e.target.value);
                          setCloPloPage(1);
                        }}
                        className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-bold text-slate-800 shadow-sm focus:border-[#881337] focus:outline-none"
                      >
                        <option value="ALL">Tất cả các PLO</option>
                        {distinctPloCodes.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                      <Filter className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" />
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm học phần hoặc CLO..."
                        value={cloPloSearch}
                        onChange={(e) => {
                          setCloPloSearch(e.target.value);
                          setCloPloPage(1);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#881337] focus:outline-none"
                      />
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 font-medium">
                    Hiển thị <strong>{filteredCloPlos.length}</strong> liên kết (Trang {cloPloPage}/{totalCloPloPages})
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 w-56">Học phần</th>
                      <th className="px-4 py-3 w-28">Mã CLO</th>
                      <th className="px-4 py-3 w-28 text-center">Tỷ lệ CLO</th>
                      <th className="px-4 py-3 w-24 text-center">Mã PLO</th>
                      <th className="px-4 py-3 w-28 text-center">Tỷ lệ PLO</th>
                      <th className="px-4 py-3 w-28 text-center">Mức đóng góp</th>
                      <th className="px-4 py-3 w-28 text-center">Kết quả PLO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedCloPlos.map((item, index) => (
                      <tr
                        key={`${item.courseId}-${item.cloId}-${item.ploCode}-${index}`}
                        className="hover:bg-slate-50/80 transition"
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-[#881337] block">
                            {item.courseCode}
                          </span>
                          <span className="text-[11px] text-slate-500 line-clamp-1 font-medium">
                            {item.courseName}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 font-bold text-blue-700">
                          {item.cloCode}
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold">
                          {item.averageRate !== null ? (
                            <span className="text-emerald-700 font-black">{item.averageRate}%</span>
                          ) : (
                            <span className="text-slate-400 font-normal italic">Chưa đánh giá</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold text-indigo-700">
                          {item.ploCode}
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold">
                          {item.ploAttainmentRate !== null ? (
                            <span className={item.ploAttainmentRate >= 75 ? "text-emerald-700" : "text-amber-600"}>
                              {item.ploAttainmentRate}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal italic">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5">
                            Level {item.contributionLevel}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${statusStyle(item.ploStatus)}`}>
                            {item.ploStatus}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {paginatedCloPlos.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-xs">
                          Không tìm thấy liên kết đóng góp nào phù hợp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalCloPloPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                  <span className="text-xs text-slate-500">
                    Trang <strong>{cloPloPage}</strong> trên tổng số <strong>{totalCloPloPages}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCloPloPage((p) => Math.max(1, p - 1))}
                      disabled={cloPloPage === 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Trước
                    </button>
                    <button
                      onClick={() => setCloPloPage((p) => Math.min(totalCloPloPages, p + 1))}
                      disabled={cloPloPage === totalCloPloPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Sau <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function ObeResultsReport() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-slate-500">
          Đang khởi tạo báo cáo OBE...
        </div>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
