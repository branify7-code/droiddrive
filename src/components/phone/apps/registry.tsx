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

export interface AppDef {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  component: ComponentType;
  home?: boolean;
  dock?: boolean;
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
  { id: "dialer", name: "Phone", icon: Phone, gradient: "from-emerald-400 to-green-600", component: DialerApp, dock: true },
  { id: "messages", name: "Messages", icon: MessageSquare, gradient: "from-cyan-400 to-teal-600", component: MessagesApp, dock: true },
];

export function appById(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id);
}
