import { DEFAULT_SETTINGS, DEFAULT_SUBJECTS, getData, replaceAllData, upsertTeachers } from "./storage";
import type { AttendanceRecord, AttendanceStatus, ClassSection, Settings, Student, User, WeekSchedule } from "./types";
import { addDays, newId, parseISODate, subjectsOn, todayISO } from "./utils";

export const DEMO_TEACHER_PASSWORD = "teacher123";

const [DRAWING, PATTERN, TAILORING] = DEFAULT_SUBJECTS.map((s) => s.id);

/** [classGroup, shift, section, timetable] */
const DEMO_SECTIONS: [string, string, string, WeekSchedule][] = [
  ["Sat-Sun", "PM", "A", { Sat: [DRAWING, PATTERN], Sun: [TAILORING] }],
  ["Sat-Sun", "PM", "B", { Sat: [DRAWING], Sun: [PATTERN, TAILORING] }],
  ["Sat-Sun", "AM", "A", { Sat: [PATTERN, TAILORING], Sun: [DRAWING] }],
  ["Mon-Tue", "AM", "A", { Mon: [DRAWING, PATTERN], Tue: [TAILORING] }],
  ["Mon-Tue", "PM", "A", { Mon: [TAILORING], Tue: [DRAWING, PATTERN] }],
  ["Thu-Fri", "AM", "A", { Thu: [DRAWING], Fri: [PATTERN, TAILORING] }],
  ["Thu-Fri", "PM", "A", { Thu: [PATTERN, TAILORING], Fri: [DRAWING] }],
];

/** [name, username, subjectId, section keys "Group|Shift|Section"] — one subject per teacher. */
const DEMO_TEACHERS: [string, string, string, string[]][] = [
  ["Hodan Warsame", "hodan", DRAWING, ["Sat-Sun|PM|A", "Sat-Sun|PM|B", "Sat-Sun|AM|A"]],
  ["Ahmed Nur", "ahmed", PATTERN, ["Sat-Sun|PM|A", "Sat-Sun|PM|B", "Sat-Sun|AM|A"]],
  ["Faisal Omar", "faisal", TAILORING, ["Sat-Sun|PM|A", "Sat-Sun|PM|B", "Sat-Sun|AM|A"]],
  ["Maryan Yusuf", "maryan", DRAWING, ["Mon-Tue|AM|A", "Mon-Tue|PM|A", "Thu-Fri|AM|A", "Thu-Fri|PM|A"]],
  ["Abdi Jama", "abdi", PATTERN, ["Mon-Tue|AM|A", "Mon-Tue|PM|A", "Thu-Fri|AM|A", "Thu-Fri|PM|A"]],
  ["Safiya Hersi", "safiya", TAILORING, ["Mon-Tue|AM|A", "Mon-Tue|PM|A"]],
  ["Khalid Farah", "khalid", TAILORING, ["Thu-Fri|AM|A", "Thu-Fri|PM|A"]],
];

/** [name, phone, section key, email?] */
const DEMO_STUDENTS: [string, string, string, string?][] = [
  ["Amina Hassan", "612 216 255", "Sat-Sun|PM|A", "amina.hassan@example.com"],
  ["Mohamed Ali Farah", "615 334 812", "Sat-Sun|PM|A"],
  ["Hodan Abdi", "617 902 441", "Sat-Sun|PM|A", "hodan.abdi@example.com"],
  ["Yusuf Omar", "613 447 190", "Sat-Sun|PM|B"],
  ["Fadumo Warsame", "618 120 563", "Sat-Sun|PM|B", "fadumo.w@example.com"],
  ["Abdirahman Nur", "619 875 302", "Sat-Sun|PM|B"],
  ["Sahra Ahmed", "611 553 908", "Sat-Sun|AM|A", "sahra.ahmed@example.com"],
  ["Ismail Jama", "614 260 774", "Sat-Sun|AM|A"],
  ["Khadija Mohamud", "616 781 235", "Mon-Tue|AM|A", "khadija.m@example.com"],
  ["Abdullahi Yusuf", "612 998 041", "Mon-Tue|AM|A"],
  ["Nimco Osman", "615 640 117", "Mon-Tue|PM|A", "nimco.osman@example.com"],
  ["Hassan Ibrahim", "617 315 686", "Mon-Tue|PM|A"],
  ["Ifrah Said", "613 728 459", "Thu-Fri|AM|A", "ifrah.said@example.com"],
  ["Ahmed Dahir", "618 462 930", "Thu-Fri|AM|A"],
  ["Ayaan Mohamed", "619 103 572", "Thu-Fri|PM|A", "ayaan.m@example.com"],
  ["Bashir Aden", "611 284 667", "Thu-Fri|PM|A"],
];

const LATE_NOTES = ["Traffic", "Bus delay", "Arrived 15 min late", ""];
const EXCUSED_NOTES = ["Medical appointment", "Family event", "Exam at university"];

/** Small seeded PRNG so the demo looks the same every time it is loaded. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (cs: Pick<ClassSection, "classGroup" | "shift" | "section">) => `${cs.classGroup}|${cs.shift}|${cs.section}`;

/**
 * Replaces institute data with a realistic school: 3 subjects, 7 class sections
 * with timetables (Sat-Sun PM has sections A and B), 7 subject teachers, 16
 * students and 14 days of attendance for every scheduled subject session.
 * Today's PM sessions are left untaken so the dashboard shows both states.
 */
export function loadDemoData(): { students: number; records: number; teachers: number; sections: number } {
  const current = getData();
  const rand = mulberry32(20261017);
  const today = todayISO();
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  // Keep the user's name and logo; make sure the demo groups and shifts exist.
  const settings: Settings = {
    ...current.settings,
    classGroups: [...new Set([...current.settings.classGroups, ...DEFAULT_SETTINGS.classGroups])],
    shifts: [...new Set([...current.settings.shifts, ...DEFAULT_SETTINGS.shifts])],
  };

  const sections: ClassSection[] = DEMO_SECTIONS.map(([classGroup, shift, section, schedule]) => ({
    id: newId(),
    classGroup,
    shift,
    section,
    schedule,
  }));
  // Any other group × shift the user configured still gets an (empty) section A.
  for (const classGroup of settings.classGroups) {
    for (const shift of settings.shifts) {
      if (!sections.some((s) => s.classGroup === classGroup && s.shift === shift)) {
        sections.push({ id: newId(), classGroup, shift, section: "A", schedule: {} });
      }
    }
  }
  const sectionByKey = new Map(sections.map((s) => [keyOf(s), s]));

  const students: Student[] = DEMO_STUDENTS.map(([fullName, phone, key, email], i) => {
    const [classGroup, shift, section] = key.split("|");
    return {
      id: newId(),
      fullName,
      phone,
      email,
      classGroup,
      shift,
      section,
      status: i === 5 ? "inactive" : "active",
      joinedAt: addDays(today, -(40 + i * 3)),
      notes: i === 2 ? "Class representative" : i === 5 ? "On leave until next term" : undefined,
    };
  });

  const teachers = upsertTeachers(
    DEMO_TEACHERS.map(([name, username, subjectId, keys]): User => ({
      id: newId(),
      username,
      password: DEMO_TEACHER_PASSWORD,
      name,
      role: "teacher",
      assignedSessions: keys.map((k) => ({ classSectionId: sectionByKey.get(k)!.id, subjectId })),
      active: true,
      createdAt: new Date().toISOString(),
    })),
  );
  const teacherFor = (sectionId: string, subjectId: string) =>
    teachers.find((t) => t.assignedSessions.some((a) => a.classSectionId === sectionId && a.subjectId === subjectId)) ?? teachers[0];

  const attendance: AttendanceRecord[] = [];
  for (let back = 13; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const cs of sections) {
      for (const [slot, subjectId] of subjectsOn(cs, date).entries()) {
        if (back === 0 && cs.shift === "PM") continue;
        const teacher = teacherFor(cs.id, subjectId);
        const roster = students.filter(
          (s) => s.classGroup === cs.classGroup && s.shift === cs.shift && s.section === cs.section,
        );
        for (const s of roster) {
          if (s.status === "inactive" && back < 7) continue;
          // Each student gets a stable "reliability" so reports show variety.
          const reliability = 0.7 + ((s.fullName.length * 7) % 25) / 100;
          const r = rand();
          let status: AttendanceStatus;
          if (r < reliability) status = "present";
          else if (r < reliability + 0.09) status = "late";
          else if (r < reliability + 0.15) status = "excused";
          else status = "absent";
          const note = status === "late" ? pick(LATE_NOTES) : status === "excused" ? pick(EXCUSED_NOTES) : "";
          const at = parseISODate(date);
          at.setHours((cs.shift === "AM" ? 8 : 14) + slot * 2, Math.floor(rand() * 40));
          attendance.push({
            id: newId(),
            date,
            classSectionId: cs.id,
            subjectId,
            studentId: s.id,
            status,
            note: note || undefined,
            recordedById: teacher.id,
            recordedByName: teacher.name,
            recordedAt: at.toISOString(),
          });
        }
      }
    }
  }

  replaceAllData(
    { settings, subjects: DEFAULT_SUBJECTS, sections, students, attendance },
    {
      category: "data",
      action: "Demo data loaded",
      summary: `${students.length} students, ${sections.length} sections, ${teachers.length} teachers, ${attendance.length} records`,
    },
  );
  return { students: students.length, records: attendance.length, teachers: teachers.length, sections: DEMO_SECTIONS.length };
}
