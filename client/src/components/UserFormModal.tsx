/**
 * Create / edit a user (Manajemen Pengguna). Dialog with per-field validation
 * that mirrors the server schema; the server still validates and enforces
 * uniqueness. Password is optional on edit (blank = unchanged) and is never
 * read back from the server.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { roleLabel } from "@/components/shell/role-label";
import {
  validateUserForm,
  type UserFormErrors,
  type UserFormValues,
} from "@/lib/userValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { TIER_LABEL, type AiraTier } from "@/lib/mcpEndpoint";
import { Field } from "@/components/shared";

interface RoleOption {
  key: string;
  name: string;
}

export interface EditableUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  supervisorId?: string | null;
  airaEnabled?: boolean;
  airaTier?: AiraTier;
  airaJabatan?: string | null;
}

const TIER_HINT: Record<AiraTier, string> = {
  read: "Agen hanya boleh membaca data.",
  standard:
    "Membaca dan membuat draf langsung; tindakan lain (posting, pembayaran, pembatalan) menunggu persetujuan manusia.",
  direct:
    "Tindakan tulis/kritis dijalankan langsung atas nama pengguna ini, tanpa persetujuan terpisah. Tetap tunduk pada hak akses perannya.",
};

const NO_SUPERVISOR = "__none";

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editUser?: EditableUser | null;
}

const emptyForm = (): UserFormValues => ({
  username: "",
  email: "",
  fullName: "",
  password: "",
  role: "Accountant",
});

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error || fallback;
}

export default function UserFormModal({
  isOpen,
  onClose,
  editUser,
}: UserFormModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent size="md">
        {/* Content unmounts when closed, so each opening starts from fresh state. */}
        <UserForm
          key={editUser?.id ?? "new"}
          editUser={editUser ?? null}
          onClose={onClose}
          onBusyChange={setBusy}
        />
      </DialogContent>
    </Dialog>
  );
}

interface UserFormProps {
  editUser: EditableUser | null;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

function UserForm({ editUser, onClose, onBusyChange }: UserFormProps) {
  const isEdit = !!editUser;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserFormValues>(() =>
    editUser
      ? {
          username: editUser.username,
          email: editUser.email,
          fullName: editUser.fullName,
          password: "",
          role: editUser.role,
        }
      : emptyForm(),
  );
  const [supervisorId, setSupervisorId] = useState<string>(
    editUser?.supervisorId ?? NO_SUPERVISOR,
  );
  const [airaEnabled, setAiraEnabled] = useState(editUser?.airaEnabled ?? false);
  const [airaTier, setAiraTier] = useState<AiraTier>(editUser?.airaTier ?? "standard");
  const [airaJabatan, setAiraJabatan] = useState(editUser?.airaJabatan ?? "");
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [submitError, setSubmitError] = useState("");

  // Daftar role dinamis (RBAC) untuk dropdown.
  const { data: roleOptions = [] } = useQuery<RoleOption[]>({
    queryKey: ["roles-assignable"],
    queryFn: async () => (await api.get("/roles/assignable")).data,
  });

  // Atasan langsung: approver tahap 1 Pengajuan Pembayaran (tidak boleh diri sendiri).
  const { data: supervisorOptions = [] } = useQuery<
    Array<{ id: string; fullName: string; isActive: boolean }>
  >({
    queryKey: ["users", "supervisor-options"],
    queryFn: async () =>
      (await api.get("/users", { params: { limit: 200, sort: "fullName" } })).data
        .data,
  });

  const set = (field: keyof UserFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | boolean | null>) =>
      isEdit
        ? api.put(`/users/${editUser!.id}`, payload)
        : api.post("/users", payload),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(
        isEdit ? "Data pengguna disimpan." : "Pengguna baru ditambahkan.",
      );
      onClose();
    },
    onError: (err) =>
      setSubmitError(apiError(err, "Gagal menyimpan data pengguna.")),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateUserForm(form, isEdit);
    setErrors(next);
    setSubmitError("");
    if (Object.keys(next).length > 0) return;
    const payload: Record<string, string | boolean | null> = {
      username: form.username.trim(),
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      role: form.role,
      supervisorId: supervisorId === NO_SUPERVISOR ? null : supervisorId,
      airaEnabled,
      airaTier,
      airaJabatan: airaJabatan.trim() || null,
    };
    if (form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  const roles: RoleOption[] =
    roleOptions.length > 0
      ? roleOptions
      : form.role
        ? [{ key: form.role, name: roleLabel(form.role) }]
        : [];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Ubah Pengguna" : "Tambah Pengguna"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? `Mengubah data akun ${editUser!.fullName}.`
            : "Buat akun baru untuk mengakses aplikasi."}
        </DialogDescription>
      </DialogHeader>

      <Field label="Nama lengkap" required error={errors.fullName}>
        <Input
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          autoComplete="off"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama pengguna"
          required
          error={errors.username}
          hint="Dipakai untuk masuk."
        >
          <Input
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
          />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="Peran" required error={errors.role}>
        {(control) => (
          <Select value={form.role} onValueChange={(v) => set("role", v)}>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Pilih peran" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name || roleLabel(r.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Atasan langsung"
        hint="Menyetujui Pengajuan Pembayaran pengguna ini sebelum Keuangan. Kosong = langsung ke Keuangan."
      >
        {(control) => (
          <Select value={supervisorId} onValueChange={setSupervisorId}>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Tidak ada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SUPERVISOR}>Tidak ada</SelectItem>
              {supervisorOptions
                .filter((u) => u.id !== editUser?.id && (u.isActive || u.id === supervisorId))
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Kata sandi"
        required={!isEdit}
        error={errors.password}
        hint={
          isEdit
            ? "Kosongkan jika tidak diubah. Minimal 8 karakter, huruf besar, angka dan karakter spesial."
            : "Minimal 8 karakter, berisi huruf besar, angka dan karakter spesial."
        }
      >
        <Input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <fieldset className="grid gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium text-foreground">AIRA (asisten AI)</legend>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p id="aira-enabled-label" className="text-sm font-medium text-foreground">
              Akses AIRA
            </p>
            <p id="aira-enabled-desc" className="mt-0.5 text-xs text-muted-foreground">
              Izinkan pengguna ini memakai AIRA (WhatsApp/Telegram/panel). Hak data tetap mengikuti peran.
            </p>
          </div>
          <Switch
            checked={airaEnabled}
            onCheckedChange={setAiraEnabled}
            aria-labelledby="aira-enabled-label"
            aria-describedby="aira-enabled-desc"
          />
        </div>
        {airaEnabled && (
          <>
            <Field label="Level akses AIRA" hint={TIER_HINT[airaTier]}>
              {(control) => (
                <Select value={airaTier} onValueChange={(v) => setAiraTier(v as AiraTier)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIER_LABEL) as AiraTier[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIER_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {airaTier === "direct" && (
              <p
                role="note"
                className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-text"
              >
                Perhatian: pada level Langsung, instruksi lewat AIRA dapat memposting transaksi tanpa
                persetujuan terpisah. Gunakan hanya untuk pengguna tepercaya.
              </p>
            )}
            <Field
              label="Jabatan AIRA"
              hint="Teks bebas (mis. Direktur Keuangan). Dibaca agen untuk menyesuaikan gaya bicara."
            >
              <Input
                value={airaJabatan}
                onChange={(e) => setAiraJabatan(e.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </Field>
          </>
        )}
      </fieldset>

      {submitError && (
        <p
          role="alert"
          className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          {submitError}
        </p>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Batal
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? "Simpan Perubahan" : "Tambah Pengguna"}
        </Button>
      </DialogFooter>
    </form>
  );
}
