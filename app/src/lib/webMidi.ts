export function isWebMidiSupported(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

export interface MidiInputInfo {
  id: string;
  name: string;
}

export function listInputs(access: MIDIAccess): MidiInputInfo[] {
  return Array.from(access.inputs.values()).map((input) => ({
    id: input.id,
    name: input.name || input.id,
  }));
}
