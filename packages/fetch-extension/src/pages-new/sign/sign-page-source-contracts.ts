/**
 * Structural checks on sign/index.tsx source text.
 * Stronger than comment/count locks: call sites must live in expected regions.
 */

/** Slice the `{ ... }` block starting at openBraceIndex (inclusive of `{`). */
export function sliceBalancedBlock(
  source: string,
  openBraceIndex: number
): string {
  if (source[openBraceIndex] !== "{") {
    throw new Error(`expected '{' at ${openBraceIndex}`);
  }
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex, i + 1);
      }
    }
  }
  throw new Error("unbalanced braces");
}

export function extractUseEffectBodies(source: string): string[] {
  const bodies: string[] = [];
  const re = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const openBrace = match.index + match[0].length - 1;
    bodies.push(sliceBalancedBlock(source, openBrace));
  }
  return bodies;
}

export function extractNamedConstAsyncBody(
  source: string,
  name: string
): string {
  const re = new RegExp(
    `const\\s+${name}\\s*=\\s*async\\s*\\(\\s*\\)\\s*=>\\s*\\{`
  );
  const match = re.exec(source);
  if (!match) {
    throw new Error(`const ${name} = async () => { ... } not found`);
  }
  const openBrace = match.index + match[0].length - 1;
  return sliceBalancedBlock(source, openBrace);
}

export function findCallOffsets(source: string, identifier: string): number[] {
  const re = new RegExp(`\\b${identifier}\\s*\\(`, "g");
  const offsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    offsets.push(match.index);
  }
  return offsets;
}

/** True if offset falls inside [blockStart, blockStart + block.length). */
export function offsetInsideBlock(
  offset: number,
  blockStart: number,
  block: string
): boolean {
  return offset >= blockStart && offset < blockStart + block.length;
}

export function findConstAsyncBlockStart(source: string, name: string): number {
  const re = new RegExp(
    `const\\s+${name}\\s*=\\s*async\\s*\\(\\s*\\)\\s*=>\\s*\\{`
  );
  const match = re.exec(source);
  if (!match) {
    throw new Error(`const ${name} = async () => { ... } not found`);
  }
  return match.index + match[0].length - 1;
}

/**
 * Every selectChainAndPersist( must sit inside onSwitchNetwork.
 * No useEffect body (incl. cleanup) may call it.
 */
export function assertPersistOnlyInsideOnSwitchNetwork(source: string): void {
  const effectBodies = extractUseEffectBodies(source);
  for (const body of effectBodies) {
    if (/\bselectChainAndPersist\s*\(/.test(body)) {
      throw new Error(
        "selectChainAndPersist must not appear inside any useEffect"
      );
    }
  }

  const switchStart = findConstAsyncBlockStart(source, "onSwitchNetwork");
  const switchBody = sliceBalancedBlock(source, switchStart);
  const persistOffsets = findCallOffsets(source, "selectChainAndPersist");
  if (persistOffsets.length === 0) {
    throw new Error("expected selectChainAndPersist call sites in CTA path");
  }
  for (const offset of persistOffsets) {
    if (!offsetInsideBlock(offset, switchStart, switchBody)) {
      throw new Error(
        `selectChainAndPersist at ${offset} is outside onSwitchNetwork`
      );
    }
  }
}

/**
 * clearSignSwitchTicketBg may only be defined once and otherwise passed as
 * clearTicket: () => clearSignSwitchTicketBg(...) into dismiss/undo helpers.
 */
export function assertClearTicketOnlyViaDismissHelpers(source: string): void {
  const offsets = findCallOffsets(source, "clearSignSwitchTicketBg");
  if (offsets.length < 2) {
    throw new Error("expected clearSignSwitchTicketBg definition + call sites");
  }

  for (const offset of offsets) {
    const beforeIdent = source.slice(Math.max(0, offset - 24), offset);
    if (/\bfunction\s+$/.test(beforeIdent)) {
      // Definition: async function clearSignSwitchTicketBg(
      continue;
    }
    const before = source.slice(Math.max(0, offset - 120), offset);
    if (!/clearTicket\s*:\s*(?:async\s*)?\(\s*\)\s*=>\s*$/.test(before)) {
      throw new Error(
        `bare clearSignSwitchTicketBg at ${offset}; expected clearTicket: () => clearSignSwitchTicketBg(...)`
      );
    }
  }

  const dismissOffsets = findCallOffsets(source, "clearTicketOnSignDismiss");
  // Production sites: content unmount, onReject, post-Persist orphan clear,
  // SignPageV2 shell useInteractionInfo, prepare-failure Reject.
  const expectedDismissSites = 5;
  if (dismissOffsets.length !== expectedDismissSites) {
    throw new Error(
      `expected exactly ${expectedDismissSites} clearTicketOnSignDismiss sites ` +
        `(unmount/reject/orphan/shell/prepare-failure); found ${dismissOffsets.length}`
    );
  }

  // Content-scoped dismiss must invalidate UI gate cache (unmount/reject/orphan).
  // Shell / prepare-failure have no SignRequestContent cache — invalidate optional.
  let dismissWithInvalidate = 0;
  for (const offset of dismissOffsets) {
    const openParen = source.indexOf("(", offset);
    if (openParen < 0) {
      continue;
    }
    const openBrace = source.indexOf("{", openParen);
    if (openBrace < 0 || openBrace > openParen + 40) {
      continue;
    }
    const argBlock = sliceBalancedBlock(source, openBrace);
    if (/\binvalidateGateCache\b/.test(argBlock)) {
      dismissWithInvalidate += 1;
    }
  }
  if (dismissWithInvalidate < 3) {
    throw new Error(
      `expected ≥3 clearTicketOnSignDismiss calls with invalidateGateCache ` +
        `(unmount/reject/orphan); found ${dismissWithInvalidate}`
    );
  }
}
