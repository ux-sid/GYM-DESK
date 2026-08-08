import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, addMemberWithCode } from '../../services/firebase';
import type { Member, Membership, Due, Payment } from '../../types';
import { sanitizeForExcel } from '../../utils/financeUtils';
import { getKolkataTodayString, getDaysBetween } from '../../utils/dateUtils';
import * as XLSX from 'xlsx';
import { FileText, Download, Upload, CheckCircle2, ShieldAlert, ArrowDown } from 'lucide-react';

export const Reports: React.FC = () => {
  const { gym, user, role } = useAuth();
  
  // Data State
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);


  // Exporter Filter States
  const todayStr = getKolkataTodayString();
  const currentMonth = todayStr.substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [exportLoading, setExportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Importer States
  const [importPreview, setImportPreview] = useState<any[]>([]);

  const [importData, setImportData] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<{ success: number; skipped: number; failed: number } | null>(null);
  const [privacyWarning, setPrivacyWarning] = useState(false);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);

  // Load collections
  const loadData = async () => {
    if (!gym) return;
    try {
      const snapM = await getDocs(collection(db, 'gyms', gym.id, 'members'));
      setMembers(snapM.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      
      const snapMs = await getDocs(collection(db, 'gyms', gym.id, 'memberships'));
      setMemberships(snapMs.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));

      const snapD = await getDocs(collection(db, 'gyms', gym.id, 'dues'));
      setDues(snapD.docs.map(d => ({ id: d.id, ...d.data() } as Due)));

      const snapP = await getDocs(collection(db, 'gyms', gym.id, 'payments'));
      setPayments(snapP.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));


    } catch (err) {
      console.error('Failed to load collections for reports:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [gym]);

  // --- EXPORT FUNCTION ---
  const handleExport = async () => {
    if (!gym) return;
    setExportLoading(true);

    try {

      const startRange = `${selectedMonth}-01`;
      const endRange = `${selectedMonth}-31`;

      // 1. Filter payments in range
      const rangePayments = payments.filter((p) => {
        if (p.status === 'void') return false;
        return p.paymentDate >= startRange && p.paymentDate <= endRange;
      });

      const grossCollected = rangePayments.filter(p => p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
      const refunded = rangePayments.filter(p => p.type === 'refund').reduce((sum, p) => sum + p.amount, 0);
      const netCollected = grossCollected - refunded;

      const cash = rangePayments.filter(p => p.paymentMethod === 'cash' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
      const upi = rangePayments.filter(p => p.paymentMethod === 'upi' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
      const card = rangePayments.filter(p => p.paymentMethod === 'card' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
      const bank = rangePayments.filter(p => p.paymentMethod === 'bank_transfer' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
      const other = rangePayments.filter(p => p.paymentMethod === 'other' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);

      const outstanding = dues.filter(d => d.baseStatus !== 'waived').reduce((sum, d) => sum + d.balance, 0);

      // Create Workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary Page
      const summaryData = [
        ["GymDesk Business Summary Report"],
        ["Gym Name", gym.name],
        ["Report Target Month", selectedMonth],
        [],
        ["Metric", "Value in INR / Count"],
        ["Gross Collections", grossCollected],
        ["Refunds Issued", refunded],
        ["Net Collections", netCollected],
        ["Total Active Members", members.filter(m => m.recordStatus === 'current').length],
        ["Current Month Outstanding Dues", outstanding],
        [],
        ["Payment Mode Distribution"],
        ["Cash", cash],
        ["UPI", upi],
        ["Debit/Credit Card", card],
        ["Bank Transfer", bank],
        ["Other Mode", other]
      ].map(row => row.map(sanitizeForExcel));

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // Sheet 2: Members Page
      const membersHeader = ["Member Code", "Name", "Phone", "Plan", "Join Date", "Status", "Total Outstanding"];
      const membersRows = members.map((m) => {
        const latestMs = [...memberships].filter(ms => ms.memberId === m.id).sort((a,b) => b.startDate.localeCompare(a.startDate))[0];
        const outstandingAmt = dues.filter(d => d.memberId === m.id && d.baseStatus !== 'waived').reduce((sum, d) => sum + d.balance, 0);
        return [
          m.memberCode,
          m.fullName,
          m.phone,
          latestMs ? latestMs.planNameSnapshot : 'No Plan',
          m.joinDate,
          m.recordStatus,
          outstandingAmt
        ].map(sanitizeForExcel);
      });
      const wsMembers = XLSX.utils.aoa_to_sheet([membersHeader, ...membersRows]);
      XLSX.utils.book_append_sheet(wb, wsMembers, "Members");

      // Sheet 3: Payments Page
      const paymentsHeader = ["Receipt Number", "Member Code", "Date", "Type", "Amount", "Method", "Reference", "Status"];
      const paymentsRows = rangePayments.map((p) => {
        const m = members.find(mem => mem.id === p.memberId);
        return [
          p.receiptNumber,
          m ? m.memberCode : 'Unknown',
          p.paymentDate,
          p.type,
          p.amount,
          p.paymentMethod,
          p.transactionReference || 'N/A',
          p.status
        ].map(sanitizeForExcel);
      });
      const wsPayments = XLSX.utils.aoa_to_sheet([paymentsHeader, ...paymentsRows]);
      XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");

      // Sheet 4: Outstanding Dues Page
      const duesHeader = ["Member Code", "Member Name", "Phone", "Due Date", "Net Due Amount", "Paid Amount", "Remaining Balance", "Days Overdue"];
      const duesRows = dues
        .filter(d => d.balance > 0 && d.baseStatus !== 'waived')
        .map((d) => {
          const m = members.find(mem => mem.id === d.memberId);
          const daysOverdue = d.dueDate < todayStr ? getDaysBetween(d.dueDate, todayStr) : 0;
          return [
            m ? m.memberCode : 'Unknown',
            m ? m.fullName : 'Unknown',
            m ? m.phone : 'N/A',
            d.dueDate,
            d.netDue,
            d.amountPaid,
            d.balance,
            daysOverdue
          ].map(sanitizeForExcel);
        });
      const wsDues = XLSX.utils.aoa_to_sheet([duesHeader, ...duesRows]);
      XLSX.utils.book_append_sheet(wb, wsDues, "Outstanding Dues");

      // Download file
      XLSX.writeFile(wb, `${gym.name.replace(/\s+/g, '_')}_Monthly_Report_${selectedMonth}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate Excel report');
    } finally {
      setExportLoading(false);
    }
  };

  // --- PDF EXPORT FUNCTION ---
  const handlePDFExport = async () => {
    if (!gym) return;
    setPdfLoading(true);

    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Member Directory", 14, 15);
      doc.setFontSize(10);
      doc.text(`Gym: ${gym.name}`, 14, 22);
      
      const tableData: any[][] = [];
      const imageMap: Record<number, string> = {};

      members.forEach((m, index) => {
        const latestMs = [...memberships].filter(ms => ms.memberId === m.id).sort((a,b) => b.startDate.localeCompare(a.startDate))[0];
        const outstandingAmt = dues.filter(d => d.memberId === m.id && d.baseStatus !== 'waived').reduce((sum, d) => sum + d.balance, 0);

        if (m.photoStoragePath && m.photoStoragePath.startsWith('data:image')) {
          imageMap[index] = m.photoStoragePath;
        }

        tableData.push([
          '', // Placeholder for photo
          m.fullName,
          m.phone,
          m.joinDate,
          latestMs ? latestMs.planNameSnapshot : 'N/A',
          `Rs. ${outstandingAmt}`
        ]);
      });

      autoTable(doc, {
        head: [['Photo', 'Name', 'Phone', 'Join Date', 'Plan', 'Due Amount']],
        body: tableData,
        startY: 30,
        rowPageBreak: 'avoid',
        headStyles: { fillColor: [41, 128, 185] },
        bodyStyles: { minCellHeight: 18, valign: 'middle' },
        didDrawCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 0) {
            const base64 = imageMap[data.row.index];
            if (base64) {
              const x = data.cell.x + 2;
              const y = data.cell.y + 2;
              const dim = data.cell.height - 4;
              try {
                const ext = base64.includes('image/png') ? 'PNG' : 'JPEG';
                doc.addImage(base64, ext, x, y, dim, dim);
              } catch (e) {
                console.warn('Failed to draw image', e);
              }
            }
          }
        }
      });

      doc.save(`${gym.name.replace(/\s+/g, '_')}_Directory.pdf`);
    } catch(err) {
      console.error(err);
      alert('Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  // --- EXCEL IMPORT FUNCTIONS ---

  const handleDownloadTemplate = () => {
    const headers = [
      "Full Name", 
      "Phone", 
      "Alternate Phone", 
      "Email", 
      "Address", 
      "Join Date (YYYY-MM-DD)", 
      "Notes"
    ];
    const sampleRow = [
      "Jane Doe",
      "9876543210",
      "9876543211",
      "jane.doe@gmail.com",
      "Sector 5, Noida",
      getKolkataTodayString(),
      "Standard fitness plan request"
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "GymDesk_Member_Import_Template.xlsx");
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPrivacyWarning(false);
    setErrorLogs([]);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (json.length === 0) {
        alert('Selected file contains no member records.');
        return;
      }

      // Check if file headers are correct
      const firstRow = json[0];
      const headers = Object.keys(firstRow);

      setImportData(json);
      setImportPreview(json.slice(0, 20));

      // Scan for national ID column leak warning
      const hasAadhaar = headers.some(h => h.toLowerCase().includes('aadhaar') || h.toLowerCase().includes('national id'));
      if (hasAadhaar) {
        setPrivacyWarning(true);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const executeImport = async () => {
    if (!gym || !user || importData.length === 0) return;
    setImportLoading(true);
    setErrorLogs([]);

    let success = 0;
    let skipped = 0;
    let failed = 0;
    const logs: string[] = [];

    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      const fullNameVal = row["Full Name"] || row["fullName"] || row["Name"];
      const phoneVal = String(row["Phone"] || row["phone"] || '').replace(/\D/g, '');

      if (!fullNameVal || phoneVal.length < 10) {
        failed++;
        logs.push(`Row ${i + 2}: Skipped. Name or 10-digit Phone is missing.`);
        continue;
      }

      // Check duplicate phone locally first or skip
      const duplicateSnap = await getDocs(
        query(collection(db, 'gyms', gym.id, 'members'), where('phoneNormalised', '==', phoneVal.slice(-10)))
      );
      if (!duplicateSnap.empty) {
        skipped++;
        logs.push(`Row ${i + 2}: Skipped duplicate phone: ${phoneVal}`);
        continue;
      }

      try {
        // Build Member
        const payload = {
          branchId: gym.defaultBranchId || 'main-branch',
          fullName: fullNameVal,
          searchName: String(fullNameVal).trim().toLowerCase(),
          phone: phoneVal,
          phoneNormalised: phoneVal.slice(-10),
          alternatePhone: row["Alternate Phone"] ? String(row["Alternate Phone"]) : undefined,
          email: row["Email"] || undefined,
          addressLine1: row["Address"] || undefined,
          joinDate: row["Join Date (YYYY-MM-DD)"] || getKolkataTodayString(),
          tags: [],
          notes: row["Notes"] || undefined,
          recordStatus: 'current' as const,
          privacyConsentAt: new Date(),
          consentVersion: '1.0',
          isMinor: false,
          identityVerification: {
            type: 'none' as const,
            verified: false
          },
          createdBy: user.uid,
          updatedBy: user.uid
        };

        await addMemberWithCode(gym.id, payload, user.uid, user.displayName || 'Importer');
        success++;
      } catch (err: any) {
        failed++;
        logs.push(`Row ${i + 2}: Save failed: ${err.message || 'database error'}`);
      }
    }

    setImportSummary({ success, skipped, failed });
    setErrorLogs(logs);
    setImportLoading(false);
    setImportPreview([]);
    setImportData([]);
    loadData(); // refresh totals
  };

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="border-b border-border-dark pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Reports & Excel Import</h1>
        <p className="text-sm text-muted-gray">Export ledger worksheets or bulk import new member contact sheets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Panel */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-md">
          <div className="flex gap-3 items-center mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-bold text-text-main m-0">Monthly Excel Export</h3>
          </div>
          <p className="text-xs text-muted-gray">
            Download a formatted Excel spreadsheet workbook containing business performance sheets (Summary, Members roster, Payments ledger, Dues balances).
          </p>

          <div className="space-y-4 pt-2 text-xs">
            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Select Target Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <button
              onClick={handleExport}
              disabled={exportLoading || pdfLoading}
              className="w-full bg-primary hover:bg-primary-dark transition-all text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              {exportLoading ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Generate & Download Excel Report</span>
                </>
              )}
            </button>

            <button
              onClick={handlePDFExport}
              disabled={exportLoading || pdfLoading}
              className="w-full bg-surface border-2 border-primary text-primary hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {pdfLoading ? (
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  <span>Download PDF Member Directory</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Import Panel */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-md">
          <div className="flex gap-3 items-center mb-2">
            <Upload className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-bold text-text-main m-0">Bulk Excel Import</h3>
          </div>
          <p className="text-xs text-muted-gray">
            Upload an Excel sheet mapping columns to add multiple member profiles in batches. Matches on normalized phone numbers to check duplicates.
          </p>

          {role === 'viewer' ? (
            <p className="text-xs text-amber-500">Viewer accounts are restricted from import actions.</p>
          ) : (
            <div className="space-y-4 pt-2 text-xs">
              <div className="flex gap-3">
                <button
                  onClick={handleDownloadTemplate}
                  className="flex-1 bg-surface-light border border-border-muted hover:border-primary text-text-main font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  Get Template
                </button>
                
                <label className="flex-1 bg-surface-light border border-border-muted hover:border-primary text-text-main font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-center">
                  <Upload className="h-3.5 w-3.5" />
                  Choose File
                  <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleImportFileChange} />
                </label>
              </div>

              {privacyWarning && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-800 dark:bg-amber-950/20 dark:border-amber-500/25 dark:text-amber-300 flex gap-2 items-start text-[10px]">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                  <span>
                    <strong>Warning:</strong> National ID details (like Aadhaar) detected in spreadsheet columns. GymDesk ignores complete ID numbers for user privacy. Confirm to skip these columns during database imports.
                  </span>
                </div>
              )}

              {importPreview.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] text-muted-gray font-semibold">Row Preview (First 20 rows ready):</p>
                  <div className="max-h-32 overflow-y-auto border border-border-muted p-2 rounded-lg bg-canvas divide-y divide-border-dark">
                    {importPreview.map((row, idx) => (
                      <div key={idx} className="py-1.5 flex justify-between text-[10px]">
                        <span className="text-text-main font-medium">{row["Full Name"] || row["Name"] || "No Name"}</span>
                        <span className="text-muted-gray font-mono">{row["Phone"] || "No Phone"}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={executeImport}
                    disabled={importLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {importLoading ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Run Bulk Import Roster</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {importSummary && (
                <div className="bg-canvas border border-border-muted p-4 rounded-xl space-y-2 text-xs">
                  <p className="font-bold text-text-main flex items-center gap-1 text-[10px]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Import Execution Complete:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="p-2 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 rounded-lg">
                      <span className="block font-bold text-sm">{importSummary.success}</span>
                      <span>Imported</span>
                    </div>
                    <div className="p-2 bg-neutral-900 border border-border-muted text-muted-gray rounded-lg">
                      <span className="block font-bold text-sm">{importSummary.skipped}</span>
                      <span>Skipped (Dupe)</span>
                    </div>
                    <div className="p-2 bg-red-950/20 border border-red-500/20 text-red-400 rounded-lg">
                      <span className="block font-bold text-sm">{importSummary.failed}</span>
                      <span>Failed</span>
                    </div>
                  </div>
                </div>
              )}

              {errorLogs.length > 0 && (
                <div className="max-h-24 overflow-y-auto border border-border-muted p-2 rounded-lg bg-red-950/10 text-[9px] font-mono text-red-300 divide-y divide-red-950/20 mt-2">
                  {errorLogs.map((log, idx) => (
                    <div key={idx} className="py-1">{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
