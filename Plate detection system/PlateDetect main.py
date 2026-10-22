import json
import os
import re
import sqlite3
import sys
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk
 
# Store files next to this script (or next to the .exe if packaged)
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "plates.db")
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")
 
 
# ----------------------------- Database ----------------------------------
def db_connect():
    conn = sqlite3.connect(DB_FILE)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS plates (
               plate TEXT PRIMARY KEY,
               added_at TEXT DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    # Upgrade older databases: add the owner column if it's missing
    columns = [row[1] for row in conn.execute("PRAGMA table_info(plates)")]
    if "owner" not in columns:
        conn.execute("ALTER TABLE plates ADD COLUMN owner TEXT DEFAULT ''")
        conn.commit()
    return conn
 
 
def normalize(text):
    """Uppercase and strip everything except letters/digits."""
    return re.sub(r"[^A-Z0-9]", "", text.upper())
 
 
def add_plate(plate, owner=""):
    """Add a plate with an optional owner name. Returns the normalized plate,
    or None if it already exists or is empty."""
    plate = normalize(plate)
    if not plate or plate_exists(plate):
        return None
    conn = db_connect()
    with conn:
        conn.execute("INSERT INTO plates (plate, owner) VALUES (?, ?)",
                     (plate, owner.strip()))
    conn.close()
    return plate
 
 
def update_owner(plate, owner):
    conn = db_connect()
    with conn:
        conn.execute("UPDATE plates SET owner = ? WHERE plate = ?",
                     (owner.strip(), normalize(plate)))
    conn.close()
 
 
def get_owner(plate):
    """Return the owner name for a plate ('' if none or not found)."""
    conn = db_connect()
    row = conn.execute("SELECT owner FROM plates WHERE plate = ?",
                       (normalize(plate),)).fetchone()
    conn.close()
    return (row[0] or "") if row else ""
 
 
def remove_plate(plate):
    conn = db_connect()
    with conn:
        conn.execute("DELETE FROM plates WHERE plate = ?", (normalize(plate),))
    conn.close()
 
 
def plate_exists(plate):
    conn = db_connect()
    row = conn.execute(
        "SELECT 1 FROM plates WHERE plate = ?", (normalize(plate),)
    ).fetchone()
    conn.close()
    return row is not None
 
 
def list_plates(search=""):
    """Return (plate, owner, added_at) rows, filtered by plate or owner."""
    conn = db_connect()
    rows = conn.execute(
        """SELECT plate, COALESCE(owner, ''), added_at FROM plates
           WHERE plate LIKE ? OR owner LIKE ?
           ORDER BY plate""",
        (f"%{normalize(search)}%", f"%{search.strip()}%"),
    ).fetchall()
    conn.close()
    return rows
 
 
# ------------------------------ Themes -----------------------------------
THEMES = {
    "light": {
        "bg": "#f3f4f6", "fg": "#111827", "panel": "#ffffff",
        "entry_bg": "#ffffff", "border": "#d1d5db", "muted": "#6b7280",
        "btn_bg": "#e5e7eb", "btn_active": "#d1d5db",
        "accent": "#2563eb", "accent_active": "#1d4ed8", "accent_fg": "#ffffff",
        "sel_bg": "#2563eb", "sel_fg": "#ffffff", "head_bg": "#e5e7eb",
    },
    "dark": {
        "bg": "#1e1f24", "fg": "#e5e7eb", "panel": "#2a2c33",
        "entry_bg": "#33363e", "border": "#44474f", "muted": "#9ca3af",
        "btn_bg": "#3a3d46", "btn_active": "#4a4e58",
        "accent": "#3b82f6", "accent_active": "#2563eb", "accent_fg": "#ffffff",
        "sel_bg": "#3b82f6", "sel_fg": "#ffffff", "head_bg": "#33363e",
    },
}
 
 
def load_theme():
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            name = json.load(f).get("theme", "light")
        return name if name in THEMES else "light"
    except Exception:
        return "light"
 
 
def save_theme(name):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump({"theme": name}, f)
    except Exception:
        pass  # not being able to save the preference isn't a big deal
 
 
# ------------------------------- GUI -------------------------------------
class PlateDatabaseApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Plate Database Manager")
        self.geometry("1000x650")
        self.minsize(700, 500)
        self.theme_name = load_theme()
 
        # --- Header with theme switch ---
        header = ttk.Frame(self)
        header.pack(fill="x", padx=12, pady=(12, 0))
        ttk.Label(header, text="Plate Database Manager",
                  font=("Segoe UI", 16, "bold")).pack(side="left")
        self.theme_btn = ttk.Button(header, command=self.toggle_theme)
        self.theme_btn.pack(side="right")
 
        # --- Add section ---
        add_frame = ttk.LabelFrame(self, text="Register a vehicle")
        add_frame.pack(fill="x", padx=12, pady=(10, 6))
        add_frame.columnconfigure(0, weight=1)
        add_frame.columnconfigure(1, weight=1)
 
        ttk.Label(add_frame, text="Plate number").grid(
            row=0, column=0, sticky="w", padx=8, pady=(6, 0))
        ttk.Label(add_frame, text="Owner name").grid(
            row=0, column=1, sticky="w", padx=8, pady=(6, 0))
 
        self.plate_var = tk.StringVar()
        self.owner_var = tk.StringVar()
        plate_entry = ttk.Entry(add_frame, textvariable=self.plate_var,
                                font=("Segoe UI", 14))
        plate_entry.grid(row=1, column=0, sticky="ew", padx=8, pady=(0, 8))
        owner_entry = ttk.Entry(add_frame, textvariable=self.owner_var,
                                font=("Segoe UI", 14))
        owner_entry.grid(row=1, column=1, sticky="ew", padx=8, pady=(0, 8))
        ttk.Button(add_frame, text="Add", style="Accent.TButton",
                   command=self.on_add).grid(
            row=1, column=2, padx=(0, 8), pady=(0, 8))
 
        # Enter in plate box jumps to the name box; Enter in name box adds
        plate_entry.bind("<Return>", lambda e: owner_entry.focus())
        owner_entry.bind("<Return>", lambda e: self.on_add())
        plate_entry.focus()
        self.plate_entry = plate_entry
 
        # --- Search ---
        search_frame = ttk.Frame(self)
        search_frame.pack(fill="x", padx=12, pady=(6, 0))
        ttk.Label(search_frame, text="Search (plate or name):").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *a: self.refresh())
        ttk.Entry(search_frame, textvariable=self.search_var).pack(
            side="left", fill="x", expand=True, padx=6)
 
        # --- Table ---
        table_frame = ttk.Frame(self)
        table_frame.pack(fill="both", expand=True, padx=12, pady=8)
        self.tree = ttk.Treeview(table_frame,
                                 columns=("plate", "owner", "added"),
                                 show="headings", selectmode="extended")
        self.tree.heading("plate", text="Plate number")
        self.tree.heading("owner", text="Owner name")
        self.tree.heading("added", text="Date added")
        self.tree.column("plate", width=180)
        self.tree.column("owner", width=300)
        self.tree.column("added", width=200)
        scroll = ttk.Scrollbar(table_frame, orient="vertical",
                               command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.tree.bind("<Delete>", lambda e: self.on_remove())
        self.tree.bind("<Double-1>", lambda e: self.on_edit())
 
        # --- Buttons + status ---
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=(0, 6))
        ttk.Button(btn_frame, text="Edit name",
                   command=self.on_edit).pack(side="left")
        ttk.Button(btn_frame, text="Remove selected",
                   command=self.on_remove).pack(side="left", padx=6)
        ttk.Button(btn_frame, text="Refresh",
                   command=self.refresh).pack(side="left")
 
        self.status_var = tk.StringVar()
        ttk.Label(self, textvariable=self.status_var, style="Muted.TLabel",
                  anchor="w").pack(fill="x", padx=12, pady=(0, 10))
 
        self.apply_theme(self.theme_name)
        self.refresh()
 
    # ---- theme handling ----
    def apply_theme(self, name):
        c = THEMES[name]
        style = ttk.Style(self)
        style.theme_use("clam")   # 'clam' lets us color every widget
 
        self.configure(bg=c["bg"])
        style.configure(".", background=c["bg"], foreground=c["fg"],
                        fieldbackground=c["entry_bg"], bordercolor=c["border"],
                        lightcolor=c["border"], darkcolor=c["border"],
                        troughcolor=c["bg"], focuscolor=c["bg"])
        style.configure("TFrame", background=c["bg"])
        style.configure("TLabel", background=c["bg"], foreground=c["fg"])
        style.configure("Muted.TLabel", background=c["bg"],
                        foreground=c["muted"])
        style.configure("TLabelframe", background=c["bg"],
                        bordercolor=c["border"])
        style.configure("TLabelframe.Label", background=c["bg"],
                        foreground=c["fg"])
        style.configure("TEntry", fieldbackground=c["entry_bg"],
                        foreground=c["fg"], insertcolor=c["fg"],
                        bordercolor=c["border"])
        style.configure("TButton", background=c["btn_bg"],
                        foreground=c["fg"], bordercolor=c["border"],
                        focusthickness=0, padding=6)
        style.map("TButton", background=[("active", c["btn_active"])])
        style.configure("Accent.TButton", background=c["accent"],
                        foreground=c["accent_fg"], bordercolor=c["accent"])
        style.map("Accent.TButton",
                  background=[("active", c["accent_active"])])
        style.configure("Treeview", background=c["panel"],
                        fieldbackground=c["panel"], foreground=c["fg"],
                        bordercolor=c["border"], rowheight=28)
        style.map("Treeview",
                  background=[("selected", c["sel_bg"])],
                  foreground=[("selected", c["sel_fg"])])
        style.configure("Treeview.Heading", background=c["head_bg"],
                        foreground=c["fg"], relief="flat",
                        font=("Segoe UI", 10, "bold"))
        style.map("Treeview.Heading",
                  background=[("active", c["btn_active"])])
        style.configure("Vertical.TScrollbar", background=c["btn_bg"],
                        troughcolor=c["bg"], bordercolor=c["border"],
                        arrowcolor=c["fg"])
 
        self.theme_btn.configure(
            text="Light mode" if name == "dark"
            else "Dark mode")
 
    def toggle_theme(self):
        self.theme_name = "light" if self.theme_name == "dark" else "dark"
        self.apply_theme(self.theme_name)
        save_theme(self.theme_name)
 
    # ---- actions ----
    def refresh(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        rows = list_plates(self.search_var.get())
        for plate, owner, added in rows:
            self.tree.insert("", "end", values=(plate, owner, added))
        self.status_var.set(f"{len(rows)} plate(s) shown")
 
    def on_add(self):
        plate = normalize(self.plate_var.get())
        owner = self.owner_var.get().strip()
        if not plate:
            messagebox.showwarning("Empty", "Please type a plate number.")
            return
        if plate_exists(plate):
            messagebox.showinfo("Already registered",
                                f"{plate} is already in the database.")
            return
        add_plate(plate, owner)
        self.plate_var.set("")
        self.owner_var.set("")
        self.refresh()
        self.status_var.set(f"Added {plate}" + (f" ({owner})" if owner else ""))
        self.plate_entry.focus()
 
    def on_edit(self):
        selected = self.tree.selection()
        if len(selected) != 1:
            messagebox.showinfo("Select one",
                                "Click one plate in the list to edit its name.")
            return
        plate, owner, _ = self.tree.item(selected[0], "values")
        new_owner = simpledialog.askstring(
            "Edit owner name", f"Owner name for {plate}:",
            initialvalue=owner, parent=self)
        if new_owner is not None:
            update_owner(plate, new_owner)
            self.refresh()
            self.status_var.set(f"Updated name for {plate}")
 
    def on_remove(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("Nothing selected",
                                "Click a plate in the list first.")
            return
        plates = [self.tree.item(i, "values")[0] for i in selected]
        if messagebox.askyesno("Confirm",
                               f"Remove {len(plates)} plate(s)?\n\n"
                               + "\n".join(plates[:10])):
            for p in plates:
                remove_plate(p)
            self.refresh()
            self.status_var.set(f"Removed {len(plates)} plate(s)")
 
 
if __name__ == "__main__":
    PlateDatabaseApp().mainloop()