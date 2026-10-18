export const PAGE_SIZE = 25;
/** Upper bound for dropdown option lists (hotels, coordinators). */
export const OPTIONS_LIMIT = 500;

/** Prisma args for keyset pagination by id, fetching one extra row to detect more. */
export function pageArgs(cursor?: string, size = PAGE_SIZE) {
  return { take: size + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

export type Page<T> = { items: T[]; nextCursor: string | null };

export function toPage<T extends { id: string }>(rows: T[], size = PAGE_SIZE): Page<T> {
  const items = rows.slice(0, size);
  return { items, nextCursor: rows.length > size ? items[items.length - 1].id : null };
}
