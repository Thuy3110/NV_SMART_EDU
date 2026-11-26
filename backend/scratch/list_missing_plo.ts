import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const major = await prisma.major.findUnique({
      where: { code: 'CNTT' },
      select: { id: true, code: true, name: true },
    });

    if (!major) {
      throw new Error('Không tìm thấy ngành CNTT.');
    }

    const requestedYear = process.argv[2] ? Number(process.argv[2]) : null;
    if (requestedYear !== null && !Number.isInteger(requestedYear)) {
      throw new Error('Năm học phải là số nguyên.');
    }

    const academicYear =
      requestedYear === null
        ? await prisma.academicYear.findFirst({
            orderBy: { year: 'desc' },
            select: { id: true, year: true },
          })
        : await prisma.academicYear.findUnique({
            where: { year: requestedYear },
            select: { id: true, year: true },
          });

    if (!academicYear) {
      throw new Error(
        requestedYear === null
          ? 'Chưa có năm học nào trong cơ sở dữ liệu.'
          : `Không tìm thấy năm học ${requestedYear}.`,
      );
    }

    const [plos, matrixRows, courseCloLinks, assessments] = await Promise.all([
      prisma.pLO.findMany({
        where: { majorId: major.id },
        select: {
          id: true,
          code: true,
          isGroupHeader: true,
          parentId: true,
        },
        orderBy: { code: 'asc' },
      }),
      prisma.matrix.findMany({
        where: {
          clo: { majorId: major.id },
          plo: { majorId: major.id },
        },
        include: {
          course: { select: { id: true, code: true, name: true } },
          clo: { select: { id: true, code: true } },
          plo: { select: { id: true, code: true } },
        },
      }),
      prisma.courseCLO.findMany({
        where: { course: { majorId: major.id } },
        include: {
          course: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.lecturerCloAssessment.findMany({
        where: {
          course: { majorId: major.id },
          academicYearId: academicYear.id,
        },
        select: { courseId: true, cloId: true },
      }),
    ]);

    const coursesByClo = new Map<number, typeof courseCloLinks>();
    for (const link of courseCloLinks) {
      const links = coursesByClo.get(link.cloId) ?? [];
      links.push(link);
      coursesByClo.set(link.cloId, links);
    }

    const assessedPairs = new Set(
      assessments.map(({ courseId, cloId }) => `${courseId}:${cloId}`),
    );
    const ploLinks = new Map<
      number,
      Map<string, { courseCode: string; courseName: string; cloCode: string; assessed: boolean }>
    >();

    for (const row of matrixRows) {
      if (row.level <= 0) continue;

      const mappedCourses =
        row.courseId === null
          ? coursesByClo.get(row.cloId) ?? []
          : row.course
            ? [
                {
                  courseId: row.course.id,
                  cloId: row.cloId,
                  course: row.course,
                },
              ]
            : [];
      const links = ploLinks.get(row.ploId) ?? new Map();

      for (const link of mappedCourses) {
        const key = `${link.courseId}:${row.cloId}:${row.ploId}`;
        links.set(key, {
          courseCode: link.course.code,
          courseName: link.course.name,
          cloCode: row.clo.code,
          assessed: assessedPairs.has(`${link.courseId}:${row.cloId}`),
        });
      }

      ploLinks.set(row.ploId, links);
    }

    const parentPloIds = new Set(
      plos.flatMap((plo) => (plo.parentId === null ? [] : [plo.parentId])),
    );
    const missingPlos = plos.filter((plo) => {
      if (plo.isGroupHeader || parentPloIds.has(plo.id)) return false;
      const links = [...(ploLinks.get(plo.id)?.values() ?? [])];
      return !links.some((link) => link.assessed);
    });

    console.log(`Ngành ${major.code} - năm học ${academicYear.year}`);
    if (missingPlos.length === 0) {
      console.log('Tất cả PLO lá đều có ít nhất một đánh giá CLO.');
      return;
    }

    console.log(
      `PLO chưa có đánh giá: ${missingPlos.map((plo) => plo.code).join(', ')}`,
    );
    for (const plo of missingPlos) {
      const links = [...(ploLinks.get(plo.id)?.values() ?? [])];
      console.log(`\n${plo.code} được liên kết với:`);
      if (links.length === 0) {
        console.log('  Chưa có liên kết CLO–môn học trong ma trận.');
        continue;
      }

      for (const link of links) {
        const status = link.assessed ? 'đã đánh giá' : 'chưa đánh giá';
        console.log(
          `  ${link.courseCode} - ${link.courseName} → ${link.cloCode} (${status})`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Lỗi:', error);
  process.exitCode = 1;
});
