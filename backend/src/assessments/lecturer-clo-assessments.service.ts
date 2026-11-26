import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignLecturerCoursesDto,
  SaveCourseCloAssessmentsDto,
  SaveLecturerCloAssessmentsDto,
} from './lecturer-clo-assessment.dto';

@Injectable()
export class LecturerCloAssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listYears() {
    const years = await this.prisma.academicYear.findMany({
      select: { year: true },
      orderBy: { year: 'desc' },
    });

    const yearSet = new Set(years.map(({ year }) => year));
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 4; y--) {
      yearSet.add(y);
    }

    return Array.from(yearSet).sort((a, b) => b - a);
  }

  async getMyCourses(userId: number, academicYear: number) {
    if (
      !Number.isInteger(academicYear) ||
      academicYear < 1900 ||
      academicYear > 2200
    ) {
      throw new BadRequestException('Năm học không hợp lệ.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng.');
    }

    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'SUPER USER'].includes(
      user.role?.trim().toUpperCase(),
    );

    // 1. Tìm các môn được phân công qua bảng CourseLecturer
    let assignedCourseIds: number[] = [];
    try {
      const assignments = await this.prisma.courseLecturer.findMany({
        where: {
          userId,
          OR: [
            { academicYear: { year: academicYear } },
            { academicYearId: null },
          ],
        },
        select: { courseId: true },
      });
      assignedCourseIds = assignments.map((a) => a.courseId);
    } catch {
      assignedCourseIds = [];
    }

    // 2. Tìm thêm các môn giảng viên đã từng đánh giá CLO trong năm học này
    const assessedCourses = await this.prisma.lecturerCloAssessment.findMany({
      where: {
        userId,
        academicYear: { year: academicYear },
      },
      select: { courseId: true },
      distinct: ['courseId'],
    });
    for (const item of assessedCourses) {
      if (!assignedCourseIds.includes(item.courseId)) {
        assignedCourseIds.push(item.courseId);
      }
    }

    const hasExplicitAssignments = assignedCourseIds.length > 0;

    // 3. Truy vấn danh sách môn học
    const courseWhere =
      !isAdmin && hasExplicitAssignments
        ? { id: { in: assignedCourseIds } }
        : {};

    const courses = await this.prisma.course.findMany({
      where: courseWhere,
      orderBy: [{ major: { code: 'asc' } }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        credits: true,
        semester: true,
        majorId: true,
        major: { select: { id: true, code: true, name: true } },
        cloMappings: {
          orderBy: { clo: { code: 'asc' } },
          select: {
            clo: { select: { id: true, code: true, description: true } },
          },
        },
      },
    });

    const courseIds = courses.map((c) => c.id);
    const courseCohortLinks = courseIds.length
      ? await this.prisma.courseCohort.findMany({
          where: { courseId: { in: courseIds } },
          select: {
            courseId: true,
            cohort: { select: { year: true } },
          },
        })
      : [];
    const cohortYearsByCourse = new Map<number, Set<number>>();
    for (const link of courseCohortLinks) {
      const years = cohortYearsByCourse.get(link.courseId) ?? new Set<number>();
      years.add(link.cohort.year);
      cohortYearsByCourse.set(link.courseId, years);
    }

    const studentScopes = new Map<
      string,
      { majorId: number; cohortYear: number }
    >();
    for (const course of courses) {
      for (const cohortYear of cohortYearsByCourse.get(course.id) ?? []) {
        const key = `${course.majorId}:${cohortYear}`;
        studentScopes.set(key, { majorId: course.majorId, cohortYear });
      }
    }
    const students =
      studentScopes.size > 0
        ? await this.prisma.student.findMany({
            where: {
              OR: [...studentScopes.values()],
            },
            orderBy: { studentCode: 'asc' },
            select: {
              id: true,
              studentCode: true,
              fullName: true,
              majorId: true,
              cohortYear: true,
            },
          })
        : [];
    const studentsByScope = new Map<
      string,
      typeof students
    >();
    for (const student of students) {
      const key = `${student.majorId}:${student.cohortYear}`;
      const list = studentsByScope.get(key) ?? [];
      list.push(student);
      studentsByScope.set(key, list);
    }

    // 4. Lấy ma trận CLO-PLO để bổ sung CLO cho môn nếu có
    const matrixLinks = courseIds.length
      ? await this.prisma.matrix.findMany({
          where: { courseId: { in: courseIds } },
          select: {
            courseId: true,
            clo: { select: { id: true, code: true, description: true } },
          },
        })
      : [];

    // 5. Lấy các đánh giá của năm học
    const assessments = courseIds.length
      ? await this.prisma.lecturerCloAssessment.findMany({
          where: {
            courseId: { in: courseIds },
            academicYear: { year: academicYear },
          },
          include: {
            user: { select: { id: true, fullName: true } },
          },
        })
      : [];

    // Ghép CLO cho từng môn
    const cloByCourse = new Map<
      number,
      Map<number, { id: number; code: string; description: string }>
    >();
    for (const course of courses) {
      const map = new Map<
        number,
        { id: number; code: string; description: string }
      >();
      for (const mapping of course.cloMappings) {
        map.set(mapping.clo.id, mapping.clo);
      }
      cloByCourse.set(course.id, map);
    }
    for (const matrix of matrixLinks) {
      if (matrix.courseId === null) continue;
      cloByCourse.get(matrix.courseId)?.set(matrix.clo.id, matrix.clo);
    }

    // Ghép đánh giá theo cặp courseId:cloId
    const assessmentsByPair = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const key = `${assessment.courseId}:${assessment.cloId}`;
      const list = assessmentsByPair.get(key) ?? [];
      list.push(assessment);
      assessmentsByPair.set(key, list);
    }

    const courseList = courses.map((course) => {
      const clos = [...(cloByCourse.get(course.id)?.values() ?? [])]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((clo) => {
          const entries = assessmentsByPair.get(`${course.id}:${clo.id}`) ?? [];
          const myEntry = entries.find((e) => e.userId === userId);
          const averageRate = entries.length
            ? Number(
                (
                  entries.reduce((sum, e) => sum + e.attainmentRate, 0) /
                  entries.length
                ).toFixed(2),
              )
            : null;

          return {
            id: clo.id,
            code: clo.code,
            description: clo.description,
            myRate: myEntry ? myEntry.attainmentRate : null,
            averageRate,
            lecturerCount: entries.length,
          };
        });

      const evaluatedCloCount = clos.filter((c) => c.myRate !== null).length;
      const totalCloCount = clos.length;
      const isEvaluated =
        totalCloCount > 0 && evaluatedCloCount === totalCloCount;
      const courseStudents = new Map<
        number,
        (typeof students)[number]
      >();
      for (const cohortYear of cohortYearsByCourse.get(course.id) ?? []) {
        const key = `${course.majorId}:${cohortYear}`;
        for (const student of studentsByScope.get(key) ?? []) {
          courseStudents.set(student.id, student);
        }
      }

      return {
        id: course.id,
        code: course.code,
        name: course.name,
        credits: course.credits,
        semester: course.semester,
        major: course.major,
        isAssigned: assignedCourseIds.includes(course.id),
        evaluatedCloCount,
        totalCloCount,
        isEvaluated,
        students: [...courseStudents.values()].map(
          ({ id, studentCode, fullName, cohortYear }) => ({
            id,
            studentCode,
            fullName,
            cohortYear,
          }),
        ),
        clos,
      };
    });

    return {
      lecturer: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
      },
      academicYear,
      hasExplicitAssignments,
      courses: courseList,
    };
  }

  async saveCourseAssessments(
    userId: number,
    data: SaveCourseCloAssessmentsDto,
  ) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Tài khoản giảng viên không hợp lệ.');
    }
    if (
      !Number.isInteger(data.academicYear) ||
      data.academicYear < 1900 ||
      data.academicYear > 2200
    ) {
      throw new BadRequestException('Năm học không hợp lệ.');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      include: {
        cloMappings: { select: { cloId: true } },
      },
    });
    if (!course) {
      throw new NotFoundException(
        `Không tìm thấy học phần có ID ${data.courseId}.`,
      );
    }

    const studentScores = data.studentScores ?? [];
    const studentIdsByCode = new Map<string, number>();
    if (studentScores.length > 0) {
      const studentCodes = [
        ...new Set(
          studentScores.map((item) => item.studentCode.trim().toUpperCase()),
        ),
      ];
      const [matrixLinks, students] = await Promise.all([
        this.prisma.matrix.findMany({
          where: { courseId: data.courseId },
          select: { cloId: true },
        }),
        this.prisma.student.findMany({
          where: { studentCode: { in: studentCodes } },
          select: { id: true, studentCode: true, majorId: true },
        }),
      ]);
      const validCloIds = new Set([
        ...course.cloMappings.map((mapping) => mapping.cloId),
        ...matrixLinks.map((matrix) => matrix.cloId),
      ]);

      for (const [index, item] of studentScores.entries()) {
        const code = item.studentCode.trim().toUpperCase();
        if (!code) {
          throw new BadRequestException(
            `Dòng điểm sinh viên ${index + 1}: thiếu mã sinh viên.`,
          );
        }
        if (!validCloIds.has(item.cloId)) {
          throw new BadRequestException(
            `CLO ${item.cloId} không thuộc học phần ${course.code}.`,
          );
        }
        if (!Number.isFinite(item.score) || item.score < 0 || item.score > 10) {
          throw new BadRequestException(
            `Điểm CLO của sinh viên ${item.studentCode} phải từ 0 đến 10.`,
          );
        }
      }

      const studentsByCode = new Map(
        students.map((student) => [
          student.studentCode.trim().toUpperCase(),
          student,
        ]),
      );
      const missingCodes = studentCodes.filter(
        (code) => !studentsByCode.has(code),
      );
      const wrongMajorCodes = studentCodes.filter((code) => {
        const student = studentsByCode.get(code);
        return student && student.majorId !== course.majorId;
      });
      if (missingCodes.length > 0 || wrongMajorCodes.length > 0) {
        const invalidCodes = [...missingCodes, ...wrongMajorCodes];
        throw new BadRequestException(
          `Không thể lưu điểm cho mã sinh viên chưa được khai báo hoặc không thuộc ngành của học phần: ${invalidCodes.join(', ')}.`,
        );
      }
      for (const [code, student] of studentsByCode) {
        studentIdsByCode.set(code, student.id);
      }
    }

    for (const [index, item] of data.assessments.entries()) {
      if (
        item.attainmentRate !== null &&
        (!Number.isFinite(item.attainmentRate) ||
          item.attainmentRate < 0 ||
          item.attainmentRate > 100)
      ) {
        throw new BadRequestException(
          `Dòng ${index + 1}: Tỷ lệ đạt CLO phải từ 0% đến 100%.`,
        );
      }
    }

    await this.prisma.$transaction(async (transaction) => {
      const year = await transaction.academicYear.upsert({
        where: { year: data.academicYear },
        create: { year: data.academicYear },
        update: {},
        select: { id: true },
      });

      for (const assessment of data.assessments) {
        const key = {
          userId_courseId_cloId_academicYearId: {
            userId,
            courseId: data.courseId,
            cloId: assessment.cloId,
            academicYearId: year.id,
          },
        };

        if (assessment.attainmentRate === null) {
          await transaction.lecturerCloAssessment.deleteMany({
            where: key.userId_courseId_cloId_academicYearId,
          });
          continue;
        }

        await transaction.lecturerCloAssessment.upsert({
          where: key,
          create: {
            ...key.userId_courseId_cloId_academicYearId,
            attainmentRate: assessment.attainmentRate,
          },
          update: { attainmentRate: assessment.attainmentRate },
        });
      }

      for (const item of studentScores) {
        const studentCode = item.studentCode.trim().toUpperCase();
        const studentId = studentIdsByCode.get(studentCode);
        if (!studentId) {
          throw new BadRequestException(
            `Không tìm thấy sinh viên có mã ${item.studentCode}.`,
          );
        }
        await transaction.studentCloScore.upsert({
          where: {
            studentId_courseId_cloId: {
              studentId,
              courseId: data.courseId,
              cloId: item.cloId,
            },
          },
          create: {
            studentId,
            courseId: data.courseId,
            cloId: item.cloId,
            score: item.score,
          },
          update: { score: item.score },
        });
      }
    });

    const savedCount = data.assessments.filter(
      (a) => a.attainmentRate !== null,
    ).length;
    const updatedStudentCount = new Set(
      studentScores.map((item) => item.studentCode.trim().toUpperCase()),
    ).size;

    return {
      message:
        studentScores.length > 0
          ? `Đã lưu đánh giá ${savedCount} chuẩn đầu ra và cập nhật ${studentScores.length} điểm CLO cho ${updatedStudentCount} sinh viên ở học phần ${course.code}.`
          : `Đã lưu đánh giá ${savedCount} chuẩn đầu ra cho học phần ${course.code}.`,
      courseId: course.id,
      academicYear: data.academicYear,
      savedCount,
      updatedStudentScoreCount: studentScores.length,
      updatedStudentCount,
    };
  }

  async getMajorAssessments(
    majorId: number,
    academicYear: number,
    userId: number,
  ) {
    this.validateQuery(majorId, academicYear);

    const major = await this.prisma.major.findUnique({
      where: { id: majorId },
      select: {
        id: true,
        code: true,
        name: true,
        courses: {
          orderBy: { code: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            semester: true,
            cloMappings: {
              orderBy: { clo: { code: 'asc' } },
              select: {
                clo: { select: { id: true, code: true, description: true } },
              },
            },
          },
        },
      },
    });
    if (!major) {
      throw new NotFoundException(`Không tìm thấy ngành có ID ${majorId}.`);
    }

    const courseIds = major.courses.map((course) => course.id);
    const [assessments, matrixLinks] = await Promise.all([
      this.prisma.lecturerCloAssessment.findMany({
        where: {
          course: { majorId },
          academicYear: { year: academicYear },
        },
        include: {
          user: { select: { id: true, fullName: true } },
        },
        orderBy: [{ user: { fullName: 'asc' } }, { cloId: 'asc' }],
      }),
      courseIds.length
        ? this.prisma.matrix.findMany({
            where: {
              courseId: { in: courseIds },
              clo: { majorId },
            },
            select: {
              courseId: true,
              clo: {
                select: { id: true, code: true, description: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const cloByCourse = new Map(
      major.courses.map((course) => [
        course.id,
        new Map(course.cloMappings.map(({ clo }) => [clo.id, clo])),
      ]),
    );
    for (const matrix of matrixLinks) {
      if (matrix.courseId === null) continue;
      cloByCourse.get(matrix.courseId)?.set(matrix.clo.id, matrix.clo);
    }

    const assessmentsByPair = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const key = `${assessment.courseId}:${assessment.cloId}`;
      const values = assessmentsByPair.get(key) ?? [];
      values.push(assessment);
      assessmentsByPair.set(key, values);
    }

    return {
      major: { id: major.id, code: major.code, name: major.name },
      academicYear,
      courses: major.courses.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        semester: course.semester,
        clos: [...(cloByCourse.get(course.id)?.values() ?? [])]
          .sort((left, right) => left.code.localeCompare(right.code))
          .map((clo) => {
            const entries =
              assessmentsByPair.get(`${course.id}:${clo.id}`) ?? [];
            const averageRate = entries.length
              ? Number(
                  (
                    entries.reduce(
                      (total, entry) => total + entry.attainmentRate,
                      0,
                    ) / entries.length
                  ).toFixed(2),
                )
              : null;

            return {
              id: clo.id,
              code: clo.code,
              description: clo.description,
              myRate:
                entries.find((entry) => entry.userId === userId)
                  ?.attainmentRate ?? null,
              averageRate,
              lecturerCount: entries.length,
              lecturerAssessments: entries.map((entry) => ({
                lecturerName: entry.user.fullName,
                attainmentRate: entry.attainmentRate,
                updatedAt: entry.updatedAt,
              })),
            };
          }),
      })),
    };
  }

  async getProgramReport(academicYear: number) {
    if (
      !Number.isInteger(academicYear) ||
      academicYear < 1900 ||
      academicYear > 2200
    ) {
      throw new BadRequestException('Năm học không hợp lệ.');
    }

    const programs = await this.prisma.program.findMany({
      orderBy: { code: 'asc' },
      include: {
        majors: {
          orderBy: { code: 'asc' },
          include: {
            courses: {
              orderBy: { code: 'asc' },
              include: { cloMappings: { include: { clo: true } } },
            },
            plos: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                code: true,
                description: true,
                parentId: true,
                isGroupHeader: true,
              },
            },
          },
        },
      },
    });
    const majorIds = programs.flatMap((program) =>
      program.majors.map((major) => major.id),
    );
    const [matrices, lecturerAssessments, analysisSetting] = await Promise.all([
      this.prisma.matrix.findMany({
        where: { clo: { majorId: { in: majorIds } } },
        select: {
          courseId: true,
          cloId: true,
          ploId: true,
          level: true,
          course: {
            select: { id: true, code: true, name: true, majorId: true },
          },
          clo: {
            select: { id: true, majorId: true, code: true, description: true },
          },
          plo: { select: { id: true, majorId: true, code: true } },
        },
      }),
      this.prisma.lecturerCloAssessment.findMany({
        where: {
          course: { majorId: { in: majorIds } },
          academicYear: { year: academicYear },
        },
        include: {
          user: { select: { fullName: true } },
          course: { select: { id: true, majorId: true } },
          clo: { select: { id: true, code: true, description: true } },
        },
      }),
      this.prisma.analysisSetting.findUnique({
        where: { id: 1 },
        select: { ploThreshold: true },
      }),
    ]);

    const configuredThreshold = analysisSetting?.ploThreshold ?? 75;
    const threshold =
      configuredThreshold > 0 && configuredThreshold <= 100
        ? configuredThreshold
        : 75;

    const reportPrograms = programs.map((program) => {
      const reportMajors = program.majors.map((major) => {
        const coursesById = new Map(
          major.courses.map((course) => [course.id, course]),
        );
        const plosById = new Map(major.plos.map((plo) => [plo.id, plo]));
        const courseCloPairs = major.courses.flatMap((course) =>
          course.cloMappings.map(({ clo }) => ({
            courseId: course.id,
            cloId: clo.id,
          })),
        );
        const lecturerEntries = lecturerAssessments.filter(
          (entry) => entry.course.majorId === major.id,
        );
        const reportCourseCloPairs = [...courseCloPairs];
        const reportCourseCloPairKeys = new Set(
          courseCloPairs.map(({ courseId, cloId }) => `${courseId}:${cloId}`),
        );
        const addReportCourseCloPair = (courseId: number, cloId: number) => {
          const key = `${courseId}:${cloId}`;
          if (!coursesById.has(courseId) || reportCourseCloPairKeys.has(key)) {
            return;
          }
          reportCourseCloPairKeys.add(key);
          reportCourseCloPairs.push({ courseId, cloId });
        };
        for (const matrix of matrices) {
          if (
            matrix.clo.majorId === major.id &&
            matrix.plo.majorId === major.id &&
            matrix.courseId !== null
          ) {
            addReportCourseCloPair(matrix.courseId, matrix.cloId);
          }
        }
        for (const entry of lecturerEntries) {
          addReportCourseCloPair(entry.courseId, entry.cloId);
        }
        const entriesByPair = new Map<string, typeof lecturerAssessments>();
        for (const entry of lecturerEntries) {
          const key = `${entry.courseId}:${entry.cloId}`;
          const entries = entriesByPair.get(key) ?? [];
          entries.push(entry);
          entriesByPair.set(key, entries);
        }

        const cloAssessments = reportCourseCloPairs.flatMap(
          ({ courseId, cloId }) => {
            const course = coursesById.get(courseId);
            if (!course) return [];
            const entries = entriesByPair.get(`${courseId}:${cloId}`) ?? [];
            const clo =
              course.cloMappings.find((mapping) => mapping.clo.id === cloId)
                ?.clo ??
              matrices.find(
                (matrix) =>
                  matrix.courseId === courseId && matrix.cloId === cloId,
              )?.clo ??
              entries[0]?.clo;
            if (!clo) return [];

            return [
              {
                courseId,
                courseCode: course.code,
                courseName: course.name,
                cloId,
                cloCode: clo.code,
                cloDescription: clo.description,
                averageRate: entries.length
                  ? Number(
                      (
                        entries.reduce(
                          (sum, entry) => sum + entry.attainmentRate,
                          0,
                        ) / entries.length
                      ).toFixed(2),
                    )
                  : null,
                lecturerCount: entries.length,
                lecturerAssessments: entries.map((entry) => ({
                  lecturerName: entry.user.fullName,
                  attainmentRate: entry.attainmentRate,
                  updatedAt: entry.updatedAt,
                })),
              },
            ];
          },
        );
        const averageRateByPair = new Map(
          cloAssessments.map((assessment) => [
            `${assessment.courseId}:${assessment.cloId}`,
            assessment.averageRate,
          ]),
        );

        const weightedPloTotals = new Map<
          number,
          {
            weightedTotal: number;
            totalWeight: number;
            hasMissingAssessment: boolean;
          }
        >();
        const expandedMatrixKeys = new Set<string>();
        for (const matrix of matrices) {
          if (
            matrix.clo.majorId !== major.id ||
            matrix.plo.majorId !== major.id
          ) {
            continue;
          }

          const mappedCourseIds =
            matrix.courseId === null
              ? courseCloPairs
                  .filter((pair) => pair.cloId === matrix.cloId)
                  .map((pair) => pair.courseId)
              : [matrix.courseId];
          for (const courseId of mappedCourseIds) {
            const matrixKey = `${courseId}:${matrix.cloId}:${matrix.ploId}`;
            if (expandedMatrixKeys.has(matrixKey)) continue;
            expandedMatrixKeys.add(matrixKey);

            const rate = averageRateByPair.get(`${courseId}:${matrix.cloId}`);
            if (matrix.level <= 0) continue;

            const total = weightedPloTotals.get(matrix.ploId) ?? {
              weightedTotal: 0,
              totalWeight: 0,
              hasMissingAssessment: false,
            };
            if (rate === null || rate === undefined) {
              total.hasMissingAssessment = true;
            } else {
              total.weightedTotal += rate * matrix.level;
              total.totalWeight += matrix.level;
            }
            weightedPloTotals.set(matrix.ploId, total);
          }
        }

        const ploRates = new Map<number, number | null>();
        for (const plo of major.plos) {
          const total = weightedPloTotals.get(plo.id);
          ploRates.set(
            plo.id,
            total && total.totalWeight > 0
              ? Number((total.weightedTotal / total.totalWeight).toFixed(2))
              : null,
          );
        }

        const hasHierarchy = major.plos.some((plo) => plo.parentId !== null);
        const parentPlos = major.plos.filter(
          (plo) => plo.parentId === null && !plo.isGroupHeader,
        );
        if (hasHierarchy) {
          for (const parent of parentPlos) {
            const childRates = major.plos
              .filter((plo) => plo.parentId === parent.id)
              .map((plo) => ploRates.get(plo.id) ?? null);
            ploRates.set(
              parent.id,
              childRates.length && childRates.every((rate) => rate !== null)
                ? Number(
                    (
                      childRates.reduce((sum, rate) => sum + (rate ?? 0), 0) /
                      childRates.length
                    ).toFixed(2),
                  )
                : null,
            );
          }
        }

        const summaryPlos = hasHierarchy
          ? parentPlos
          : major.plos.filter((plo) => !plo.isGroupHeader);
        const assessedRates = summaryPlos
          .map((plo) => ploRates.get(plo.id) ?? null)
          .filter((rate): rate is number => rate !== null);
        const averagePloRate =
          assessedRates.length > 0
            ? Number(
                (
                  assessedRates.reduce((sum, rate) => sum + rate, 0) /
                  assessedRates.length
                ).toFixed(2),
              )
            : null;
        const status =
          averagePloRate === null
            ? 'Chưa có dữ liệu'
            : averagePloRate >= threshold
              ? 'Đạt'
              : 'Chưa đạt';
        const ploResults = major.plos
          .filter((plo) => !plo.isGroupHeader)
          .map((plo) => {
            const rate = ploRates.get(plo.id) ?? null;
            return {
              id: plo.id,
              code: plo.code,
              description: plo.description,
              parentId: plo.parentId,
              attainmentRate: rate,
              status:
                rate === null
                  ? 'Chưa có dữ liệu'
                  : rate >= threshold
                    ? 'Đạt'
                    : 'Chưa đạt',
            };
          });
        const reportMatrixKeys = new Set<string>();
        const cloPloAssessments = matrices
          .filter(
            (matrix) =>
              matrix.clo.majorId === major.id &&
              matrix.plo.majorId === major.id,
          )
          .flatMap((matrix) => {
            const mappedCourseIds =
              matrix.courseId === null
                ? courseCloPairs
                    .filter((pair) => pair.cloId === matrix.cloId)
                    .map((pair) => pair.courseId)
                : [matrix.courseId];
            return [...new Set(mappedCourseIds)].flatMap((courseId) => {
              const matrixKey = `${courseId}:${matrix.cloId}:${matrix.ploId}`;
              if (reportMatrixKeys.has(matrixKey)) return [];
              reportMatrixKeys.add(matrixKey);

              const assessment = cloAssessments.find(
                (item) =>
                  item.courseId === courseId && item.cloId === matrix.cloId,
              );
              const course = coursesById.get(courseId);
              const clo =
                course?.cloMappings.find(
                  (mapping) => mapping.clo.id === matrix.cloId,
                )?.clo ?? matrix.clo;
              const plo = plosById.get(matrix.ploId);
              if (!course || !plo) return [];
              const ploRate = ploRates.get(matrix.ploId) ?? null;
              return [
                {
                  courseId,
                  courseCode: course.code,
                  courseName: course.name,
                  cloId: matrix.cloId,
                  cloCode: clo.code,
                  cloDescription: clo.description,
                  averageRate: assessment?.averageRate ?? null,
                  lecturerCount: assessment?.lecturerCount ?? 0,
                  lecturerAssessments: assessment?.lecturerAssessments ?? [],
                  ploCode: plo.code,
                  ploAttainmentRate: ploRate,
                  ploStatus:
                    ploRate === null
                      ? 'Chưa có dữ liệu'
                      : ploRate >= threshold
                        ? 'Đạt'
                        : 'Chưa đạt',
                  contributionLevel: matrix.level,
                },
              ];
            });
          });

        return {
          id: major.id,
          code: major.code,
          name: major.name,
          evaluation: {
            averagePloRate,
            threshold,
            status,
          },
          plos: ploResults,
          cloAssessments,
          cloPloAssessments,
        };
      });

      const programStatus =
        reportMajors.length === 0 ||
        reportMajors.some(
          (major) => major.evaluation.status === 'Chưa có dữ liệu',
        )
          ? 'Chưa có dữ liệu'
          : reportMajors.every((major) => major.evaluation.status === 'Đạt')
            ? 'Đạt'
            : 'Chưa đạt';

      return {
        program: {
          id: program.id,
          code: program.code,
          name: program.name,
          description: program.description,
        },
        academicYear,
        evaluation: { threshold, status: programStatus },
        majors: reportMajors,
      };
    });

    return { academicYear, threshold, programs: reportPrograms };
  }

  async saveAssessments(userId: number, data: SaveLecturerCloAssessmentsDto) {
    this.validateQuery(data.majorId, data.academicYear);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Tài khoản giảng viên không hợp lệ.');
    }

    for (const [index, assessment] of data.assessments.entries()) {
      if (
        assessment.attainmentRate !== null &&
        (!Number.isFinite(assessment.attainmentRate) ||
          assessment.attainmentRate < 0 ||
          assessment.attainmentRate > 100)
      ) {
        throw new BadRequestException(
          `Đánh giá dòng ${index + 1}: tỷ lệ đạt CLO phải từ 0 đến 100%.`,
        );
      }
    }

    const major = await this.prisma.major.findUnique({
      where: { id: data.majorId },
      select: {
        id: true,
        courses: {
          select: {
            id: true,
            cloMappings: { select: { cloId: true } },
          },
        },
      },
    });
    if (!major) {
      throw new NotFoundException(
        `Không tìm thấy ngành có ID ${data.majorId}.`,
      );
    }

    const validPairs = new Set(
      major.courses.flatMap((course) =>
        course.cloMappings.map(({ cloId }) => `${course.id}:${cloId}`),
      ),
    );
    const courseIds = major.courses.map((course) => course.id);
    if (courseIds.length) {
      const matrixLinks = await this.prisma.matrix.findMany({
        where: {
          courseId: { in: courseIds },
          clo: { majorId: major.id },
        },
        select: { courseId: true, cloId: true },
      });
      for (const matrix of matrixLinks) {
        if (matrix.courseId !== null) {
          validPairs.add(`${matrix.courseId}:${matrix.cloId}`);
        }
      }
    }
    for (const assessment of data.assessments) {
      if (!validPairs.has(`${assessment.courseId}:${assessment.cloId}`)) {
        throw new BadRequestException(
          `CLO ${assessment.cloId} không được liên kết với học phần ${assessment.courseId} thuộc ngành này.`,
        );
      }
    }

    const savedCount = data.assessments.filter(
      ({ attainmentRate }) => attainmentRate !== null,
    ).length;

    await this.prisma.$transaction(async (transaction) => {
      const year = await transaction.academicYear.upsert({
        where: { year: data.academicYear },
        create: { year: data.academicYear },
        update: {},
        select: { id: true },
      });

      for (const assessment of data.assessments) {
        const key = {
          userId_courseId_cloId_academicYearId: {
            userId,
            courseId: assessment.courseId,
            cloId: assessment.cloId,
            academicYearId: year.id,
          },
        };

        if (assessment.attainmentRate === null) {
          await transaction.lecturerCloAssessment.deleteMany({
            where: key.userId_courseId_cloId_academicYearId,
          });
          continue;
        }

        await transaction.lecturerCloAssessment.upsert({
          where: key,
          create: {
            ...key.userId_courseId_cloId_academicYearId,
            attainmentRate: assessment.attainmentRate,
          },
          update: { attainmentRate: assessment.attainmentRate },
        });
      }
    });

    return {
      message: 'Đã lưu đánh giá CLO của giảng viên.',
      academicYear: data.academicYear,
      savedCount,
    };
  }

  async getAssignments() {
    const lecturers = await this.prisma.user.findMany({
      where: {
        role: { in: ['LECTURER', 'USER'] },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        role: true,
        assignedCourses: {
          include: {
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                major: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    const courses = await this.prisma.course.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        major: { select: { id: true, code: true, name: true } },
      },
    });

    return {
      lecturers: lecturers.map((l) => ({
        id: l.id,
        fullName: l.fullName,
        username: l.username,
        role: l.role,
        courses: l.assignedCourses.map((ac) => ac.course),
      })),
      allCourses: courses,
    };
  }

  async assignCourses(data: AssignLecturerCoursesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng.');
    }

    await this.prisma.$transaction(async (transaction) => {
      // Xóa các phân công cũ của giảng viên này
      await transaction.courseLecturer.deleteMany({
        where: { userId: data.userId },
      });

      // Tạo các phân công mới
      if (data.courseIds.length > 0) {
        await transaction.courseLecturer.createMany({
          data: data.courseIds.map((courseId) => ({
            userId: data.userId,
            courseId,
          })),
        });
      }
    });

    return {
      message: `Đã cập nhật phân công ${data.courseIds.length} môn học cho giảng viên ${user.fullName}.`,
    };
  }

  private validateQuery(majorId: number, academicYear: number) {
    if (!Number.isInteger(majorId) || majorId <= 0) {
      throw new BadRequestException('majorId không hợp lệ.');
    }
    if (
      !Number.isInteger(academicYear) ||
      academicYear < 1900 ||
      academicYear > 2200
    ) {
      throw new BadRequestException('Năm học không hợp lệ.');
    }
  }
}
