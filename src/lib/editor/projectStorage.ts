import type { AspectRatio, Clip, MediaItem, Track } from "./types";

const DB_NAME = "cutpro-projects";
const STORE_NAME = "projects";
const LEGACY_PROJECT_KEY = "autosave";
const PROJECT_VERSION = 2;

interface StoredMedia {
  id: string;
  name: string;
  type: MediaItem["type"];
  duration: number;
  width: number;
  height: number;
  thumbnail?: string;
  blob: Blob;
}

interface StoredProject {
  version: number;
  id?: string;
  name?: string;
  media: StoredMedia[];
  tracks: Track[];
  clips: Clip[];
  aspect: AspectRatio;
  savedAt: number;
}

export interface LoadedProject {
  media: MediaItem[];
  tracks: Track[];
  clips: Clip[];
  aspect: AspectRatio;
  savedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  mediaCount: number;
  savedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("เบราว์เซอร์นี้ไม่รองรับการบันทึกโปรเจกต์ในเครื่อง"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("เปิดฐานข้อมูลโปรเจกต์ไม่สำเร็จ"));
    request.onblocked = () => reject(new Error("ฐานข้อมูลโปรเจกต์ถูกบล็อก กรุณาปิดแท็บแอปอื่นแล้วลองใหม่"));
  });
}

export async function saveProject(
  project: Omit<LoadedProject, "savedAt">,
  id = LEGACY_PROJECT_KEY,
  name = "โปรเจกต์เดิม"
): Promise<number> {
  const media: StoredMedia[] = await Promise.all(
    project.media.map(async (item) => {
      let blob: Blob;
      if (item.file) {
        blob = item.file;
      } else {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`อ่านไฟล์สื่อ ${item.name} ไม่สำเร็จ`);
        blob = await response.blob();
      }
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        duration: item.duration,
        width: item.width,
        height: item.height,
        thumbnail: item.thumbnail,
        blob,
      };
    })
  );
  const savedAt = Date.now();
  const stored: StoredProject = {
    version: PROJECT_VERSION,
    id,
    name,
    media,
    tracks: project.tracks,
    clips: project.clips,
    aspect: project.aspect,
    savedAt,
  };

  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(stored, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกโปรเจกต์ไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error ?? new Error("การบันทึกโปรเจกต์ถูกยกเลิก"));
    });
  } finally {
    db.close();
  }
  return savedAt;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDatabase();
  let stored: StoredProject[];
  try {
    stored = await new Promise<StoredProject[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as StoredProject[]);
      request.onerror = () => reject(request.error ?? new Error("อ่านรายการโปรเจกต์ไม่สำเร็จ"));
    });
  } finally {
    db.close();
  }
  return stored
    .filter((project) => project && (project.version === 1 || project.version === PROJECT_VERSION))
    .map((project) => ({
      id: project.id ?? LEGACY_PROJECT_KEY,
      name: project.name ?? "โปรเจกต์เดิม",
      mediaCount: project.media.length,
      savedAt: project.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("ลบโปรเจกต์ไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error ?? new Error("การลบโปรเจกต์ถูกยกเลิก"));
    });
  } finally {
    db.close();
  }
}

export async function loadProject(
  id = LEGACY_PROJECT_KEY,
  onProgress: (percentage: number, message: string) => void = () => undefined
): Promise<LoadedProject | null> {
  onProgress(5, "กำลังเปิดพื้นที่บันทึกในเครื่อง…");
  const db = await openDatabase();
  onProgress(15, "กำลังค้นหาโปรเจกต์ที่บันทึกไว้…");
  let stored: StoredProject | undefined;
  try {
    stored = await new Promise<StoredProject | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as StoredProject | undefined);
      request.onerror = () => reject(request.error ?? new Error("อ่านโปรเจกต์ที่บันทึกไว้ไม่สำเร็จ"));
    });
  } finally {
    db.close();
  }

  if (!stored || (stored.version !== 1 && stored.version !== PROJECT_VERSION)) {
    onProgress(100, "พร้อมเริ่มโปรเจกต์ใหม่");
    return null;
  }
  onProgress(25, "กำลังกู้คืนไฟล์สื่อ…");
  const media = stored.media.map((item, index): MediaItem => {
    const file = new File([item.blob], item.name, { type: item.blob.type });
    onProgress(
      25 + Math.round(((index + 1) / Math.max(stored.media.length, 1)) * 65),
      `กำลังกู้คืนสื่อ ${index + 1}/${stored.media.length}…`
    );
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      url: URL.createObjectURL(item.blob),
      file,
      duration: item.duration,
      width: item.width,
      height: item.height,
      thumbnail: item.thumbnail,
    };
  });
  onProgress(100, "กู้คืนโปรเจกต์เรียบร้อย");
  return {
    media,
    tracks: stored.tracks,
    clips: stored.clips,
    aspect: stored.aspect,
    savedAt: stored.savedAt,
  };
}
