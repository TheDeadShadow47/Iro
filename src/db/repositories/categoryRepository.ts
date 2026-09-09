import { getDb } from "@/db/client";
import type { Category } from "@/domain/models";

interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
}

function rowToCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export const categoryRepository = {
  async getAll(): Promise<Category[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<CategoryRow>(
      "SELECT * FROM categories ORDER BY sort_order ASC"
    );
    return rows.map(rowToCategory);
  },

  async create(name: string): Promise<number> {
    const db = await getDb();
    const countRow = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM categories"
    );
    const result = await db.runAsync(
      "INSERT INTO categories (name, sort_order) VALUES (?, ?)",
      [name, countRow?.c ?? 0]
    );
    return result.lastInsertRowId;
  },

  async rename(id: number, name: string): Promise<void> {
    const db = await getDb();
    await db.runAsync("UPDATE categories SET name = ? WHERE id = ?", [
      name,
      id,
    ]);
  },

  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM categories WHERE id = ?", [id]);
  },
};
