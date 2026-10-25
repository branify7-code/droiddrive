"use client";

import {
  FolderOpen,
  Image as ImageIcon,
  Camera,
  Music,
  StickyNote,
  Clock3,
  Calculator,
  Settings,
  Phone,
  MessageSquare,
} from "lucide-react";
import type { ComponentType } from "react";

import FilesApp from "./FilesApp";
import PhotosApp from "./PhotosApp";
import CameraApp from "./CameraApp";
import MusicApp from "./MusicApp";
import NotesApp from "./NotesApp";
import ClockApp from "./ClockApp";
import CalculatorApp from "./CalculatorApp";
import SettingsApp from "./SettingsApp";
import DialerApp from "./DialerApp";
import MessagesApp from "./MessagesApp";
import PlayStoreApp from "./PlayStoreApp";

export interface AppDef {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  component: ComponentType;
  home?: boolean;
  dock?: boolean;
}

/** Google Play–style colored triangle (drawn on a white tile). */
export function PlayStoreGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="#00A0FF" d="M3.6 1.8c-.4.3-.6.8-.6 1.4v17.6c0 .6.2 1.1.6 1.4L13.7 12 3.6 1.8z" />
      <path fill="#FFBC00" d="M17.1 8.5 13.7 12l3.4 3.5 4-2.3c1.2-.7 1.2-2 0-2.7l-4-2z" />
      <path fill="#FF3A44" d="M13.7 12 3.6 22.2c.4.3.9.3 1.4 0l12.1-6.7L13.7 12z" />
      <path fill="#00F076" d="M17.1 8.5 5 1.8c-.5-.3-1-.3-1.4 0L13.7 12l3.4-3.5z" />
    </svg>
  );
}

export const APPS: AppDef[] = [
  { id: "files", name: "Files", icon: FolderOpen, gradient: "from-sky-400 to-blue-600", component: FilesApp, home: true },
  { id: "photos", name: "Photos", icon: ImageIcon, gradient: "from-fuchsia-400 to-purple-600", component: PhotosApp, home: true },
  { id: "camera", name: "Camera", icon: Camera, gradient: "from-zinc-500 to-zinc-800", component: CameraApp, dock: true },
  { id: "music", name: "Music", icon: Music, gradient: "from-violet-400 to-fuchsia-600", component: MusicApp, home: true },
  { id: "notes", name: "Notes", icon: StickyNote, gradient: "from-amber-300 to-orange-500", component: NotesApp, home: true },
  { id: "clock", name: "Clock", icon: Clock3, gradient: "from-slate-500 to-slate-800", component: ClockApp, home: true },
  { id: "calculator", name: "Calc", icon: Calculator, gradient: "from-teal-300 to-emerald-600", component: CalculatorApp, home: true },
  { id: "settings", name: "Settings", icon: Settings, gradient: "from-gray-400 to-gray-700", component: SettingsApp, home: true },
  { id: "store", name: "Play Store", icon: PlayStoreGlyph, gradient: "from-white to-zinc-200", component: PlayStoreApp, home: true },
  { id: "dialer", name: "Phone", icon: Phone, gradient: "from-emerald-400 to-green-600", component: DialerApp, dock: true },
  { id: "messages", name: "Messages", icon: MessageSquare, gradient: "from-cyan-400 to-teal-600", component: MessagesApp, dock: true },
];

export function appById(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id);
}
