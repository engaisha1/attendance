"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logActivity } from "@/lib/storage";
import { useAppData } from "@/lib/hooks";
import type { Settings, Student } from "@/lib/types";
import { attendanceRate, countStatuses, formatDate, formatRate, sectionLabel, todayISO } from "@/lib/utils";
import { Modal } from "./Modal";
import { AwardIcon, PrinterIcon } from "./icons";
import { Button, Field, inputClass } from "./ui";

interface CertData {
  settings: Settings;
  student: Student;
  from: string;
  to: string;
  rate: number | null;
  sessions: number;
  principal: string;
}

/** The certificate artwork. Sized with container units so preview and print match. */
function CertificateArt({ settings, student, from, to, rate, sessions, principal }: CertData) {
  const corner = "absolute h-[6cqw] w-[6cqw] border-[#b08d3c]";
  return (
    <div className="@container w-full">
      <div className="relative aspect-[1.414] w-full overflow-hidden bg-[#fffdf7] font-serif text-[#1f2340]">
        {/* Decorative double border + corner flourishes */}
        <div className="absolute inset-[2.2cqw] border-[0.5cqw] border-double border-[#3b3f8f]" />
        <div className="absolute inset-[3.6cqw] border-[0.15cqw] border-[#b08d3c]" />
        <span className={`${corner} top-[4.6cqw] left-[4.6cqw] border-t-[0.4cqw] border-l-[0.4cqw]`} />
        <span className={`${corner} top-[4.6cqw] right-[4.6cqw] border-t-[0.4cqw] border-r-[0.4cqw]`} />
        <span className={`${corner} bottom-[4.6cqw] left-[4.6cqw] border-b-[0.4cqw] border-l-[0.4cqw]`} />
        <span className={`${corner} right-[4.6cqw] bottom-[4.6cqw] border-r-[0.4cqw] border-b-[0.4cqw]`} />

        <div className="relative flex h-full flex-col items-center px-[11cqw] pt-[7.5cqw] text-center">
          <span className="text-[5.5cqw] leading-none">{settings.logoEmoji}</span>
          <p className="mt-[1.2cqw] font-sans text-[1.7cqw] font-semibold tracking-[0.35em] text-[#3b3f8f] uppercase">
            {settings.instituteName}
          </p>
          <h2 className="mt-[1.6cqw] text-[5cqw] leading-tight font-bold tracking-wide">Certificate of Attendance</h2>
          <div className="mt-[0.8cqw] h-[0.2cqw] w-[18cqw] bg-[#b08d3c]" />
          <p className="mt-[2.4cqw] text-[1.9cqw] italic">This is proudly presented to</p>
          <p className="mt-[1cqw] border-b-[0.15cqw] border-[#b08d3c] px-[3cqw] pb-[0.4cqw] text-[4.6cqw] font-semibold italic">
            {student.fullName}
          </p>
          <p className="mt-[2.2cqw] max-w-[70cqw] text-[1.8cqw] leading-relaxed">
            for an attendance rate of{" "}
            <strong className="text-[2.6cqw] text-[#3b3f8f] not-italic">{formatRate(rate)}</strong> across {sessions} subject
            session{sessions === 1 ? "" : "s"} in {sectionLabel(student)}, from <strong>{formatDate(from)}</strong> to{" "}
            <strong>{formatDate(to)}</strong>.
          </p>

          <div className="mt-auto mb-[8cqw] flex w-full items-end justify-between font-sans text-[1.4cqw]">
            <div className="w-[26cqw] text-center">
              <p className="pb-[0.5cqw] text-[1.6cqw] font-medium">{formatDate(todayISO())}</p>
              <div className="h-[0.12cqw] bg-[#1f2340]" />
              <p className="mt-[0.5cqw] tracking-wide uppercase">Date issued</p>
            </div>
            <span className="text-[6cqw] leading-none text-[#b08d3c]" aria-hidden>
              ✦
            </span>
            <div className="w-[26cqw] text-center">
              <p className="pb-[0.5cqw] text-[1.6cqw] font-medium">&nbsp;</p>
              <div className="h-[0.12cqw] bg-[#1f2340]" />
              <p className="mt-[0.5cqw] tracking-wide uppercase">{principal ? `${principal} · Principal` : "Principal"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mount only while open. */
export function CertificateModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const { settings, attendance, users } = useAppData();
  const records = attendance.filter((r) => r.studentId === student.id);
  const earliest = records.reduce((min, r) => (r.date < min ? r.date : min), todayISO());
  const [from, setFrom] = useState(records.length ? earliest : student.joinedAt);
  const [to, setTo] = useState(todayISO());

  const inRange = records.filter((r) => r.date >= from && r.date <= to);
  const counts = countStatuses(inRange);
  const data: CertData = {
    settings,
    student,
    from,
    to,
    rate: attendanceRate(counts),
    sessions: counts.total,
    principal: users.find((u) => u.role === "principal" && u.active)?.name ?? "",
  };

  // Clean up if the modal closes mid-print.
  useEffect(() => () => document.documentElement.classList.remove("printing-certificate"), []);

  function print() {
    const html = document.documentElement;
    html.classList.add("printing-certificate");
    const done = () => {
      html.classList.remove("printing-certificate");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    logActivity({ category: "student", action: "Certificate printed", summary: `${student.fullName} · ${formatRate(data.rate)}` });
    window.print();
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Attendance Certificate"
        description={`${student.fullName} · ${sectionLabel(student)}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={print} disabled={counts.total === 0}>
              <PrinterIcon width={16} height={16} /> Print certificate
            </Button>
          </>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="cert-from">
            <input
              id="cert-from"
              type="date"
              className={inputClass}
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </Field>
          <Field label="To" htmlFor="cert-to">
            <input
              id="cert-to"
              type="date"
              className={inputClass}
              value={to}
              min={from}
              max={todayISO()}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </Field>
        </div>
        {counts.total === 0 ? (
          <p className="flex items-center gap-2 rounded-[10px] border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            <AwardIcon width={16} height={16} /> No attendance in this date range — pick a wider range to issue a certificate.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg shadow-md ring-1 ring-slate-200">
            <CertificateArt {...data} />
          </div>
        )}
      </Modal>
      {/* Print-only copy at full page width (see globals.css: html.printing-certificate). */}
      {createPortal(
        <div id="certificate-print" className="hidden">
          <CertificateArt {...data} />
        </div>,
        document.body,
      )}
    </>
  );
}
