/**
 * The app's icon set, mapped onto lucide-react. Icons are re-exported under the
 * names the app already uses so call sites stay stable if a glyph is swapped.
 *
 * Every icon renders at `1em` and inherits `currentColor`, so callers size and
 * colour them with Tailwind text utilities (`text-[15px]`, `text-neutral-500`).
 * Stroke width is dialled back from lucide's default 2 to 1.75 to suit the
 * small sizes used here; pass `strokeWidth` to override per icon.
 */
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowRight,
  Calendar,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown as ChevronDownGlyph,
  ChevronLeft as ChevronLeftGlyph,
  ChevronRight as ChevronRightGlyph,
  Folder,
  House,
  Inbox,
  Keyboard,
  Layers,
  Menu,
  Pencil,
  Plus,
  Settings,
  StickyNote,
  Trash2,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

function icon(Glyph: LucideIcon) {
  return function Icon(props: LucideProps) {
    return <Glyph size="1em" strokeWidth={1.75} aria-hidden {...props} />;
  };
}

export const CalendarIcon = icon(Calendar);
export const HomeIcon = icon(House);
export const SettingsIcon = icon(Settings);
export const TrashIcon = icon(Trash2);
export const ArrowRightIcon = icon(ArrowRight);
export const ChevronLeft = icon(ChevronLeftGlyph);
export const ChevronRight = icon(ChevronRightGlyph);
export const ChevronDown = icon(ChevronDownGlyph);
export const SortIcon = icon(ArrowDownWideNarrow);
export const CheckIcon = icon(Check);
export const KeyboardIcon = icon(Keyboard);
export const PlusIcon = icon(Plus);
export const InboxIcon = icon(Inbox);
export const ArchiveIcon = icon(Archive);
export const CheckCheckIcon = icon(CheckCheck);
export const FolderIcon = icon(Folder);
export const LayersIcon = icon(Layers);
export const MenuIcon = icon(Menu);
export const PencilIcon = icon(Pencil);
export const UsersIcon = icon(Users);
export const CheckSquareIcon = icon(CheckSquare);
export const XIcon = icon(X);
export const NotesIcon = icon(StickyNote);
