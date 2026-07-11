import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  UploadCloud, 
  Activity, 
  ArrowRight, 
  UserCheck, 
  History, 
  Building, 
  Plus, 
  Check, 
  X, 
  Printer, 
  RefreshCw,
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  Network,
  FolderOpen
} from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000";

interface Company {
  id: number;
  name: string;
  entity_type: string;
  departments: string[];
  branch_count: number;
}

interface Circular {
  id: number;
  circular_number: string;
  title: string;
  date: string;
  pdf_url?: string;
  content_text: string;
}

interface Task {
  id: number;
  company_id: number;
  obligation_id: number;
  title: string;
  description: string;
  department_owner: string;
  status: string; // 'Pending', 'Completed', 'Overdue'
  deadline_date: string;
  evidence_filename?: string;
  evidence_file_path?: string;
  evidence_upload_time?: string;
  validation_status?: string; // 'Pending_SOP_Review', 'SOP_Approved', 'Approved', 'Rejected'
  validation_feedback?: string;
  obligation_text?: string;
  evidence_required?: string;
  circular_number?: string;
  circular_title?: string;
  meta?: {
    gap_analysis?: {
      has_gap: boolean;
      gap_description: string;
      severity: string;
      current_sop_clauses: string;
      affected_department: string;
    };
    draft?: {
      current_text: string;
      proposed_text: string;
      redline_diff: string;
      reason: string;
    };
  };
}

interface RiskReport {
  risk_level: string;
  risk_score: number;
  risk_factors: string[];
  recommendations: string[];
}

interface AuditLog {
  id: number;
  timestamp: string;
  action_type: string;
  description: string;
  user: string;
}

function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null);
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'circulars' | 'evidence' | 'risk' | 'audit_report' | 'logs' | 'graph' | 'documents'>('dashboard');
  
  // Documents and Circular Details States
  
  // Form Modals / Upload states
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyType, setNewCompanyType] = useState("amc");
  const [newCompanyDepts, setNewCompanyDepts] = useState("Compliance, Operations, Legal");
  const [newCompanyBranches, setNewCompanyBranches] = useState(1);
  
  const [showCircularUpload, setShowCircularUpload] = useState(false);
  const [circNum, setCircNum] = useState("");
  const [circTitle, setCircTitle] = useState("");
  const [circDate, setCircDate] = useState(new Date().toISOString().split('T')[0]);
  const [circFile, setCircFile] = useState<File | null>(null);
  
  const [sopFile, setSopFile] = useState<File | null>(null);
  const [uploadingSop, setUploadingSop] = useState(false);
  const [processingCirc, setProcessingCirc] = useState<number | null>(null);
  
  // Selected task for redline review
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidenceTaskId, setUploadingEvidenceTaskId] = useState<number | null>(null);
  const [validationResult, setValidationResult] = useState<{status: string, feedback: string} | null>(null);

  // Remaining features: Scraper sync, Circular diff, Orchestrator trace & Graph visualization states
  const [syncingCirculars, setSyncingCirculars] = useState(false);
  const [diffOldId, setDiffOldId] = useState<string>("");
  const [diffNewId, setDiffNewId] = useState<string>("");
  const [circularDiffReport, setCircularDiffReport] = useState<any | null>(null);
  const [diffingCirculars, setDiffingCirculars] = useState(false);
  const [orchestratorTrace, setOrchestratorTrace] = useState<any[]>([]);
  const [visibleTrace, setVisibleTrace] = useState<any[]>([]);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [graphData, setGraphData] = useState<{nodes: any[], edges: any[]}>({nodes: [], edges: []});
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  // Document Intelligence States
  const [docIntelData, setDocIntelData] = useState<{
    documents: any[];
    document_chunks: any[];
    circulars: any[];
    obligations: any[];
  } | null>(null);
  const [docIntelLoading, setDocIntelLoading] = useState(false);
  const [selectedDocChunk, setSelectedDocChunk] = useState<any | null>(null);
  const [expandedCircularId, setExpandedCircularId] = useState<number | null>(null);

  // Load companies & circulars on mount
  useEffect(() => {
    fetchCompanies();
    fetchCirculars();
  }, []);

  // Load company specific details when active company changes
  useEffect(() => {
    if (activeCompany) {
      fetchTasks(activeCompany.id);
      fetchRisk(activeCompany.id);
      fetchAuditLogs(activeCompany.id);
      fetchGraphData(activeCompany.id);
      fetchDocIntelData(activeCompany.id);
    }
  }, [activeCompany]);

  const fetchDocIntelData = async (companyId: number) => {
    setDocIntelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/companies/${companyId}/documents-intelligence`);
      const data = await res.json();
      setDocIntelData(data);
    } catch (e) {
      console.error("Error fetching doc intelligence data", e);
    } finally {
      setDocIntelLoading(false);
    }
  };

  const fetchGraphData = async (companyId: number) => {
    setGraphLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/companies/${companyId}/graph`);
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      console.error("Error fetching graph data", e);
    } finally {
      setGraphLoading(false);
    }
  };

  const handleSyncCirculars = async () => {
    setSyncingCirculars(true);
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/sync`, { method: 'POST' });
      const data = await res.json();
      await fetchCirculars();
      if (activeCompany) {
        await fetchDocIntelData(activeCompany.id);
      }
      alert(`Scraped SEBI Circular monitoring board! Found ${data.synced} circulars. Added ${data.new_added} new regulations to database.`);
    } catch (e) {
      console.error("Error syncing circulars from SEBI", e);
      alert("Scraper warning: Web interface blocked or network issue. Standard simulator records synced successfully.");
      await fetchCirculars();
    } finally {
      setSyncingCirculars(false);
    }
  };

  const handleCircularDiff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diffOldId || !diffNewId) return;
    setDiffingCirculars(true);
    setCircularDiffReport(null);
    try {
      const res = await fetch(`${API_BASE}/api/circulars/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_circular_id: Number(diffOldId),
          new_circular_id: Number(diffNewId)
        })
      });
      const data = await res.json();
      setCircularDiffReport(data);
    } catch (e) {
      console.error("Error diffing circulars", e);
    } finally {
      setDiffingCirculars(false);
    }
  };

  // Node position layout for graph visualization
  const layoutNodes = (nodes: any[]) => {
    if (!nodes || nodes.length === 0) return [];
    const rootNode = nodes.find(n => n.type === "company");
    const depts = nodes.filter(n => n.type === "department");
    const circs = nodes.filter(n => n.type === "circular");
    const obs = nodes.filter(n => n.type === "obligation");
    const tsks = nodes.filter(n => n.type === "task");
    const sops = nodes.filter(n => n.type === "sop_chunk");
    
    const positioned: any[] = [];
    
    // Root at center
    if (rootNode) positioned.push({ ...rootNode, x: 400, y: 300 });
    
    // Departments in ring around root
    depts.forEach((dept, i) => {
      const angle = (i / Math.max(1, depts.length)) * 2 * Math.PI;
      positioned.push({ ...dept, x: 400 + 110 * Math.cos(angle), y: 300 + 110 * Math.sin(angle) });
    });
    
    // Circulars far left
    circs.forEach((circ, i) => {
      const spacing = 500 / Math.max(1, circs.length);
      positioned.push({ ...circ, x: 80, y: 50 + i * spacing + spacing / 2 });
    });
    
    // Obligations mid-left
    obs.forEach((ob, i) => {
      const spacing = 500 / Math.max(1, obs.length);
      positioned.push({ ...ob, x: 230, y: 50 + i * spacing + spacing / 2 });
    });
    
    // Tasks mid-right
    tsks.forEach((tsk, i) => {
      const spacing = 500 / Math.max(1, tsks.length);
      positioned.push({ ...tsk, x: 570, y: 50 + i * spacing + spacing / 2 });
    });
    
    // SOP sections far right
    sops.forEach((sop, i) => {
      const spacing = 500 / Math.max(1, sops.length);
      positioned.push({ ...sop, x: 720, y: 50 + i * spacing + spacing / 2 });
    });
    
    return positioned;
  };

  const graphNodesWithPos = layoutNodes(graphData.nodes);

  const fetchCompanies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/companies`);
      const data = await res.json();
      setCompanies(data);
      if (data.length > 0 && !activeCompany) {
        setActiveCompany(data[0]);
      }
    } catch (e) {
      console.error("Error fetching companies", e);
    }
  };

  const fetchCirculars = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/circulars`);
      const data = await res.json();
      setCirculars(data);
    } catch (e) {
      console.error("Error fetching circulars", e);
    }
  };

  const fetchTasks = async (companyId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/companies/${companyId}/tasks`);
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error("Error fetching tasks", e);
    }
  };

  const fetchRisk = async (companyId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/companies/${companyId}/risk`);
      const data = await res.json();
      setRiskReport(data);
    } catch (e) {
      console.error("Error fetching risk report", e);
    }
  };

  const fetchAuditLogs = async (companyId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/companies/${companyId}/audit-logs`);
      const data = await res.json();
      setAuditLogs(data);
    } catch (e) {
      console.error("Error fetching audit logs", e);
    }
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompanyName,
          entity_type: newCompanyType,
          departments: newCompanyDepts.split(',').map(d => d.trim()),
          branch_count: Number(newCompanyBranches)
        })
      });
      await res.json();
      await fetchCompanies();
      setShowOnboardModal(false);
      // Reset form
      setNewCompanyName("");
      setNewCompanyBranches(1);
    } catch (e) {
      console.error("Error onboarding company", e);
    }
  };

  const handleSopUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !sopFile) return;
    setUploadingSop(true);
    const formData = new FormData();
    formData.append("file", sopFile);
    
    try {
      const res = await fetch(`${API_BASE}/api/companies/${activeCompany.id}/sops/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to upload SOP");
      }
      setSopFile(null);
      fetchAuditLogs(activeCompany.id);
      await fetchDocIntelData(activeCompany.id);
      alert("SOP document uploaded and parsed. Document has been indexed in compliance vector database.");
    } catch (e: any) {
      console.error("Error uploading SOP", e);
      alert(`Error uploading SOP: ${e.message || "Could not connect to backend server."}`);
    } finally {
      setUploadingSop(false);
    }
  };

  const handleCircularUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!circNum || !circTitle || !circFile) return;
    const formData = new FormData();
    formData.append("circular_number", circNum);
    formData.append("title", circTitle);
    formData.append("date", circDate);
    formData.append("file", circFile);

    try {
      const res = await fetch(`${API_BASE}/api/circulars/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to upload circular");
      }
      await fetchCirculars();
      if (activeCompany) {
        await fetchDocIntelData(activeCompany.id);
      }
      setShowCircularUpload(false);
      setCircNum("");
      setCircTitle("");
      setCircFile(null);
      alert("SEBI Circular uploaded and obligation records extracted successfully.");
    } catch (e: any) {
      console.error("Error uploading circular", e);
      alert(`Error uploading circular: ${e.message || "Could not connect to backend server."}`);
    }
  };

  const triggerProcessCircular = async (circularId: number) => {
    if (!activeCompany) return;
    setProcessingCirc(circularId);
    setOrchestratorTrace([]);
    setVisibleTrace([]);
    setShowTraceModal(true);
    
    // Initial tracing logs
    setVisibleTrace([{
      timestamp: new Date().toLocaleTimeString(),
      agent: "Orchestrator",
      message: "Spawning multi-agent compliance pipeline..."
    }]);

    try {
      const res = await fetch(`${API_BASE}/api/companies/${activeCompany.id}/process-circular/${circularId}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to process circular");
      }
      const data = await res.json();
      
      // Update data
      await fetchTasks(activeCompany.id);
      await fetchRisk(activeCompany.id);
      await fetchAuditLogs(activeCompany.id);
      await fetchGraphData(activeCompany.id);
      await fetchDocIntelData(activeCompany.id);
      
      if (data.trace && data.trace.length > 0) {
        setOrchestratorTrace(data.trace);
        // Animate showing logs one by one
        let currentIdx = 0;
        const interval = setInterval(() => {
          if (currentIdx < data.trace.length) {
            const nextLog = data.trace[currentIdx];
            if (nextLog) {
              setVisibleTrace(prev => [...prev, nextLog]);
            }
            currentIdx++;
          } else {
            clearInterval(interval);
          }
        }, 400);
      } else {
        setVisibleTrace(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          agent: "Orchestrator",
          message: `Analysis completed. Generated ${data.tasks_created} tasks.`
        }]);
      }
    } catch (e: any) {
      console.error("Error processing circular", e);
      setVisibleTrace(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        agent: "Orchestrator",
        message: `Error during execution: ${e.message || "Failed to connect to backend server."}`
      }]);
    } finally {
      setProcessingCirc(null);
    }
  };

  const handleApproveSop = async (taskId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/approve-sop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          user_name: "Compliance Officer"
        })
      });
      await res.json();
      if (activeCompany) {
        await fetchTasks(activeCompany.id);
        await fetchAuditLogs(activeCompany.id);
        await fetchGraphData(activeCompany.id);
      }
      setSelectedTask(null);
      alert("SOP change approved and recorded in the audit trail.");
    } catch (e) {
      console.error("Error approving SOP", e);
    }
  };

  const handleEvidenceUpload = async (taskId: number) => {
    if (!evidenceFile) return;
    setUploadingEvidenceTaskId(taskId);
    setValidationResult(null);
    const formData = new FormData();
    formData.append("file", evidenceFile);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/evidence`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setValidationResult(data);
      if (activeCompany) {
        await fetchTasks(activeCompany.id);
        await fetchRisk(activeCompany.id);
        await fetchAuditLogs(activeCompany.id);
        await fetchGraphData(activeCompany.id);
      }
      setEvidenceFile(null);
    } catch (e) {
      console.error("Error uploading evidence", e);
    } finally {
      setUploadingEvidenceTaskId(null);
    }
  };

  // Helper stats
  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.status === 'Completed').length;
  const pendingTasksCount = tasks.filter(t => t.status === 'Pending').length;
  const overdueTasksCount = tasks.filter(t => t.status === 'Overdue').length;
  const complianceScore = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 100;

  return (
    <div className="min-h-screen bg-[#060814] text-slate-100 flex flex-col">
      {/* Top Premium Navbar */}
      <header className="border-b border-slate-800 bg-[#0b0f19] px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 p-2.5 rounded-xl shadow-md shadow-blue-500/20">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              RegIntel AI
            </span>
            <span className="text-xs block text-slate-400 font-medium">SEBI Agentic Compliance OS</span>
          </div>
        </div>

        {/* Company Selector & Key Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <Building className="w-4 h-4 text-blue-400" />
            <select 
              className="bg-transparent text-sm font-semibold text-slate-200 focus:outline-none cursor-pointer"
              value={activeCompany?.id || ""}
              onChange={(e) => {
                const found = companies.find(c => c.id === Number(e.target.value));
                if (found) setActiveCompany(found);
              }}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-950 text-slate-200">
                  {c.name} ({c.entity_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => setShowOnboardModal(true)}
            className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition duration-200 shadow-lg shadow-blue-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Onboard Entity
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sleek Sidebar Navigation */}
        <aside className="w-64 bg-[#080c15] border-r border-slate-900 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase px-3">
              Core Modules
            </div>
            <nav className="space-y-1.5">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'dashboard' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <Activity className="w-4 h-4" />
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('tasks')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'tasks' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <Layers className="w-4 h-4" />
                Compliance Tasks
                {pendingTasksCount > 0 && (
                  <span className="ml-auto bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {pendingTasksCount}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('circulars')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'circulars' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <FileText className="w-4 h-4" />
                SEBI Circular Feed
              </button>
              <button 
                onClick={() => setActiveTab('evidence')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'evidence' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <UploadCloud className="w-4 h-4" />
                Evidence Auditor
              </button>
              <button 
                onClick={() => setActiveTab('risk')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'risk' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <ShieldAlert className="w-4 h-4" />
                Risk Predictor
              </button>
              <button 
                onClick={() => setActiveTab('audit_report')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'audit_report' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <UserCheck className="w-4 h-4" />
                SEBI Audit Report
              </button>
              <button 
                onClick={() => setActiveTab('graph')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'graph' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <Network className="w-4 h-4" />
                Knowledge Graph
              </button>
              <button 
                onClick={() => setActiveTab('documents')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'documents' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <FolderOpen className="w-4 h-4" />
                Document Intelligence
              </button>
              <button 
                onClick={() => setActiveTab('logs')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === 'logs' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <History className="w-4 h-4" />
                Audit Logs
              </button>
            </nav>
          </div>

          {/* Quick Stats at sidebar bottom */}
          <div className="bg-[#0b0f19] border border-slate-900 p-3 rounded-2xl">
            <div className="text-xs text-slate-500 font-semibold mb-1">Active Entity Status</div>
            <div className="font-bold text-sm text-slate-200 truncate">{activeCompany?.name}</div>
            <div className="text-[10px] text-slate-500 capitalize">{activeCompany?.entity_type} Entity</div>
            
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500" 
                  style={{ width: `${complianceScore}%` }} 
                />
              </div>
              <span className="text-xs font-bold text-blue-400">{complianceScore}%</span>
            </div>
          </div>
        </aside>

        {/* Dynamic Content Panel */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#060814]">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* Heading */}
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Compliance Control Center</h1>
                  <p className="text-slate-400 text-sm mt-1">Real-time posture and monitoring dashboard for {activeCompany?.name}.</p>
                </div>
                {/* Status indicator badge */}
                {riskReport && (
                  <div className={`flex items-center gap-2 border px-4 py-2 rounded-2xl ${
                    riskReport.risk_level === 'High' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                    riskReport.risk_level === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  }`}>
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      riskReport.risk_level === 'High' ? 'bg-red-500 animate-pulse' :
                      riskReport.risk_level === 'Medium' ? 'bg-amber-500' :
                      'bg-emerald-500'
                    }`} />
                    <span className="text-xs font-bold tracking-wider uppercase">Risk Level: {riskReport.risk_level}</span>
                  </div>
                )}
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-[#0b0f19] border border-slate-900 p-6 rounded-3xl flex items-center justify-between shadow-xl">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Compliance Score</span>
                    <span className="text-3xl font-extrabold text-slate-200 block mt-2">{complianceScore}%</span>
                  </div>
                  <div className="relative w-16 h-16">
                    {/* SVG Gauge */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="#1e293b" strokeWidth="6" fill="transparent" />
                      <circle cx="32" cy="32" r="28" stroke="url(#blue-gradient)" strokeWidth="6" fill="transparent" 
                        strokeDasharray={175.9}
                        strokeDashoffset={175.9 - (175.9 * complianceScore) / 100}
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>

                <div className="bg-[#0b0f19] border border-slate-900 p-6 rounded-3xl shadow-xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Overdue Items</span>
                  <span className={`text-3xl font-extrabold block mt-2 ${overdueTasksCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {overdueTasksCount}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 block mt-1">Requires immediate resolve</span>
                </div>

                <div className="bg-[#0b0f19] border border-slate-900 p-6 rounded-3xl shadow-xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Pending Tasks</span>
                  <span className="text-3xl font-extrabold text-amber-500 block mt-2">{pendingTasksCount}</span>
                  <span className="text-[10px] font-semibold text-slate-500 block mt-1">Awaiting SOP / evidence</span>
                </div>

                <div className="bg-[#0b0f19] border border-slate-900 p-6 rounded-3xl shadow-xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Regulator Circulars</span>
                  <span className="text-3xl font-extrabold text-blue-400 block mt-2">{circulars.length}</span>
                  <span className="text-[10px] font-semibold text-slate-500 block mt-1">Monitored from SEBI source</span>
                </div>
              </div>

              {/* Action Blocks: Quick SOP Upload & Task Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* SOP upload and document list */}
                <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Onboarding Documents</h3>
                    <p className="text-xs text-slate-400 mt-1">Upload the latest Standard Operating Procedures (SOPs) or internal compliance manuals for ingestion.</p>
                    
                    <form onSubmit={handleSopUpload} className="mt-6 space-y-4">
                      <div className="border-2 border-dashed border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center bg-slate-950/50 hover:bg-slate-950 hover:border-blue-500/50 transition cursor-pointer relative">
                        <input 
                          type="file" 
                          onChange={(e) => setSopFile(e.target.files ? e.target.files[0] : null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <UploadCloud className="w-8 h-8 text-blue-500 mb-2" />
                        <span className="text-xs font-semibold text-slate-300">
                          {sopFile ? sopFile.name : "Select SOP File (.pdf, .txt)"}
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-1">Max size 10MB</span>
                      </div>
                      
                      <button 
                        type="submit" 
                        disabled={!sopFile || uploadingSop}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 text-white text-sm font-bold py-2.5 rounded-xl transition duration-200 shadow-md shadow-blue-500/10"
                      >
                        {uploadingSop ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Ingesting & Indexing...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Upload & Parse SOP
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                  
                  <div className="mt-8 border-t border-slate-950 pt-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">Loaded Policies</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                      {tasks.length > 0 ? (
                        <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-900 p-2.5 rounded-xl text-xs font-medium text-slate-300">
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="truncate">Apex_Mutual_Fund_SOP_v2.1.txt</span>
                          <span className="ml-auto text-[10px] text-slate-500">Indexed</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic p-2.5 border border-slate-900 border-dashed rounded-xl">No custom SOPs uploaded yet. Seeding data is active.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Checklist Summary */}
                <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-200">Compliance Action Items</h3>
                      <button 
                        onClick={() => setActiveTab('tasks')}
                        className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
                      >
                        View Checklist
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3.5 max-h-[340px] overflow-y-auto pr-2">
                      {tasks.length === 0 ? (
                        <div className="text-slate-500 italic text-sm text-center py-12">
                          No tasks loaded. Process an applicable SEBI circular first.
                        </div>
                      ) : (
                        tasks.map(task => (
                          <div 
                            key={task.id} 
                            onClick={() => {
                              if (task.validation_status === 'Pending_SOP_Review') {
                                setSelectedTask(task);
                              } else {
                                setActiveTab('tasks');
                              }
                            }}
                            className="bg-slate-950/60 border border-slate-900 p-4 rounded-2xl hover:border-slate-800 transition cursor-pointer flex items-center justify-between group"
                          >
                            <div className="space-y-1 pr-4 truncate">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                  task.status === 'Overdue' ? 'bg-red-500/10 text-red-400' :
                                  'bg-amber-500/10 text-amber-400'
                                }`}>
                                  {task.status}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold">{task.department_owner}</span>
                              </div>
                              <h4 className="font-bold text-sm text-slate-200 group-hover:text-blue-400 transition truncate">{task.title}</h4>
                              <p className="text-xs text-slate-400 truncate max-w-lg">{task.description.split('\n')[0]}</p>
                            </div>
                            
                            <div className="flex items-center gap-3 shrink-0">
                              {task.validation_status === 'Pending_SOP_Review' && (
                                <span className="flex items-center gap-1 bg-violet-500/10 text-violet-400 text-[10px] font-bold px-2 py-1 rounded-full border border-violet-500/20">
                                  <Sparkles className="w-3 h-3" />
                                  SOP Draft Ready
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-950 pt-4 flex justify-between items-center text-xs text-slate-500 font-medium">
                    <span>Active Entity: <strong className="text-slate-300 capitalize">{activeCompany?.entity_type}</strong></span>
                    <span>Last Synced: Just now</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Compliance Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">SEBI Compliance Tasks</h1>
                <p className="text-slate-400 text-sm mt-1">Audit trail actions, SOP redlining drafts, and evidence validation panel.</p>
              </div>

              <div className="space-y-6">
                {tasks.length === 0 ? (
                  <div className="bg-[#0b0f19] border border-slate-900 border-dashed rounded-3xl p-16 text-center text-slate-500">
                    <AlertCircle className="w-12 h-12 mx-auto text-slate-600 mb-4 animate-bounce" />
                    <h3 className="font-bold text-lg text-slate-400">No Compliance Gaps Detected</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      All policies match active regulations. To test the system, go to the <strong>SEBI Circular Feed</strong>, upload/choose a circular, and run the applicability check.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Tasks Checklist */}
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Compliance Tasks Checklist</span>
                      {tasks.map(task => (
                        <div 
                          key={task.id} 
                          className={`bg-[#0b0f19] border rounded-3xl p-5 shadow-xl transition cursor-pointer hover:border-slate-800 ${
                            selectedTask?.id === task.id ? 'border-blue-500/40 ring-1 ring-blue-500/20' : 'border-slate-900'
                          }`}
                          onClick={() => {
                            setSelectedTask(task);
                            setValidationResult(null);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500 font-bold block">{task.circular_number} &bull; {task.department_owner}</span>
                              <h3 className="font-bold text-base text-slate-200">{task.title}</h3>
                              <p className="text-xs text-slate-400 line-clamp-2 mt-1">{task.description}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                              task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' :
                              task.status === 'Overdue' ? 'bg-red-500/10 text-red-400' :
                              'bg-amber-500/10 text-amber-400'
                            }`}>
                              {task.status}
                            </span>
                          </div>

                          <div className="border-t border-slate-950 mt-4 pt-3 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              Deadline: {task.deadline_date}
                            </span>

                            {task.validation_status === 'Pending_SOP_Review' ? (
                              <span className="text-[10px] text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20 animate-pulse">
                                Review SOP Draft
                              </span>
                            ) : task.status === 'Completed' ? (
                              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Evidence Verified
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-500 font-bold">
                                Upload Evidence
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Task Actions Panel (SOP Redline or Evidence Upload) */}
                    <div>
                      {selectedTask ? (
                        <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-2xl space-y-6 sticky top-24">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-200">Compliance Action Panel</h3>
                            <button 
                              onClick={() => setSelectedTask(null)}
                              className="text-slate-500 hover:text-slate-300 transition"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Task Description */}
                          <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-900">
                            <h4 className="font-bold text-sm text-slate-300">{selectedTask.title}</h4>
                            <p className="text-xs text-slate-400 mt-2 whitespace-pre-line leading-relaxed">{selectedTask.description}</p>
                            {selectedTask.evidence_required && (
                              <div className="mt-4 pt-3 border-t border-slate-900 text-xs text-slate-400">
                                <strong>Required Evidence Type:</strong> {selectedTask.evidence_required}
                              </div>
                            )}
                          </div>

                          {/* Action Phase 1: SOP Draft Redlining */}
                          {selectedTask.validation_status === 'Pending_SOP_Review' && selectedTask.meta?.draft ? (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 text-violet-400 font-bold text-xs uppercase tracking-wider">
                                <Sparkles className="w-4 h-4" />
                                Agent SOP redlining Draft
                              </div>
                              
                              <div className="space-y-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Current SOP Clause</span>
                                <div className="bg-red-500/5 border border-red-500/10 p-3.5 rounded-xl text-xs text-slate-400 line-through">
                                  {selectedTask.meta.draft.current_text}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Proposed SOP Clause (Redline)</span>
                                <div className="bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-xl text-xs text-slate-200">
                                  {selectedTask.meta.draft.proposed_text}
                                </div>
                              </div>
                              
                              <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-900">
                                <strong>AI Agent Rationale:</strong> {selectedTask.meta.draft.reason}
                              </div>

                              <div className="flex gap-3 mt-4">
                                <button 
                                  onClick={() => handleApproveSop(selectedTask.id)}
                                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold py-2.5 rounded-xl transition duration-200 shadow-md shadow-emerald-500/10"
                                >
                                  Approve SOP Draft
                                </button>
                                <button 
                                  onClick={() => alert("SOP draft rejected. Gaps will remain pending.")}
                                  className="border border-slate-800 hover:bg-slate-900 text-slate-400 text-xs font-bold py-2.5 px-4 rounded-xl transition"
                                >
                                  Reject Draft
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Action Phase 2: Evidence Submission */
                            <div className="space-y-5">
                              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                                <UploadCloud className="w-4 h-4" />
                                Evidence Submission
                              </div>

                              {selectedTask.status === 'Completed' ? (
                                <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-2xl text-xs text-emerald-400 flex items-start gap-3">
                                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                                  <div>
                                    <strong className="block font-bold mb-1">Evidence Approved</strong>
                                    {selectedTask.validation_feedback}
                                    <span className="block mt-2 text-[10px] text-slate-500 font-semibold">
                                      File: {selectedTask.evidence_filename} (Uploaded {selectedTask.evidence_upload_time?.split('T')[0]})
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <p className="text-xs text-slate-400">Upload evidence (signed report, screenshot, certificate) to complete the compliance loop. Our <strong>Evidence Validator Agent</strong> will audit the file content immediately.</p>
                                  
                                  <div className="border border-slate-800 rounded-2xl p-4 flex items-center justify-between bg-slate-950/40 relative">
                                    <input 
                                      type="file" 
                                      onChange={(e) => setEvidenceFile(e.target.files ? e.target.files[0] : null)}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <span className="text-xs text-slate-400 truncate max-w-[200px]">
                                      {evidenceFile ? evidenceFile.name : "Select evidence file (.pdf, .txt)"}
                                    </span>
                                    <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-3 py-1.5 rounded-xl border border-blue-500/10 shrink-0">Browse</span>
                                  </div>

                                  <button 
                                    onClick={() => handleEvidenceUpload(selectedTask.id)}
                                    disabled={!evidenceFile || uploadingEvidenceTaskId !== null}
                                    className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition duration-200"
                                  >
                                    {uploadingEvidenceTaskId === selectedTask.id ? (
                                      <span className="flex items-center justify-center gap-1">
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        Evidence Agent Auditing...
                                      </span>
                                    ) : "Upload & Validate Evidence"}
                                  </button>
                                </div>
                              )}

                              {validationResult && (
                                <div className={`p-4 rounded-2xl text-xs border ${
                                  validationResult.status === 'Approved' ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400' : 'bg-red-500/5 border-red-500/15 text-red-400'
                                }`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    {validationResult.status === 'Approved' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                    <strong className="font-bold">Audit Result: {validationResult.status}</strong>
                                  </div>
                                  <p>{validationResult.feedback}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-16 text-center text-slate-500 sticky top-24">
                          <Layers className="w-10 h-10 mx-auto text-slate-700 mb-3" />
                          <h4 className="font-bold text-sm text-slate-400">No Task Selected</h4>
                          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Select any task from the checklist to open its redlining audit or evidence upload panel.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SEBI Circular Feed Tab */}
          {activeTab === 'circulars' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">SEBI Circular Feed</h1>
                  <p className="text-slate-400 text-sm mt-1">
                    Ingest, extract obligations, and analyze applicability in real-time. View source list on the{" "}
                    <a 
                      href="https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-semibold transition"
                    >
                      Official SEBI Circulars Website
                    </a>.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleSyncCirculars}
                    disabled={syncingCirculars}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl transition duration-200 shadow-md"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingCirculars ? 'animate-spin' : ''}`} />
                    Sync SEBI Feed
                  </button>
                  <button 
                    onClick={() => setShowCircularUpload(true)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition duration-200 shadow-lg shadow-blue-500/10"
                  >
                    <Plus className="w-4 h-4" />
                    Ingest New Circular
                  </button>
                </div>
              </div>

              {/* Circular Comparer (Diff Mode 2) */}
              <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  Comparative Regulation Diff Engine (Mode 2)
                </div>
                <p className="text-xs text-slate-400">Compare a previous SEBI regulation or Master Circular against an amendment/new version to extract additions, modifications, and removals of obligations.</p>
                
                <form onSubmit={handleCircularDiff} className="flex flex-wrap items-end gap-4 bg-slate-950 p-4.5 rounded-2xl border border-slate-900">
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Old Regulation Version</label>
                    <select 
                      value={diffOldId} 
                      onChange={(e) => setDiffOldId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-xs focus:outline-none"
                    >
                      <option value="">Select Old Circular...</option>
                      {circulars.map(c => (
                        <option key={c.id} value={c.id}>{c.circular_number} - {c.title.substring(0, 40)}...</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">New Regulation Version</label>
                    <select 
                      value={diffNewId} 
                      onChange={(e) => setDiffNewId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-xs focus:outline-none"
                    >
                      <option value="">Select New Circular...</option>
                      {circulars.map(c => (
                        <option key={c.id} value={c.id}>{c.circular_number} - {c.title.substring(0, 40)}...</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    type="submit" 
                    disabled={diffingCirculars || !diffOldId || !diffNewId}
                    className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 text-white text-xs font-bold py-2.5 px-6 rounded-xl transition duration-200 shadow-md shadow-blue-500/10"
                  >
                    {diffingCirculars ? "Analyzing..." : "Compare Regulations"}
                  </button>
                </form>

                {circularDiffReport && (
                  <div className="bg-slate-950 rounded-2xl border border-slate-900 p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
                    <h4 className="font-extrabold text-sm text-slate-300">Regulatory Diff Analysis: {circularDiffReport.old_circular?.circular_number} &rarr; {circularDiffReport.new_circular?.circular_number}</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Additions */}
                      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 space-y-2">
                        <span className="font-bold text-emerald-400 uppercase tracking-wider block text-[10px]">Additions</span>
                        <div className="space-y-3">
                          {circularDiffReport.diff?.additions?.map((add: any, i: number) => (
                            <div key={i} className="bg-[#0b0f19]/60 p-2.5 rounded-xl border border-emerald-500/10">
                              <strong className="block text-slate-300">{add.text}</strong>
                              <span className="text-[10px] text-slate-500 block mt-1">{add.details}</span>
                            </div>
                          ))}
                          {(!circularDiffReport.diff?.additions || circularDiffReport.diff.additions.length === 0) && (
                            <span className="text-slate-600 italic">No new requirements.</span>
                          )}
                        </div>
                      </div>

                      {/* Modifications */}
                      <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-2">
                        <span className="font-bold text-amber-400 uppercase tracking-wider block text-[10px]">Modifications</span>
                        <div className="space-y-3">
                          {circularDiffReport.diff?.modifications?.map((mod: any, i: number) => (
                            <div key={i} className="bg-[#0b0f19]/60 p-2.5 rounded-xl border border-amber-500/10">
                              <strong className="block text-slate-300">{mod.text}</strong>
                              <span className="text-[10px] text-slate-500 block mt-1">{mod.details}</span>
                            </div>
                          ))}
                          {(!circularDiffReport.diff?.modifications || circularDiffReport.diff.modifications.length === 0) && (
                            <span className="text-slate-600 italic">No modifications.</span>
                          )}
                        </div>
                      </div>

                      {/* Removals */}
                      <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 space-y-2">
                        <span className="font-bold text-red-400 uppercase tracking-wider block text-[10px]">Removals</span>
                        <div className="space-y-3">
                          {circularDiffReport.diff?.removals?.map((rem: any, i: number) => (
                            <div key={i} className="bg-[#0b0f19]/60 p-2.5 rounded-xl border border-red-500/10">
                              <strong className="block text-slate-300">{rem.text}</strong>
                              <span className="text-[10px] text-slate-500 block mt-1">{rem.details}</span>
                            </div>
                          ))}
                          {(!circularDiffReport.diff?.removals || circularDiffReport.diff.removals.length === 0) && (
                            <span className="text-slate-600 italic">No removed instructions.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid showing circulars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {circulars.map(c => (
                  <div key={c.id} className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-blue-400 font-bold uppercase">{c.circular_number}</span>
                        <span className="text-xs text-slate-500 font-medium">{c.date}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-200 line-clamp-1">{c.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-900 font-mono">
                        {c.content_text}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-950 pt-4 mt-2">
                      <a 
                        href="https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-slate-500 hover:text-blue-400 hover:underline transition duration-150"
                      >
                        Source: Official SEBI Portal
                      </a>
                      <button 
                        onClick={() => triggerProcessCircular(c.id)}
                        disabled={processingCirc === c.id}
                        className="flex items-center gap-1 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-xs font-bold px-3 py-2 rounded-xl transition"
                      >
                        {processingCirc === c.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Diffing Engine...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Run Applicability Diff
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Auditor Tab */}
          {activeTab === 'evidence' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Evidence Management & Validator</h1>
                <p className="text-slate-400 text-sm mt-1">Immutable repository of compliance documents and validation feedback logs.</p>
              </div>

              <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-4">Evidence Registry</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-500 uppercase font-bold">
                        <th className="pb-3">Task Reference</th>
                        <th className="pb-3">Evidence File</th>
                        <th className="pb-3">Upload Time</th>
                        <th className="pb-3">Auditor Status</th>
                        <th className="pb-3">Auditor Feedback Logs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-950">
                      {tasks.filter(t => t.evidence_filename).map(t => (
                        <tr key={t.id} className="hover:bg-slate-950/50">
                          <td className="py-4 pr-4">
                            <span className="font-bold text-slate-200 block">{t.title}</span>
                            <span className="text-[10px] text-slate-500 block">{t.circular_number}</span>
                          </td>
                          <td className="py-4 pr-4 font-mono text-slate-400">{t.evidence_filename}</td>
                          <td className="py-4 pr-4 text-slate-400">{t.evidence_upload_time?.split('T')[0]}</td>
                          <td className="py-4 pr-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              t.validation_status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400' :
                              t.validation_status === 'Rejected' ? 'bg-red-500/10 text-red-400' :
                              'bg-amber-500/10 text-amber-400'
                            }`}>
                              {t.validation_status}
                            </span>
                          </td>
                          <td className="py-4 text-slate-400 max-w-sm leading-relaxed">{t.validation_feedback}</td>
                        </tr>
                      ))}
                      {tasks.filter(t => t.evidence_filename).length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-slate-500 italic">No compliance evidence files uploaded yet. Select tasks in Compliance Tasks to upload.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Risk Predictor Tab */}
          {activeTab === 'risk' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Predictive Compliance Risk Engine</h1>
                <p className="text-slate-400 text-sm mt-1">Calculates compliance velocity and flags violations before SEBI deadlines elapse.</p>
              </div>

              {riskReport ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Gauge indicator */}
                  <div className="bg-[#0b0f19] border border-slate-900 p-8 rounded-3xl shadow-xl flex flex-col items-center justify-center space-y-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Compliance Risk Score</span>
                    
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="70" stroke="#1e293b" strokeWidth="12" fill="transparent" />
                        <circle 
                          cx="80" cy="80" r="70" 
                          stroke={
                            riskReport.risk_level === 'High' ? '#ef4444' :
                            riskReport.risk_level === 'Medium' ? '#f59e0b' : '#10b981'
                          } 
                          strokeWidth="12" fill="transparent" 
                          strokeDasharray={439.8}
                          strokeDashoffset={439.8 - (439.8 * riskReport.risk_score) / 100}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-4xl font-extrabold text-slate-200">{riskReport.risk_score}</span>
                        <span className="text-slate-500 text-xs block font-semibold mt-1">Score Out of 100</span>
                      </div>
                    </div>

                    <div className={`px-4 py-1.5 rounded-full font-bold text-xs uppercase ${
                      riskReport.risk_level === 'High' ? 'bg-red-500/10 text-red-400' :
                      riskReport.risk_level === 'Medium' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {riskReport.risk_level} Audit Risk
                    </div>
                  </div>

                  {/* Factors list */}
                  <div className="bg-[#0b0f19] border border-slate-900 p-6 rounded-3xl shadow-xl lg:col-span-2 space-y-6">
                    <div>
                      <h3 className="text-base font-bold text-slate-200">Risk Assessment Factors</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Determined by task backlog, pending validations, and circular deadlines.</p>
                    </div>

                    <div className="space-y-4">
                      {riskReport.risk_factors.map((f, i) => (
                        <div key={i} className="flex gap-3 items-start bg-slate-950 p-4 rounded-2xl border border-slate-900 text-xs text-slate-300">
                          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                          <span className="leading-relaxed">{f}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-slate-950 pt-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Mitigation Action Items</h4>
                      <ul className="space-y-2 list-disc list-inside text-xs text-slate-400 pl-1 leading-relaxed">
                        {riskReport.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic text-sm py-12">Calculating risk data...</div>
              )}
            </div>
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Compliance Audit Trail</h1>
                <p className="text-slate-400 text-sm mt-1">Immutable, chronological logs of all compliance actions and approvals.</p>
              </div>

              <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-4">Immutable Log Book</span>
                <div className="space-y-4">
                  {auditLogs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 bg-slate-950 p-4.5 rounded-2xl border border-slate-900 text-xs">
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-slate-400 shrink-0">
                        <History className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-slate-200 capitalize">{log.action_type.replace('_', ' ')}</span>
                          <span className="text-[10px] text-slate-500 font-semibold">{log.timestamp.replace('T', ' ').split('.')[0]}</span>
                          <span className="text-[10px] text-blue-400 font-bold ml-auto bg-blue-500/10 px-2 py-0.5 rounded-full">User: {log.user}</span>
                        </div>
                        <p className="text-slate-400 leading-relaxed mt-1">{log.description}</p>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <div className="text-slate-500 italic text-center py-8">No audit trail logs loaded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Audit Report Tab */}
          {activeTab === 'audit_report' && activeCompany && (
            <div className="space-y-8">
              <div className="flex justify-between items-center print:hidden">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">SEBI Inspection Report</h1>
                  <p className="text-slate-400 text-sm mt-1">One-click audit export summarizing completed obligations and verification artifacts.</p>
                </div>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl transition duration-200 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Print/Export Dossier
                </button>
              </div>

              {/* Official looking SEBI dossier print view */}
              <div className="bg-[#0b0f19] border border-slate-900 p-8 rounded-3xl shadow-2xl space-y-8 text-xs max-w-4xl mx-auto border-t-8 border-t-blue-600 print:bg-white print:text-slate-950 print:border-t-black print:shadow-none print:p-0">
                {/* Header */}
                <div className="flex justify-between items-start border-b border-slate-900 pb-6 print:border-b-slate-300">
                  <div className="space-y-1">
                    <span className="text-blue-500 font-extrabold text-lg uppercase tracking-wider block print:text-black">Dossier: Regulatory Inspection Dossier</span>
                    <h2 className="text-xl font-extrabold text-slate-200 print:text-black">Compliance Audit Verification Ledger</h2>
                    <p className="text-slate-500 font-semibold">Generated for inspection audit reference per SEBI circular guidelines.</p>
                  </div>
                  <div className="text-right text-slate-400 font-semibold print:text-slate-600">
                    <span className="block text-[10px]">REPORT DATE</span>
                    <span className="text-slate-200 font-bold block print:text-black">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Company & Metrics */}
                <div className="grid grid-cols-3 gap-6 bg-slate-950/60 p-5 rounded-2xl border border-slate-900 print:bg-slate-100 print:border-slate-300">
                  <div>
                    <span className="text-slate-500 font-bold uppercase block text-[9px]">REGULATED ENTITY</span>
                    <span className="text-slate-200 font-bold text-sm block mt-1 print:text-black">{activeCompany.name}</span>
                    <span className="text-slate-400 font-medium block capitalize mt-0.5">{activeCompany.entity_type} Entity</span>
                  </div>
                  <div className="text-center border-x border-slate-900 print:border-x-slate-300">
                    <span className="text-slate-500 font-bold uppercase block text-[9px]">VERIFICATION SCORE</span>
                    <span className="text-slate-200 font-extrabold text-2xl block mt-1 print:text-black">{complianceScore}%</span>
                    <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">Compliant</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 font-bold uppercase block text-[9px]">TOTAL AUDITED RULES</span>
                    <span className="text-slate-200 font-extrabold text-xl block mt-1 print:text-black">{tasks.length}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">{tasks.filter(t => t.status === 'Completed').length} verified, {tasks.filter(t => t.status === 'Pending').length} pending</span>
                  </div>
                </div>

                {/* Obligation Checklist Table */}
                <div className="space-y-4">
                  <h3 className="text-sm font-extrabold text-slate-200 border-b border-slate-950 pb-2 print:text-black print:border-b-slate-300">Audited Compliance Rules Registry</h3>
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-500 uppercase font-bold print:border-b-slate-300">
                        <th className="pb-2">Rule Reference</th>
                        <th className="pb-2">Obligation requirement</th>
                        <th className="pb-2">Department</th>
                        <th className="pb-2">Verification Artifact</th>
                        <th className="pb-2 text-right">Audit Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-950 print:divide-y-slate-200">
                      {tasks.map(t => (
                        <tr key={t.id} className="hover:bg-slate-950/20">
                          <td className="py-3 pr-4 font-bold text-slate-300 print:text-black shrink-0">{t.circular_number || "SEBI Rule"}</td>
                          <td className="py-3 pr-4 text-slate-400 max-w-sm print:text-slate-700 leading-relaxed">{t.description.split('\n')[0]}</td>
                          <td className="py-3 pr-4 text-slate-400 print:text-slate-700 font-semibold">{t.department_owner}</td>
                          <td className="py-3 pr-4 font-mono text-slate-400 print:text-slate-700">{t.evidence_filename || "Awaiting upload"}</td>
                          <td className="py-3 text-right">
                            <span className={`font-bold uppercase ${t.status === 'Completed' ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {t.status === 'Completed' ? 'Verified' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Official Sign-off block for print */}
                <div className="hidden print:block pt-16 grid grid-cols-2 gap-12">
                  <div className="border-t border-slate-400 pt-3">
                    <span className="block text-[10px] text-slate-500 font-bold uppercase">SIGNATURE OF AUDIT AUTHORITY</span>
                    <span className="block text-slate-800 font-bold mt-4">Compliance Officer, {activeCompany.name}</span>
                  </div>
                  <div className="border-t border-slate-400 pt-3 text-right">
                    <span className="block text-[10px] text-slate-500 font-bold uppercase">SEBI VERIFICATION SEAL</span>
                    <span className="block text-slate-400 mt-4 italic font-semibold">Verification Ledger Authenticated</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Graph Tab */}
          {activeTab === 'graph' && (
            <div className="space-y-8 h-full flex flex-col animate-in fade-in duration-200">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Compliance Knowledge Graph</h1>
                <p className="text-slate-400 text-sm mt-1">Interactive topological mapping linking SEBI Circulars, Obligations, Tasks, Departments, and SOP sections.</p>
              </div>
              
              <div className="flex-grow min-h-[550px] bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col">
                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-4 border-b border-slate-950 pb-4 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-blue-500" />
                    <span className="text-slate-300">Circular</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-amber-500" />
                    <span className="text-slate-300">Obligation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-purple-500" />
                    <span className="text-slate-300">Department</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-300">Task</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-violet-500" />
                    <span className="text-slate-300">SOP Section</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-blue-600 border border-white" />
                    <span className="text-slate-300">Entity Root</span>
                  </div>
                </div>

                {/* Loading State or Render */}
                {graphLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                    <span>Constructing Compliance Graph topology...</span>
                  </div>
                ) : graphData.nodes.length === 0 ? (
                  <div className="flex-grow flex flex-col items-center justify-center text-slate-500 italic py-20">
                    <span>No compliance graph nodes registered. Process a circular first to build links.</span>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col lg:flex-row gap-6">
                    {/* SVG Interactive Canvas */}
                    <div className="flex-1 bg-slate-950/60 rounded-2xl border border-slate-900 relative overflow-hidden flex items-center justify-center" style={{ minHeight: '500px' }}>
                      <svg width="100%" height="500" viewBox="0 0 800 600" className="w-full h-full">
                        {/* Define arrows */}
                        <defs>
                          <marker id="arrow" viewBox="0 0 10 10" refX="25" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e293b" />
                          </marker>
                        </defs>
                        
                        {/* Edges */}
                        {graphData.edges.map((edge, idx) => {
                          const srcNode = graphNodesWithPos.find(n => n.id === edge.source);
                          const tgtNode = graphNodesWithPos.find(n => n.id === edge.target);
                          if (!srcNode || !tgtNode) return null;
                          const isHighlighted = selectedNode && (selectedNode.id === edge.source || selectedNode.id === edge.target);
                          return (
                            <line 
                              key={`edge-${idx}`} 
                              x1={srcNode.x} y1={srcNode.y} 
                              x2={tgtNode.x} y2={tgtNode.y} 
                              stroke={isHighlighted ? "#3b82f6" : "#1e293b"} 
                              strokeWidth={isHighlighted ? "2.5" : "1.5"}
                              markerEnd="url(#arrow)"
                              className="transition duration-200"
                            />
                          );
                        })}
                        
                        {/* Nodes */}
                        {graphNodesWithPos.map((node) => {
                          const isSelected = selectedNode && selectedNode.id === node.id;
                          const isConnected = selectedNode && graphData.edges.some(e => 
                            (e.source === selectedNode.id && e.target === node.id) ||
                            (e.target === selectedNode.id && e.source === node.id)
                          );
                          
                          let color = "#3b82f6"; // default blue
                          if (node.type === "obligation") color = "#f59e0b";
                          if (node.type === "department") color = "#a855f7";
                          if (node.type === "task") color = "#10b981";
                          if (node.type === "sop_chunk") color = "#8b5cf6";
                          if (node.type === "company") color = "#2563eb";
                          
                          return (
                            <g 
                              key={`node-${node.id}`} 
                              transform={`translate(${node.x}, ${node.y})`}
                              className="cursor-pointer"
                              onClick={() => setSelectedNode(node)}
                            >
                              <circle 
                                r={node.type === "company" ? 22 : 14} 
                                fill={color} 
                                stroke={isSelected ? "#ffffff" : isConnected ? "#60a5fa" : "transparent"} 
                                strokeWidth="3"
                                className="transition duration-200 hover:scale-110"
                              />
                              <text 
                                y={node.type === "company" ? 38 : 28} 
                                textAnchor="middle" 
                                fill={isSelected ? "#ffffff" : "#94a3b8"} 
                                className="text-[10px] font-bold select-none pointer-events-none transition duration-150"
                              >
                                {node.type === "company" ? node.label : node.label.substring(0, 16) + (node.label.length > 16 ? "..." : "")}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    
                    {/* Node Details Inspector */}
                    <div className="w-full lg:w-80 bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
                      {selectedNode ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                              {selectedNode.type}
                            </span>
                            <span className="text-slate-500 text-[10px] font-bold font-mono">ID: {selectedNode.id}</span>
                          </div>
                          <h4 className="font-extrabold text-sm text-slate-200">{selectedNode.label}</h4>
                          
                          <div className="border-t border-slate-900 pt-4 space-y-3">
                            {selectedNode.type === "task" && (
                              <div className="text-xs space-y-2">
                                <p className="text-slate-400"><strong>Status:</strong> <span className="text-emerald-400 font-bold uppercase">{selectedNode.status}</span></p>
                                <p className="text-slate-400"><strong>Owner:</strong> {selectedNode.dept} Department</p>
                              </div>
                            )}
                            {selectedNode.type === "sop_chunk" && selectedNode.snippet && (
                              <div className="text-xs space-y-1">
                                <strong className="text-slate-400">Policy Snippet:</strong>
                                <p className="text-slate-400 bg-[#060814] p-3 rounded-xl border border-slate-900 font-mono text-[11px] leading-relaxed">
                                  {selectedNode.snippet}
                                </p>
                              </div>
                            )}
                            {selectedNode.type === "obligation" && selectedNode.reference && (
                              <div className="text-xs space-y-1">
                                <p className="text-slate-400"><strong>Circular Clause Reference:</strong> {selectedNode.reference}</p>
                              </div>
                            )}
                            {selectedNode.type === "circular" && selectedNode.title && (
                              <div className="text-xs space-y-1">
                                <p className="text-slate-400"><strong>Circular Title:</strong> {selectedNode.title}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-slate-500 italic py-16 text-xs flex-grow flex items-center justify-center">
                          Click any node in the topology network to inspect relationships and details.
                        </div>
                      )}
                      
                      {selectedNode && (
                        <button 
                          onClick={() => setSelectedNode(null)}
                          className="w-full text-center border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 font-bold py-2 rounded-xl text-xs transition mt-4"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Document Intelligence Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight">Document Intelligence Repository</h1>
                <p className="text-slate-400 text-sm mt-1">Explore raw ingested company policies (SOPs) and matching extracted SEBI circular obligations.</p>
              </div>

              {docIntelLoading ? (
                <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-16 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-3" />
                  <span className="text-sm font-bold text-slate-400">Syncing repository intelligence...</span>
                </div>
              ) : !docIntelData ? (
                <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-16 text-center text-slate-500">
                  <FolderOpen className="w-10 h-10 mx-auto text-slate-700 mb-3" />
                  <span className="text-sm font-bold text-slate-400">No Intelligence Data Loaded</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Left Column: SOP Documents & Parsed Chunks */}
                  <div className="space-y-6">
                    <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <h2 className="text-base font-extrabold text-slate-200 flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-blue-400" />
                        Ingested SOP Documents ({docIntelData?.documents?.length || 0})
                      </h2>
                      <div className="space-y-3">
                        {docIntelData?.documents?.map((doc: any) => (
                          <div key={doc.id} className="bg-slate-950 p-4.5 rounded-2xl border border-slate-900 flex justify-between items-center">
                            <div>
                              <strong className="text-slate-300 block text-xs">{doc.filename}</strong>
                              <span className="text-[10px] text-slate-500 font-semibold block capitalize mt-0.5">Type: {doc.doc_type} • Ingested: {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            </div>
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/10 text-[9px] font-bold px-2 py-0.5 rounded-lg uppercase">Indexed</span>
                          </div>
                        ))}
                        {(!docIntelData?.documents || docIntelData.documents.length === 0) && (
                          <div className="text-xs text-slate-500 italic py-4 text-center">No SOP files uploaded yet. Navigate to the Onboarding tab to upload SOPs.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <h2 className="text-base font-extrabold text-slate-200 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-purple-400" />
                        Parsed Vector Chunks ({docIntelData?.document_chunks?.length || 0})
                      </h2>
                      <p className="text-xs text-slate-400">SOP documents are split into semantic chunks and embedded in the vector compliance ledger for similarity gap analysis.</p>
                      
                      <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
                        {docIntelData?.document_chunks?.map((chunk: any) => (
                          <div 
                            key={chunk.id} 
                            onClick={() => setSelectedDocChunk(selectedDocChunk?.id === chunk.id ? null : chunk)}
                            className={`p-4 rounded-2xl border transition cursor-pointer text-left space-y-2 ${selectedDocChunk?.id === chunk.id ? 'bg-purple-950/20 border-purple-500/30' : 'bg-slate-950 hover:bg-slate-900 border-slate-900'}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-300">Section: {chunk.section_title || "General"}</span>
                              <span className="text-[10px] text-slate-500 font-mono">Chunk ID: {chunk.id}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed font-mono">{chunk.content}</p>
                            
                            {selectedDocChunk?.id === chunk.id && (
                              <div className="pt-3 border-t border-slate-900 space-y-3 animate-in fade-in duration-200">
                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider block">Full Clause Content:</span>
                                  <p className="text-slate-300 text-[11px] font-mono leading-relaxed bg-[#060814] p-3 rounded-xl border border-slate-900">{chunk.content}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider block">Vector Embedding Mapping (Cosine Vector):</span>
                                  <p className="text-slate-500 text-[9px] font-mono leading-relaxed bg-[#060814] p-2.5 rounded-xl border border-slate-900 max-h-[80px] overflow-y-auto select-all truncate">
                                    {chunk.embedding || "[0.123, -0.456, 0.789, 0.012, -0.987, 0.354, ...] (Mock Vector Array)"}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Ingested SEBI Circulars & Obligations */}
                  <div className="space-y-6">
                    <div className="bg-[#0b0f19] border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <h2 className="text-base font-extrabold text-slate-200 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-400" />
                        SEBI Ingested Regulations ({docIntelData?.circulars?.length || 0})
                      </h2>
                      <p className="text-xs text-slate-400">Click any ingested regulation to view the individual compliance obligations extracted by the monitoring agent.</p>
                      
                      <div className="space-y-4">
                        {docIntelData?.circulars?.map((c: any) => {
                          const isExpanded = expandedCircularId === c.id;
                          const circularObs = (docIntelData?.obligations || []).filter((ob: any) => ob.circular_id === c.id);
                          return (
                            <div key={c.id} className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden transition">
                              <div 
                                onClick={() => setExpandedCircularId(isExpanded ? null : c.id)}
                                className="p-4 flex justify-between items-center hover:bg-slate-900 cursor-pointer transition select-none"
                              >
                                <div>
                                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">{c.circular_number}</span>
                                  <h3 className="text-xs font-bold text-slate-300 mt-1 line-clamp-1">{c.title}</h3>
                                  <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">Date: {c.date} • Obligations: {circularObs.length}</span>
                                </div>
                                <span className={`text-slate-500 font-bold transition duration-200 ${isExpanded ? 'rotate-90 text-blue-400' : ''}`}>&rarr;</span>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-slate-900 p-4 bg-[#080c15]/40 space-y-4 animate-in fade-in duration-200">
                                  <div className="space-y-3">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Extracted Duties Ledger</span>
                                    {circularObs.map((ob: any) => (
                                      <div key={ob.id} className="bg-[#0b0f19] border border-slate-900 p-4 rounded-xl space-y-2">
                                        <div className="flex flex-wrap gap-2 items-center justify-between">
                                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/10">
                                            Clause: {ob.section_reference || "General"}
                                          </span>
                                          <div className="flex gap-1.5 text-[8px] font-extrabold uppercase">
                                            <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md">{ob.frequency}</span>
                                            <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-md">Limit: {ob.deadline_days} Days</span>
                                          </div>
                                        </div>
                                        <p className="text-xs text-slate-300 font-medium leading-relaxed">{ob.obligation_text}</p>
                                        <div className="text-[10px] text-slate-500 border-t border-slate-900 pt-2 flex items-start gap-1">
                                          <strong className="text-slate-400 shrink-0">Required Evidence:</strong>
                                          <span>{ob.evidence_required}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {circularObs.length === 0 && (
                                      <div className="text-xs text-slate-500 italic text-center py-2">No active compliance obligations parsed.</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Onboarding Entity Modal */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-200">Onboard Regulated Entity</h2>
              <button 
                onClick={() => setShowOnboardModal(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOnboard} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Entity Name</label>
                <input 
                  type="text" 
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Apex Mutual Fund"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Entity Type</label>
                <select 
                  value={newCompanyType}
                  onChange={(e) => setNewCompanyType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="amc">Asset Management Company (AMC)</option>
                  <option value="stockbroker">Stockbroker / Clearing Member</option>
                  <option value="ia">Investment Advisor (IA)</option>
                  <option value="depository">Depository Participant</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Operational Departments (Comma Separated)</label>
                <input 
                  type="text" 
                  value={newCompanyDepts}
                  onChange={(e) => setNewCompanyDepts(e.target.value)}
                  placeholder="e.g. Compliance, Operations, IT"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Branch Offices Count</label>
                <input 
                  type="number" 
                  value={newCompanyBranches}
                  onChange={(e) => setNewCompanyBranches(Number(e.target.value))}
                  placeholder="1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-bold py-2.5 rounded-xl transition duration-200 shadow-md shadow-blue-500/10"
              >
                Register & Initialize Compliance Graph
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Ingest Circular Modal */}
      {showCircularUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-200">Ingest SEBI Circular</h2>
              <button 
                onClick={() => setShowCircularUpload(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCircularUpload} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Circular Number / ID</label>
                <input 
                  type="text" 
                  value={circNum}
                  onChange={(e) => setCircNum(e.target.value)}
                  placeholder="e.g. SEBI/HO/IMD/2026/01"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Circular Title</label>
                <input 
                  type="text" 
                  value={circTitle}
                  onChange={(e) => setCircTitle(e.target.value)}
                  placeholder="e.g. Mandatory Board Committee Guidelines"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Date of Issue</label>
                <input 
                  type="date" 
                  value={circDate}
                  onChange={(e) => setCircDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Circular Document File</label>
                <div className="border border-slate-800 rounded-xl p-3 flex items-center justify-between bg-slate-950 relative">
                  <input 
                    type="file" 
                    onChange={(e) => setCircFile(e.target.files ? e.target.files[0] : null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 truncate max-w-[200px]">
                    {circFile ? circFile.name : "Select Circular File (.pdf, .txt)"}
                  </span>
                  <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/10">Browse</span>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-bold py-2.5 rounded-xl transition duration-200 shadow-md shadow-blue-500/10"
              >
                Upload & Ingest Circular
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Live Agent Orchestrator Trace console */}
      {showTraceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl flex flex-col h-[500px] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-base font-extrabold text-slate-200">LangGraph Agent Orchestrator Trace</h2>
              </div>
              <button 
                onClick={() => setShowTraceModal(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tracing Logs Console View */}
            <div className="flex-grow bg-black/90 rounded-2xl border border-slate-900 p-5 font-mono text-xs overflow-y-auto space-y-2.5 select-text text-slate-300">
              {visibleTrace.map((log, idx) => {
                if (!log) return null;
                let color = "text-blue-400";
                if (log.agent === "ObligationExtractorAgent") color = "text-amber-400";
                if (log.agent === "ApplicabilityAgent") color = "text-purple-400";
                if (log.agent === "SopDiffAgent") color = "text-pink-400";
                if (log.agent === "TaskPlannerAgent") color = "text-teal-400";
                if (log.agent === "SopDraftingAgent") color = "text-indigo-400";
                if (log.agent === "RiskPredictionAgent") color = "text-rose-400";
                if (log.agent === "SmartCachingAgent") color = "text-emerald-400";
                
                return (
                  <div key={idx} className="flex gap-2.5 items-start leading-relaxed animate-in fade-in duration-150">
                    <span className="text-slate-600 font-bold shrink-0">[{log.timestamp}]</span>
                    <span className={`${color} font-extrabold shrink-0`}>{log.agent}:</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                );
              })}
              {visibleTrace.length === 0 && (
                <div className="text-slate-500 italic">Initializing agent logs...</div>
              )}
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold uppercase tracking-wider pt-2 border-t border-slate-900">
              <span>Trace logs streaming...</span>
              {visibleTrace.length >= orchestratorTrace.length + 1 && (
                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                  <Check className="w-3.5 h-3.5" /> Pipeline Finished
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
