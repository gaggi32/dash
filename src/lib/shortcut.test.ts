import { describe, expect, it } from "vitest";
import { acceleratorToKeys, eventToChord } from "./shortcut";

// Tests run on Node, which the module treats as "not a Mac": the primary
// modifier is Ctrl and the extra one is Super.
function key(code: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe("eventToChord", () => {
  it("builds the default accelerator from Ctrl+Shift+Space", () => {
    const c = eventToChord(key("Space", { ctrlKey: true, shiftKey: true }));
    expect(c).toEqual({
      accelerator: "CommandOrControl+Shift+Space",
      complete: true,
      hasModifier: true,
    });
  });

  it("maps letters, digits, F-keys and arrows to Tauri names", () => {
    expect(eventToChord(key("KeyN", { altKey: true })).accelerator).toBe("Alt+N");
    expect(eventToChord(key("Digit4", { ctrlKey: true })).accelerator).toBe("CommandOrControl+4");
    expect(eventToChord(key("F12", { shiftKey: true })).accelerator).toBe("Shift+F12");
    expect(eventToChord(key("ArrowUp", { ctrlKey: true })).accelerator).toBe("CommandOrControl+Up");
    expect(eventToChord(key("KeyT", { metaKey: true })).accelerator).toBe("Super+T");
  });

  it("is incomplete while only modifiers are held", () => {
    const c = eventToChord(key("ShiftLeft", { shiftKey: true, ctrlKey: true }));
    expect(c.complete).toBe(false);
    expect(c.hasModifier).toBe(true);
    expect(c.accelerator).toBe("CommandOrControl+Shift");
  });

  it("flags a bare key as having no modifier", () => {
    const c = eventToChord(key("KeyA"));
    expect(c.complete).toBe(true);
    expect(c.hasModifier).toBe(false);
  });

  it("ignores keys Tauri cannot bind", () => {
    expect(eventToChord(key("IntlBackslash", { ctrlKey: true })).complete).toBe(false);
  });
});

describe("acceleratorToKeys", () => {
  it("shows Windows names off a Mac", () => {
    expect(acceleratorToKeys("CommandOrControl+Shift+Space")).toEqual(["Ctrl", "Shift", "Space"]);
    expect(acceleratorToKeys("Super+Up")).toEqual(["Win", "↑"]);
  });

  it("drops empty tokens", () => {
    expect(acceleratorToKeys("Alt++N")).toEqual(["Alt", "N"]);
  });
});
