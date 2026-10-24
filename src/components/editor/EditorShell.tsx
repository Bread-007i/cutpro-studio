"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ExportDialog from "@/components/editor/ExportDialog";
import Inspector from "@/components/editor/Inspector";
import MediaPanel from "@/components/editor/MediaPanel";
import PwaProvider from "@/components/editor/PwaProvider";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import ProjectHome from "@/components/editor/ProjectHome";
import Timeline from "@/components/editor/Timeline";
import TopBar from "@/components/editor/TopBar";
import { useEditor } from "@/lib/editor/store";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
} from "@/lib/editor/projectStorage";
import type { ProjectSummary } from "@/lib/editor/projectStorage";
import { uid } from "@/lib/editor/utils";

type ProjectStatus = "loading" | "ready" | "saved" | "saving" | "error";

export default function EditorShell() {
  const [exportOpen, setExportOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("ready");
  const [restoreProgress, setRestoreProgress] = useState({ percentage: 0, message: "" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);

  const persistProject = useCallback(async () => {
    if (!activeProject) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const revision = ++saveRevision.current;
    setProjectStatus("saving");
    const state = useEditor.getState();
    const snapshot = {
      media: state.media,
      tracks: state.tracks,
      clips: state.clips,
      aspect: state.aspect,
    };
    const save = saveQueue.current.then(async () => {
      try {
        await saveProject(snapshot, activeProject.id, activeProject.name);
        if (revision === saveRevision.current) setProjectStatus("saved");
      } catch (error) {
        console.error("[project] save failed", error);
        if (revision === saveRevision.current) {
          setProjectStatus("error");
          toast.error(error instanceof Error ? `บันทึกโปรเจกต์ไม่สำเร็จ: ${error.message}` : "บันทึกโปรเจกต์ไม่สำเร็จ");
        }
      }
    });
    saveQueue.current = save;
    await save;
  }, [activeProject]);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (error) {
      console.error("[project] list failed", error);
      toast.error(error instanceof Error ? `อ่านรายการโปรเจกต์ไม่สำเร็จ: ${error.message}` : "อ่านรายการโปรเจกต์ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void listProjects().then((items) => {
      if (mounted) setProjects(items);
    }).catch((error: unknown) => {
      if (!mounted) return;
      console.error("[project] list failed", error);
      toast.error(error instanceof Error ? `อ่านรายการโปรเจกต์ไม่สำเร็จ: ${error.message}` : "อ่านรายการโปรเจกต์ไม่สำเร็จ");
    }).finally(() => {
      if (mounted) setLibraryLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (
        state.media === previous.media &&
        state.tracks === previous.tracks &&
        state.clips === previous.clips &&
        state.aspect === previous.aspect
      ) return;
      setProjectStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistProject();
      }, 900);
    });
    const flushOnExit = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persistProject();
    };
    window.addEventListener("pagehide", flushOnExit);
    return () => {
      unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", flushOnExit);
    };
  }, [activeProject, persistProject]);

  const openProject = useCallback(async (id: string) => {
    const summary = projects.find((project) => project.id === id);
    if (!summary) return;
    setBusyId(id);
    setRestoreProgress({ percentage: 0, message: "กำลังเตรียมเปิดโปรเจกต์…" });
    try {
      const project = await loadProject(id, (percentage, message) => {
        setRestoreProgress({ percentage, message });
      });
      if (!project) throw new Error("ไม่พบข้อมูลโปรเจกต์ที่เลือก");
      useEditor.getState().media.forEach((item) => URL.revokeObjectURL(item.url));
      useEditor.setState({
        media: project.media,
        tracks: project.tracks,
        clips: project.clips,
        aspect: project.aspect,
        selectedIds: [],
        selectedClipId: null,
        playhead: 0,
        playing: false,
        past: [],
        future: [],
        compare: false,
      });
      setActiveProject(summary);
      setProjectStatus("saved");
    } catch (error) {
      console.error("[project] restore failed", error);
      toast.error(error instanceof Error ? `เปิดโปรเจกต์ไม่สำเร็จ: ${error.message}` : "เปิดโปรเจกต์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
      await reloadProjects();
    }
  }, [projects, reloadProjects]);

  const createProject = useCallback(async (name: string) => {
    const id = uid();
    const projectName = name.trim().slice(0, 80) || "โปรเจกต์ใหม่";
    setBusyId(id);
    setRestoreProgress({ percentage: 5, message: "กำลังสร้างโปรเจกต์ในเครื่อง…" });
    try {
      useEditor.getState().media.forEach((item) => URL.revokeObjectURL(item.url));
      useEditor.getState().newProject();
      const state = useEditor.getState();
      const savedAt = await saveProject({
        media: state.media,
        tracks: state.tracks,
        clips: state.clips,
        aspect: state.aspect,
      }, id, projectName);
      setRestoreProgress({ percentage: 100, message: "สร้างโปรเจกต์เรียบร้อย" });
      const summary = { id, name: projectName, mediaCount: 0, savedAt };
      setProjects((items) => [summary, ...items]);
      setActiveProject(summary);
      setProjectStatus("saved");
    } catch (error) {
      console.error("[project] create failed", error);
      toast.error(error instanceof Error ? `สร้างโปรเจกต์ไม่สำเร็จ: ${error.message}` : "สร้างโปรเจกต์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }, []);

  const returnHome = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persistProject();
    useEditor.getState().setPlaying(false);
    useEditor.getState().media.forEach((item) => URL.revokeObjectURL(item.url));
    useEditor.getState().newProject();
    setActiveProject(null);
    await reloadProjects();
  }, [persistProject, reloadProjects]);

  const removeProject = useCallback(async (project: ProjectSummary) => {
    const confirmed = window.confirm(`ลบโปรเจกต์ "${project.name}" และไฟล์สื่อที่เก็บไว้ในเครื่องหรือไม่?`);
    if (!confirmed) return;
    setBusyId(project.id);
    try {
      await deleteProject(project.id);
      setProjects((items) => items.filter((item) => item.id !== project.id));
      toast.success("ลบโปรเจกต์และไฟล์สื่อที่เก็บไว้แล้ว");
    } catch (error) {
      console.error("[project] delete failed", error);
      toast.error(error instanceof Error ? `ลบโปรเจกต์ไม่สำเร็จ: ${error.message}` : "ลบโปรเจกต์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0e] text-zinc-100 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <PwaProvider />
      {activeProject ? (
        <>
          <TopBar
            onHome={() => void returnHome()}
            projectName={activeProject.name}
            onExport={() => setExportOpen(true)}
            onSave={() => void persistProject()}
            projectStatus={projectStatus}
          />
          <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="order-2 h-64 shrink-0 border-white/[0.06] bg-[#101016] lg:order-1 lg:h-auto lg:w-72 lg:border-r xl:w-80">
              <MediaPanel />
            </aside>
            <section className="order-1 min-h-[280px] flex-1 lg:order-2 lg:min-h-0">
              <PreviewPlayer />
            </section>
            <aside className="order-3 h-96 shrink-0 border-white/[0.06] bg-[#101016] lg:h-auto lg:max-h-none lg:w-80 lg:border-l">
              <Inspector />
            </aside>
          </main>
          <section className="order-4 h-72 shrink-0 lg:h-80">
            <Timeline />
          </section>
          <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
        </>
      ) : (
        <ProjectHome
          projects={projects}
          loading={libraryLoading}
          busyId={busyId}
          restoreProgress={restoreProgress}
          onCreate={(name) => void createProject(name)}
          onOpen={(id) => void openProject(id)}
          onDelete={(project) => void removeProject(project)}
        />
      )}
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#17171f",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#f4f4f5",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}
