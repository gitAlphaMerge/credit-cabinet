import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db, hashPassword, initialState } from "../server/store";

// Run: MANAGER_PHONE=... MANAGER_PASSWORD=... npx tsx scripts/seed-manager.ts
// Never update an existing client's role or password implicitly.
try {
  const phone = (process.env.MANAGER_PHONE ?? "").replace(/\D/g, "");
  const password = process.env.MANAGER_PASSWORD ?? "";
  if (!/^7\d{10}$/.test(phone) || password.length < 8 || password.length > 128)
    throw new Error("Set MANAGER_PHONE (+7 and 10 digits) and MANAGER_PASSWORD (8..128 characters)");
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT role FROM users WHERE phone=?").get(phone) as { role: string } | undefined;
    if (existing && existing.role !== "manager") throw new Error("Phone already belongs to a client; choose another phone");
    if (!existing) {
      const state = initialState({ name: "Демо-менеджер", form: "Другое", stage: "operating",
        sector: "Банк", registered: true, ageBand: "", result: "", debt: "", intent: "Менеджер" });
      db.prepare("INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,'manager')")
        .run(randomUUID(), phone, hashPassword(password), JSON.stringify(state));
    }
    db.exec("COMMIT");
    console.log(existing ? "Manager already exists; credentials unchanged" : "Demo manager created");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
} finally { db.close(); }
