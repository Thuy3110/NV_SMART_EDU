import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findOrCreatePlo(majorId: number, code: string, description: string) {
  const existing = await prisma.pLO.findFirst({ where: { majorId, code } });
  return existing ?? prisma.pLO.create({
    data: { majorId, code, description, targetPercent: 75, directTargetPercent: 75 },
  });
}

async function main() {
  // 1. Đảm bảo năm học 2025 tồn tại
  const academicYear = await prisma.academicYear.upsert({
    where: { year: 2025 },
    update: {},
    create: { year: 2025 },
  });

  // 2. Tìm ngành chính thức Công nghệ thông tin (CNTT)
  const cntt = await prisma.major.findUnique({
    where: { code: 'CNTT' },
    include: {
      students: true,
      plos: { orderBy: { code: 'asc' } },
    },
  });

  if (!cntt) {
    console.error('Không tìm thấy ngành CNTT trong cơ sở dữ liệu!');
    return;
  }

  // Liên kết năm học cho ngành CNTT
  await prisma.majorYear.upsert({
    where: { majorId_academicYearId: { majorId: cntt.id, academicYearId: academicYear.id } },
    update: {},
    create: { majorId: cntt.id, academicYearId: academicYear.id },
  });

  // 3. Đảm bảo 10 Chuẩn đầu ra (PLO) của ngành CNTT
  const plos = await Promise.all([
    findOrCreatePlo(cntt.id, 'PLO1', 'Kiến thức Đại cương & Nền tảng Khoa học: Vận dụng thành thạo kiến thức về lý luận chính trị, toán học và phương pháp nghiên cứu khoa học vào mô hình hóa các bài toán tin học.'),
    findOrCreatePlo(cntt.id, 'PLO2', 'Cơ sở Công nghệ thông tin & Máy tính: Nắm vững nguyên lý hoạt động của máy tính, kiến trúc phần cứng, hệ điều hành, mạng máy tính, cơ sở dữ liệu và an toàn thông tin.'),
    findOrCreatePlo(cntt.id, 'PLO3', 'Phân tích, Thiết kế & Phát triển Phần mềm: Áp dụng các quy trình phát triển phần mềm chuẩn, phân tích yêu cầu, thiết kế kiến trúc và kiểm thử chất lượng phần mềm.'),
    findOrCreatePlo(cntt.id, 'PLO4', 'Chuyên sâu Công nghệ tiên tiến: Triển khai các giải pháp Trí tuệ nhân tạo (AI), Điện toán đám mây (Cloud) và Dữ liệu lớn (Big Data).'),
    findOrCreatePlo(cntt.id, 'PLO5', 'Kỹ năng Lập trình & Kỹ thuật Phần mềm: Thành thạo các ngôn ngữ lập trình hiện đại, quy chuẩn viết mã sạch (Clean Code), kiểm thử tự động và quản lý mã nguồn Git.'),
    findOrCreatePlo(cntt.id, 'PLO6', 'Kỹ năng Tư duy Phân tích & Giải quyết vấn đề: Khả năng tư duy phản biện, phân tích logic và giải quyết các bài toán kỹ thuật phức tạp.'),
    findOrCreatePlo(cntt.id, 'PLO7', 'Kỹ năng Ngoại ngữ & Giao tiếp Chuyên môn: Sử dụng Tiếng Anh chuyên ngành thành thạo, viết tài liệu kỹ thuật và thuyết trình giải pháp công nghệ hiệu quả.'),
    findOrCreatePlo(cntt.id, 'PLO8', 'Kỹ năng Làm việc nhóm & Quản lý Dự án: Hợp tác hiệu quả trong nhóm đa ngành, ứng dụng các phương pháp quản trị dự án Agile/Scrum.'),
    findOrCreatePlo(cntt.id, 'PLO9', 'Tác phong Nghề nghiệp & Đạo đức CNTT: Tuân thủ pháp luật, đạo đức nghề nghiệp, bảo vệ quyền riêng tư và sở hữu trí tuệ trong kỷ nguyên số.'),
    findOrCreatePlo(cntt.id, 'PLO10', 'Tự học & Thích ứng Chuyển đổi số: Khả năng tự nghiên cứu, cập nhật công nghệ mới và học tập suốt đời trong môi trường công nghệ biến đổi nhanh.'),
  ]);

  // 4. Cập nhật chỉ số đánh giá tổng hợp cho ngành CNTT
  const assessment = await prisma.assessment.findFirst({ where: { majorId: cntt.id } });
  if (assessment) {
    await prisma.assessment.update({ where: { id: assessment.id }, data: { ploRate: 80.0, cloRate: 3.5 } });
  } else {
    await prisma.assessment.create({ data: { majorId: cntt.id, ploRate: 80.0, cloRate: 3.5 } });
  }

  // 5. Nạp dữ liệu điểm StudentCloScore thực tế cho sinh viên ngành CNTT
  if (cntt.students.length > 0) {
    const matrixLinks = await prisma.matrix.findMany({
      where: { plo: { majorId: cntt.id }, courseId: { not: null } },
      select: { courseId: true, cloId: true, ploId: true },
      distinct: ['courseId', 'cloId'],
    });

    const ploOffsetMap = new Map<number, number>();
    cntt.plos.forEach((plo, idx) => {
      const offsets = [0.3, 0.0, 0.7, -0.3, 0.5, 0.0, -0.8, 0.3, 1.0, 0.0];
      ploOffsetMap.set(plo.id, offsets[idx % offsets.length]);
    });

    const cnttScoreRecords: Array<{ studentId: number; courseId: number; cloId: number; score: number }> = [];
    for (const [studentIdx, student] of cntt.students.entries()) {
      const studentBias = studentIdx < 8 ? 0.8 : studentIdx > 22 ? -0.8 : 0.0;
      for (const [linkIdx, link] of matrixLinks.entries()) {
        if (!link.courseId) continue;
        const ploOffset = ploOffsetMap.get(link.ploId) || 0;
        const cyclicBase = [8.2, 7.5, 8.8, 7.8, 6.8, 8.5, 9.2, 7.0, 8.0][(studentIdx + linkIdx) % 9];
        const finalScore = Math.min(10, Math.max(4.5, Number((cyclicBase + studentBias + ploOffset).toFixed(1))));

        cnttScoreRecords.push({
          studentId: student.id,
          courseId: link.courseId,
          cloId: link.cloId,
          score: finalScore,
        });
      }
    }

    await prisma.studentCloScore.deleteMany({ where: { student: { majorId: cntt.id } } });
    const batchSize = 1000;
    for (let i = 0; i < cnttScoreRecords.length; i += batchSize) {
      const chunk = cnttScoreRecords.slice(i, i + batchSize);
      await prisma.studentCloScore.createMany({ data: chunk, skipDuplicates: true });
    }
    console.log(`Đã nạp ${cnttScoreRecords.length} điểm StudentCloScore cho sinh viên ngành CNTT.`);
  }

  // 6. Cấu hình phân tích chuẩn đầu ra & khảo sát
  await prisma.analysisSetting.upsert({
    where: { id: 1 },
    update: { ploThreshold: 75, cloThreshold: 3, enableContribution: true, enableSelfAssessment: true },
    create: { id: 1, ploThreshold: 75, cloThreshold: 3, enableContribution: true, enableSelfAssessment: true },
  });

  await prisma.surveyDashboardSetting.upsert({
    where: { id: 1 },
    update: { cdrConversion: true },
    create: { id: 1, cdrConversion: true },
  });

  // 7. Tạo phiếu khảo sát cho sinh viên ngành CNTT
  const survey = await prisma.surveyForm.upsert({
    where: { code: 'KS-SV-CNTT' },
    update: {
      title: 'Khảo sát trải nghiệm học tập và chuẩn đầu ra ngành CNTT',
      enabled: true,
      year: '2025-2026',
      classes: 'CNTT',
    },
    create: {
      year: '2025-2026',
      code: 'KS-SV-CNTT',
      title: 'Khảo sát trải nghiệm học tập và chuẩn đầu ra ngành CNTT',
      description: 'Phiếu khảo sát đo lường mức độ đạt chuẩn đầu ra và trải nghiệm học tập của sinh viên ngành Công nghệ thông tin.',
      isCdr: true,
      link: '/surveys/forms/cntt',
      level: 'LV1',
      enabled: true,
      legacyLink: '',
      menu: 'main',
      classes: 'CNTT',
    },
  });

  await prisma.surveyQuestion.deleteMany({ where: { surveyFormId: survey.id } });
  await prisma.surveyQuestion.createMany({
    data: [
      { surveyFormId: survey.id, questionText: 'Mức độ đáp ứng chuẩn đầu ra của các học phần chuyên ngành?', type: 'single', options: JSON.stringify(['1', '2', '3', '4', '5']), groupNo: 1, groupTitle: 'Chất lượng đào tạo', sortOrder: 1 },
      { surveyFormId: survey.id, questionText: 'Mức độ hài lòng với phương pháp giảng dạy và thực hành?', type: 'single', options: JSON.stringify(['1', '2', '3', '4', '5']), groupNo: 1, groupTitle: 'Chất lượng đào tạo', sortOrder: 2 },
      { surveyFormId: survey.id, questionText: 'Ý kiến đóng góp để nâng cao chất lượng chương trình đào tạo', type: 'text', options: JSON.stringify([]), required: false, groupNo: 2, groupTitle: 'Góp ý', sortOrder: 3 },
    ],
  });

  console.log('Hoàn thành cập nhật cơ sở dữ liệu cho ngành CNTT:', {
    major: cntt.code,
    plos: plos.length,
    students: cntt.students.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
